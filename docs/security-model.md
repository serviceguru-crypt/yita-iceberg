# Security Model

## Trust Boundary

The browser is untrusted. It may render allowed data and submit user intent, but it cannot be trusted for:

- role
- branch access
- product price
- stock quantity
- discount authority
- payment state
- order status
- timestamps
- inventory movement data

Cloud Functions must re-read server-side user documents and business records before mutating data.

## Authentication

Firebase Authentication provides identity. Firestore `users/{uid}` documents provide application authorization:

```text
isActive
platformRole
assignedBranchIds
```

A signed-in user is not authorized unless their user document exists and `isActive` is true.

Next.js protected application routes use Firebase Admin session cookies. The client signs in with Firebase Auth, sends the ID token to `/api/auth/session`, and the server creates an HTTP-only `__session` cookie only after confirming the Firestore user profile exists and is active.

There is no public self-registration route. Staff accounts are provisioned by privileged server-side code.

## Authorization

Authorization is evaluated by:

1. Active user status.
2. Platform role.
3. Branch assignment.
4. Function-specific permission.
5. Current entity status.

Admins and super admins may cross branch boundaries where their role permits it. All other users are restricted to assigned branches.

Central permission helpers implement:

- `canAccessBranch(user, branchId)`
- `canManageUsers(user)`
- `canAssignRole(actor, targetRole)`
- `canAssignBranch(actor, branchId)`
- `canViewAuditLogs(user, branchId)`
- `canManageCompanySettings(user)`

`super_admin` can manage all roles. `admin` can manage users except `super_admin`. Branch managers and operational staff cannot provision or change users in Phase 3.

## Firestore Rules Strategy

Firestore rules should be least privilege:

- Users may read their own user profile.
- Branch users may read assigned branch metadata, branch products, branch inventory summaries, and relevant branch orders needed for their role.
- Operational users may not read protected minimum prices, default costs, average unit cost, stock value, stock receipts, or adjustment records with cost data.
- Branch managers/admins may read inventory operation records needed for receipts, adjustments, and stock counts.
- Direct writes to orders, payments, inventory, stock movements, reversals, audit logs, roles, and branch settings should be denied from the client except for carefully reviewed non-sensitive fields if ever needed.
- Audit logs and stock movements are append-only from trusted server code.
- Admin and super admin reads are broader but still authenticated and active.

Rules are not a replacement for Cloud Function authorization. They protect direct client access.

Phase 3 tests prove that assigned users can read only their branch inventory, cannot read another user's profile, cannot directly write inventory or orders, cannot edit their own role or branch assignment, and cannot create, edit, or delete audit logs.

## Cloud Function Security Pattern

Each callable function must:

1. Require authentication.
2. Load `users/{uid}`.
3. Confirm `isActive`.
4. Validate input with Zod.
5. Confirm branch access.
6. Confirm required role.
7. Recalculate or re-read sensitive values server-side.
8. Use Firestore transactions for stock, payment, status, role, or price mutations.
9. Use server timestamps.
10. Write an audit log.
11. Return safe typed responses and user-friendly errors.

Phase 3 callable functions are limited to identity and access management:

- `provisionUser`
- `updateUserProfile`
- `updateUserAccess`
- `deactivateUser`
- `reactivateUser`

Phase 4 adds transactional callable functions for customers, order reservation, payment confirmation, discount approval, release verification, and stale-order expiry. All money is stored as integer kobo. Direct client writes remain denied for orders, payments, financial transactions, inventory, stock movements, audit logs, branch pricing, and idempotency records.

Phase 6 adds inventory management callables for product catalog setup, branch product controls, stock receipts, inventory adjustments, and stock counts. Operational inventory documents are separated from protected cost/valuation documents. Product controls and inventory financials are client-read restricted, and all writes remain callable-only.

Phase 7 adds reversal callables for preview, request, approval, rejection, cancellation, and completion. Reversals are callable-only writes. Completion performs stock, valuation, financial, customer credit, order-status, stock movement, and audit changes in one transaction.

Phase 8 adds report callables for dashboard summaries, sales, payments, inventory, stock movements, reversals, credit, staff activity, low stock, CSV export, and manual summary rebuild previews. Report callables are read-only but still enforce authentication, active user profile, role, branch scope, date range, pagination, and sensitive-field restrictions server-side.

Orders use separate fulfilment and payment state:

```text
status: draft | awaiting_discount_approval | awaiting_payment | awaiting_release | completed | cancelled | expired | partially_reversed | reversed
paymentStatus: unpaid | paid | credit
```

## Storage Security

Payment proofs are private operational records. Firebase Storage rules should require authentication and branch authorization. Uploads should be tied to a pending payment flow and should not be publicly readable.

Recommended storage path:

```text
payment-proofs/{branchId}/{orderId}/{paymentId}/{fileName}
```

