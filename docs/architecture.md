# Architecture

## Inspection Result

The repository currently contains only Git metadata and the Phase 1 documentation. There is no existing Next.js app, Firebase configuration, package manager lockfile, or application source to preserve.

## Product Shape

YITA Iceberg is a branch-based operational system for sales, inventory control, and financial oversight. The core sale flow separates responsibilities across three operational users:

1. An order registrar creates or edits an unpaid order and reserves stock.
2. A cashier confirms one or more payment lines.
3. A release verifier validates payment or stamp evidence and completes the sale.

Admins and super admins manage cross-branch operations, products, stock policies, users, roles, reporting, reversals, and security settings.

## Target Runtime Architecture

```text
Browser / POS device
  |
  | Next.js client reads allowed operational data
  | Callable Cloud Functions perform sensitive writes
  v
Firebase Authentication
  |
Cloud Functions v2
  |
  | Firebase Admin SDK, Zod validation, transactions
  v
Cloud Firestore
Firebase Storage
Audit logs / stock ledger / reports
```

The frontend must assume it is untrusted. Totals, discounts, branch identifiers, role claims, stock quantities, order statuses, and payment state are recalculated or verified on the server.

## Firebase Products Used

- Firebase Authentication for sign-in identity.
- Firestore user documents for active status, roles, and branch assignments.
- Cloud Firestore for orders, inventory, stock movements, products, customers, payments, reversals, audit logs, and settings.
- Cloud Functions v2 for all sensitive mutations.
- Firebase Storage for payment proof uploads with authenticated, branch-aware access.
- Firebase App Check to reduce abuse in deployed environments.
- Firebase Emulator Suite for local development and tests.
- Firebase App Hosting / Google Cloud for production deployment.

## Branch Isolation Strategy

Branch isolation is enforced in three layers:

1. Firestore document structure stores branch-scoped operational data under branch identifiers or with required `branchId` fields.
2. Firestore and Storage rules restrict reads to assigned branches unless the user is `admin` or `super_admin`.
3. Cloud Functions re-read the authenticated user's server-side profile and reject unauthorized branch access before every mutation.

Users may be assigned to multiple branches, but branch access is always explicit through `users/{uid}.assignedBranchIds`.

## Role Model

Roles are stored server-side and may not be self-assigned from the client.

- `order_registrar`: create and edit unpaid orders, apply allowed discounts, view branch products.
- `cashier`: confirm payments and payment proofs for branch orders awaiting payment.
- `release_verifier`: complete release for paid orders without changing price, quantities, discounts, or payments.
- `branch_manager`: manage branch operations, approve higher discounts, cancel or reopen orders within rules, view branch activity.
- `admin`: manage products, branches, stock, users, reversals, corrections, and company-wide reports.
- `super_admin`: full platform access, role management, admin creation, security settings, and deployment settings.

## Order Workflow

```text
draft -> awaiting_payment -> awaiting_release -> completed
```

Additional terminal or corrective statuses:

```text
awaiting_discount_approval
cancelled
expired
reversed
partially_reversed
```

Payment settlement is tracked separately as `paymentStatus: unpaid | paid | credit`. Inventory is reserved only when an order enters `awaiting_payment`. Payment confirmation does not deduct stock. Release verification finalizes the sale by reducing both `reservedQty` and `onHandQty` in one transaction.

## Inventory Invariants

- `onHandQty` is physical stock currently controlled by the branch.
- `reservedQty` is stock committed to unpaid or paid-but-unreleased orders.
- Available stock is derived as `onHandQty - reservedQty`.
- `reservedQty` may never exceed `onHandQty`.
- No quantity may become negative.
- Inventory changes must produce stock movement records.
- Sensitive inventory changes must produce audit logs.
- The frontend cannot directly update inventory documents.

## Deployment Plan

Phase 2 introduces Firebase configuration, emulator setup, environment validation, and project scripts. Later phases add CI, App Check, Cloud Scheduler for stale order expiry, staging and production aliases, Firebase App Hosting configuration, monitoring, backup documentation, and deployment controls.

## Testing Strategy

- TypeScript checks for all app and function source.
- ESLint for frontend and functions code.
- Firestore and Storage rules tests in the Firebase Emulator Suite.
- Cloud Function integration tests for transactional inventory and order workflows.
- End-to-end vertical slice tests after operational screens exist.

During Phase 1, TypeScript and lint checks are not available because the project has not yet been scaffolded.

## Phase 5 Operational UI Slice

The first operational UI slice connects directly to Phase 4/5 callables and branch-scoped Firestore reads. The browser never writes orders, payments, inventory, stock movements, ledgers, audit logs, or proof-intent documents.

Screen groups:

- Registrar: order queue, order creation, unpaid edit/cancel, printable QR order slip, customer list/create.
- Manager/admin: discount approval and rejection actions in the order queue.
- Cashier: awaiting-payment queue, manual order lookup, multiple payment lines, transfer-proof upload intent, printable payment receipt.
- Release verifier: awaiting-release queue, QR payload validation, manual verification fallback, completed-sale confirmation.

The branch provider is shared by the shell. It auto-selects only one-branch operational users, preserves explicit branch preference locally, and requires admin/super-admin selection before operational activity. The backend treats this branch as an untrusted hint and repeats role and branch checks.
