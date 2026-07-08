# YITA Iceberg

YITA Iceberg is a multi-branch inventory, POS, sales-control, and finance-oversight web application.

The system is designed around a controlled three-step sale workflow:

```text
Order Registered -> Payment Confirmed -> Release Verified -> Sale Completed
```

Inventory is reserved when an order is created. Stock is only finally deducted when a release verifier completes the sale. All sensitive mutations must run through authenticated Cloud Functions with server-side role, branch, pricing, stock, payment, and status validation.

## Current Project Status

Phase 8 is implemented: the app now has authenticated operational screens, the three-step POS flow, branch inventory views, product catalog setup, stock receipts, adjustment requests, stock counts, protected valuation documents, completed-sale reversals, returns, refund records, credit corrections, dashboards, branch-scoped reports, CSV exports, and emulator-backed tests.

## Target Stack

- Next.js with TypeScript
- Tailwind CSS and shadcn/ui
- Firebase Authentication
- Cloud Firestore
- Cloud Functions for Firebase v2
- Firebase Storage
- Firebase App Check
- Firebase App Hosting / Google Cloud deployment
- Firebase Emulator Suite for local development and tests

## Proposed Project Structure

```text
app/                         Next.js App Router routes and route groups
components/                  Shared UI and shadcn/ui components
lib/
  auth/                      Auth guards and session helpers
  firebase/                  Client Firebase SDK setup
  server/                    Server-only Firebase Admin helpers
  validation/                Shared Zod schemas
  domain/                    Shared domain constants and policies
functions/                   Cloud Functions v2 source and tests
firebase/                    Optional Firebase-specific support files
tests/
  rules/                     Firestore and Storage rules tests
  emulator/                  Integration tests against emulators
docs/                        Architecture and operating documentation
firebase.json                Firebase project configuration
.firebaserc                  Firebase project aliases
firestore.rules              Firestore security rules
firestore.indexes.json       Firestore indexes
storage.rules                Firebase Storage rules
```

## Phase Documents

- [Architecture](docs/architecture.md)
- [Firestore Schema](docs/firestore-schema.md)
- [Order State Machine](docs/order-state-machine.md)
- [Security Model](docs/security-model.md)
- [Reporting](docs/reporting.md)
- [Development Plan](docs/development-plan.md)

## Local Commands

```bash
npm run dev
npm run dev:emulators
npm run typecheck
npm run lint
npm run build
npm run rules:test
npm run functions:test
npm run functions:typecheck
npm run functions:lint
npm run functions:build
npm run migrate:phase6
```

Phase 4-8 backend functions are covered by `npm run functions:test`, which runs against the Auth, Firestore, and Storage emulators. Firestore and Storage access rules are covered by `npm run rules:test`.

## Phase 5 Operational UI

Implemented operational routes:

- `/orders`, `/orders/new`, `/orders/[orderId]`, `/orders/[orderId]/edit`, `/orders/[orderId]/slip`
- `/customers`, `/customers/new`
- `/cashier`, `/cashier/orders/[orderId]`, `/cashier/orders/[orderId]/receipt`
- `/release`, `/release/orders/[orderId]`, `/release/orders/[orderId]/complete`

The active branch selector is visible in the app header. Single-branch operational users are automatically placed in their branch. Multi-branch users must choose. Admin and super-admin users must explicitly select a branch before operational activity; the selected branch is UI context only and every callable still verifies branch access server-side.

End-to-end emulator checklist:

1. Start Firebase emulators with `npm run dev:emulators`.
2. Start the app with `npm run dev`.
3. Sign in as an order registrar, select or confirm the branch, create an order from real branch products, and print the QR order slip.
4. Sign in as cashier, open `/cashier`, receive payment with one or more payment lines, upload transfer proof when branch settings require it, and print the receipt.
5. Sign in as release verifier, paste or scan the `YITA1|orderNumber|token` QR payload or use manual fallback with a reason, then complete release.
6. Confirm the order becomes `completed` and inventory is deducted only at release.