Reads require an active user with branch access and an appropriate operational role. Writes are restricted to cashier, branch manager, admin, and super admin users for the matching branch. Uploads are limited to images and PDFs under 10 MB.

Phase 5 enforces a server-issued upload-intent pattern:

1. `createPaymentProofUploadIntent` validates role, branch access, order state, file type, and size.
2. The callable creates `paymentProofUploadIntents/{paymentId}` with the exact Storage path and expected metadata.
3. Storage rules allow upload only by the creating user, to the issued path, with matching content type, size, and custom metadata.
4. `confirmPayment` verifies the intent, file metadata, branch/order binding, and consumes the intent before confirming payment.
5. Raw proof paths are not shown on receipts.

## QR Security

Order QR payloads use `YITA1|orderNumber|rawToken`. The payload does not include customer, price, payment, branch address, or staff details. Firestore stores only `qrTokenHash` and `qrTokenVersion`.

The raw token is returned only from `createOrder` or `reissueOrderQrToken`, held only in short-lived in-memory browser state for immediate printing, and never placed in URLs, `sessionStorage`, or `localStorage`. If the slip must be printed again after that memory state is gone, the app calls `reissueOrderQrToken`, which rotates the hash and invalidates the previous QR token. `validateReleaseQr` provides a read-only release preview, while `verifyAndCompleteRelease` performs the final idempotent mutation.

## Inventory Security

The browser never writes catalog, branch product, inventory, product control, financial, receipt, adjustment, stock count, movement, or audit documents directly. All inventory-changing actions must:

1. Confirm actor role and branch access.
2. Read the current product/inventory/control records server-side.
3. Reject stale or invalid states.
4. Mutate operational quantity and protected valuation documents in the same transaction.
5. Write stock movements, audit logs, and idempotency records.

Stock receipt and increase-adjustment unit costs are restricted to branch manager/admin workflows. Admin users can inspect valuation data; operational POS users see only product, quantity, reserved, available, and low-stock information.

## App Check

App Check should be enabled for deployed environments and configurable for local emulator development. Local development must not be blocked by production App Check enforcement.

## Audit Logging

Every sensitive action creates an immutable audit log:

```text
actorId
actorRole
branchId
action
entityType
entityId
before
after
metadata
createdAt
```

Sensitive actions include order creation, order edits, payment confirmation, release completion, cancellation, expiry, reversals, stock adjustment, role assignment, branch assignment, product updates, price updates, and settings changes.

Reversal audit logs are required for request, approval, rejection, cancellation, and completion. They must not contain raw QR tokens or secrets.

## Idempotency

Inventory-changing and payment-changing functions must accept or derive idempotency keys so retries do not duplicate movements, payments, or status transitions.

Examples:

- `createOrder` should avoid double reservations for the same client request.
- `confirmPayment` should avoid duplicate payment lines on retry.
- `verifyAndCompleteRelease` should reject or safely return completed state for duplicate release attempts.
- `completeApprovedReversal` should safely return the original completion response for duplicate completion attempts and must not double-return stock or duplicate refund records.

## Reversal Security

Default Phase 7 role policy:

- Branch managers can request reversals for completed sales in assigned branches.
- Branch managers can review requests but cannot complete stock/financial effects.
- Admins and super-admins can request, approve, reject, cancel, and complete reversals.
- Operational roles can read assigned-branch reversal status but cannot mutate reversals.
- A branch manager cannot approve their own request. Admin/super-admin self-approval is allowed only with `selfApproved` metadata and audit logging.

Clients cannot directly create, update, or delete `saleReversals`, reversal stock movements, financial transactions, or audit logs. Firestore rules allow only branch-scoped reads. All sensitive mutation is performed by Cloud Functions with server-side role, branch, status, quantity, refund, and credit validation.

Known limitation: Phase 7 records refund intent/impact but does not integrate with external payment rails. Actual cash/bank/POS refund execution remains an operational process outside the app.

## Reporting Security

Report screens do not trust branch IDs selected in the UI. The server resolves the actor from `users/{uid}` and rejects cross-branch or all-branch requests unless the actor is admin/super-admin. Branch managers can access assigned-branch analytics. Operational staff cannot access company financial analytics; they may view limited own-activity/dashboard data where exposed.

Inventory cost, valuation, protected prices, raw payment-proof paths, raw QR tokens, session data, and unrestricted audit payloads are not returned by report callables to unauthorized roles. Payment reports expose proof status only as `proof attached`, `not attached`, or `not required`.

CSV exports are generated from the same callable-enforced report data and are limited to 31 days. Phase 8 returns CSV content directly to the browser and does not create public Storage objects. Firestore `reportExports` metadata and Storage `report-exports/**` are private/denied to clients by default.

## Environment and Secret Handling

Public Firebase web config values may be exposed through `NEXT_PUBLIC_` variables. Server credentials, Admin SDK configuration, payment secrets, private keys, and production environment values must never be shipped in frontend bundles or committed to source control.
