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

Completed sales are corrected through reversal records, not by undoing or deleting the original order. A completed order may later move to `partially_reversed` or `reversed` only after a separate `saleReversals/{reversalId}` record is approved and completed.

## Inventory Invariants

- `onHandQty` is physical stock currently controlled by the branch.
- `reservedQty` is stock committed to unpaid or paid-but-unreleased orders.
- Available stock is derived as `onHandQty - reservedQty`.
- `reservedQty` may never exceed `onHandQty`.
- No quantity may become negative.
- Inventory changes must produce stock movement records.
- Sensitive inventory changes must produce audit logs.
- The frontend cannot directly update inventory documents.
- Operational inventory quantity data is separated from protected cost and valuation data.
- Weighted average cost is updated by stock receipts and stock increases.
- Stock-outs, damage write-offs, decreases, and negative count reconciliations reduce value using the current average unit cost.

## Inventory Management

Global catalog records live in `products/{productId}` and are managed by admin/super-admin users. Branch sellable records live in `branches/{branchId}/products/{productId}` and contain only operational product data plus selling price. Protected branch controls live in `branches/{branchId}/productControls/{productId}` and are writable only through callables.

Branch inventory is split:

- `branches/{branchId}/inventory/{productId}`: operational quantities, low-stock state, SKU/name/unit snapshot.
- `branches/{branchId}/inventoryFinancials/{productId}`: average unit cost and stock value.

Receipts, adjustments, and stock counts are manager/admin workflows. Requests are idempotent and audited. Approval steps perform the stock mutation inside Firestore transactions and write stock movement records.

## Reversal Management

Phase 7 adds controlled sale reversals, partial returns, refund records, and credit corrections. Reversals use a request/review/complete workflow:

```text
requested -> approved -> completed
requested -> rejected
requested -> cancelled
```

The original order, payments, release metadata, stock-out movements, financial transactions, and audit logs remain immutable. Completion writes new correction records:

- `saleReversals/{reversalId}` for the business correction.
- `stockMovements` with `sale_returned` or `sale_reversed_no_stock_return`.
- `financialTransactions` with `sale_refund`, `credit_reduction`, or `reversal_adjustment`.
- `auditLogs` for request, approval, rejection, cancellation, and completion.

Stock returns increase `onHandQty` and `returnedQty`. No-stock reversals never create physical inventory. `soldQty` remains historical and `reversedSoldQty` records corrected sale quantity.

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

## Phase 6 Inventory UI Slice

Phase 6 adds operational inventory list/detail screens, branch manager/admin stock receipts, inventory adjustment requests, stock counts, and admin catalog setup. Operational users can view branch stock without cost or valuation. Branch managers can post receipts and request controlled stock changes. Admins approve adjustments/counts and can view valuation panels.

## Phase 7 Reversal UI Slice

Phase 7 adds reversal list, request, detail, and review screens. The create flow loads a server preview for completed or partially reversed orders, displays remaining reversible quantities, and submits a request. Approval and completion actions are role-gated in the UI and enforced again by Cloud Functions.

## Phase 8 Reporting Slice

Phase 8 adds the business intelligence layer. The browser uses callable functions for dashboard summaries, report tables, and CSV export; it does not scan protected business collections directly for analytics. Report callables enforce role, branch, date range, pagination, and filter validation before reading ledgers.

Screen groups:

- Dashboard: role-aware operational summary for today.
- Sales, payments, reversals, credit, staff activity, stock movement, inventory, and low-stock reports.
- CSV export generated from the same server-authorized rows shown in the report.

Current aggregation strategy is live bounded reads over indexed ledgers with hard date-range limits. The schema reserves `reportSummaries/{summaryId}` for daily/monthly branch and company summaries; client writes are denied. `rebuildReportSummaries` currently returns a manually generated summary snapshot and is reserved for later scheduled/materialized summary work without starting deployment or scheduler hardening.

## Phase 9 Production Readiness Slice

Phase 9 adds production separation and operations readiness:

- Local, staging, and production environment examples.
- Firebase App Hosting runtime config for the Next.js app.
- Cloud Functions runtime options, structured logging, and App Check-ready callable options.
- Scheduled stale-order expiry and report-summary rebuild jobs.
- CI and manual deploy workflows.
- Backup, monitoring, release, smoke-test, and incident runbooks.

The web app deploys through Firebase App Hosting. Firestore rules, Storage rules, indexes, and Cloud Functions deploy through Firebase CLI using project aliases. Production deploys require manual approval and must not bootstrap users or run migrations automatically.