Frontend idempotency keys are generated once per intentional action and sent to callable functions. Browser totals are informative only; Cloud Functions return the authoritative state. Printable order slips, payment receipts, and release confirmations use browser print CSS.

## Phase 6 Inventory UI

Implemented inventory routes:

- `/inventory`, `/inventory/[productId]`
- `/inventory/receipts`, `/inventory/receipts/new`, `/inventory/receipts/[receiptId]`
- `/inventory/adjustments`, `/inventory/adjustments/new`, `/inventory/adjustments/[requestId]`
- `/inventory/counts`, `/inventory/counts/new`, `/inventory/counts/[stockCountId]`
- `/catalog/products`, `/catalog/products/new`, `/catalog/products/[productId]`
- `/catalog/branch-products`

Operational inventory is separated from protected finance data. Branch users can read branch inventory quantities and branch product selling prices. Protected minimum prices, default cost, average unit cost, and stock value live in `productControls` and `inventoryFinancials`; client reads are limited to admins where appropriate, and inventory operation documents with cost data are limited to branch managers/admins.

Stock receipts use weighted-average valuation. Stock-outs at release reduce inventory value using the current average unit cost. Adjustment approvals and stock count approvals are transactional, audited, idempotent, and cannot break existing reservations.

Run the Phase 6 migration only after reviewing existing data:

```bash
PHASE6_MIGRATION_CONFIRM=true npm run migrate:phase6
```

For production, also set Firebase Admin credentials and `PHASE6_ALLOW_PRODUCTION=true`. The script refuses production execution without that explicit override.

## Phase 7 Reversals UI

Implemented reversal routes:

- `/reversals`, `/reversals/new`, `/reversals/[reversalId]`, `/reversals/[reversalId]/approve`
- `/orders/[orderId]/reverse`

Completed sales are never deleted or directly edited. A reversal is a separate correction record in `saleReversals/{reversalId}`. The workflow is:

```text
requested -> approved -> completed
requested -> rejected
requested -> cancelled
```

Branch managers can request reversals for completed sales in their assigned branch. Admins and super-admins approve, reject, and complete reversals; branch managers can review/request but completion is admin-only in Phase 7. Completion records stock movements, financial transactions, audit logs, and idempotency records in one transaction.

Stock-return reversals increase `onHandQty` and `returnedQty`. No-stock-return reversals do not create physical stock. `soldQty` remains historical; `reversedSoldQty` tracks corrected sale quantity. Refunds are recorded only as financial correction records; the system does not send money.

## Phase 8 Dashboards And Reports

Implemented reporting routes:

- `/dashboard`
- `/reports`
- `/reports/sales`
- `/reports/payments`
- `/reports/inventory`
- `/reports/stock-movements`
- `/reports/reversals`
- `/reports/credit`
- `/reports/staff-activity`
- `/reports/low-stock`

Reports are loaded through callable functions, not direct client reads of protected ledgers. Every report validates the actor, role, branch scope, date range, pagination size, and filters server-side. Admin and super-admin users may choose all branches. Branch managers are restricted to assigned branches. Operational users get only limited dashboard/activity visibility and cannot access company financial analytics.

CSV export is implemented through `exportReport`. It returns server-authorized CSV content and a filename to the browser. The app does not create public Storage export files in this phase.

Phase 8 verification:

```text
npm run typecheck: passed
npm run lint: passed
npm run build: passed
npm run functions:typecheck: passed
npm run functions:lint: passed
npm run functions:build: passed
npm run rules:test: 1 file passed, 22 tests passed
npm run functions:test: 5 files passed, 51 tests passed
git diff --check: passed
```

## Super-Admin Bootstrap

The first super-admin is created by a local Admin SDK script only. It is not exposed through the web app, Firebase Hosting, or callable functions.

For local emulator use:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIREBASE_PROJECT_ID=yita-iceberg-dev \
BOOTSTRAP_SUPER_ADMIN_EMAIL=admin@example.com \
BOOTSTRAP_SUPER_ADMIN_NAME="YITA Super Admin" \
BOOTSTRAP_CONFIRM=true \
npm run bootstrap:super-admin
```

For production, set the same bootstrap variables plus server credentials through your secure environment. The script refuses to run unless `BOOTSTRAP_CONFIRM=true`. It also refuses to create another super-admin when one already exists unless `BOOTSTRAP_EMERGENCY_OVERRIDE=true` is explicitly provided.

The script creates the Firebase Auth user without logging secrets. Set or reset the user's password through Firebase Console or an approved administrative password reset process.

## Non-Negotiable Invariants

- Do not trust client-sent role, branch, price, quantity, discount, payment status, or order status.
- Do not allow direct client inventory writes.
- Do not expose cost, valuation, or protected minimum price fields to operational roles.
- Do not allow negative inventory.
- Store monetary values as integer kobo.
- Derive available stock as `onHandQty - reservedQty`.
- Do not edit completed orders.
- Do not undo completed sales; create separate reversal records.
- Do not delete orders, payments, stock movements, reversals, or audit logs.
- Use Firestore transactions for inventory-changing actions.
- Keep raw QR tokens out of persistent browser storage; hold them only short-lived in memory and reissue through a callable when needed.
- Write immutable audit logs for every sensitive action.
- Keep branch stock isolated by branch.

## Phase 4 Backend Functions

Implemented callable functions:

- `createCustomer`
- `updateCustomer`
- `createOrder`
- `updateUnpaidOrder`
- `cancelOrder`
- `requestDiscountApproval`
- `approveDiscount`
- `confirmPayment`
- `verifyAndCompleteRelease`
- `createPaymentProofUploadIntent`
- `reissueOrderQrToken`
- `validateReleaseQr`

## Phase 6 Inventory Functions

Implemented callable functions:

- `createProduct`, `updateProduct`, `archiveProduct`
- `addBranchProduct`, `updateBranchProductSettings`, `updateBranchProductPricing`
- `recordStockReceipt`
- `requestInventoryAdjustment`, `approveInventoryAdjustment`, `rejectInventoryAdjustment`
- `startStockCount`, `submitStockCount`, `approveStockCount`, `rejectStockCount`

## Phase 7 Reversal Functions

Implemented callable functions:

- `getReversalPreview`
- `createReversalRequest`
- `approveReversalRequest`
- `rejectReversalRequest`
- `cancelReversalRequest`
- `completeApprovedReversal`

## Phase 8 Reporting Functions

Implemented callable functions:

- `getDashboardSummary`
- `getSalesReport`
- `getPaymentReport`
- `getInventoryReport`
- `getStockMovementReport`
- `getReversalReport`
- `getCreditReport`
- `getStaffActivityReport`
- `getLowStockReport`
- `exportReport`
- `rebuildReportSummaries`

Implemented scheduled backend function:

- `expireStaleOrders`

Order fulfilment state and payment settlement state are separate:

```text
status: draft | awaiting_discount_approval | awaiting_payment | awaiting_release | completed | cancelled | expired | partially_reversed | reversed
paymentStatus: unpaid | paid | credit
```

## Environment Variables

Phase 2 will define validated environment variables. Expected categories:

- Public Firebase web config values exposed to the browser with `NEXT_PUBLIC_` prefixes.
- Server-only Firebase Admin configuration for Cloud Functions and privileged server contexts.
- App Check, emulator, and deployment toggles.
- Optional integration secrets stored outside frontend bundles.

Production secrets must never be committed to the repository.

## Manual Firebase Setup

- Enable Firebase Authentication Email/Password provider.
- Create Firebase projects or aliases matching `.firebaserc`, or update aliases to match your project IDs.
- Configure authorized domains for deployed sign-in.
- Enable Firestore, Storage, Functions, and App Check before production deployment.
- Keep production service account credentials outside frontend code and outside Git.
