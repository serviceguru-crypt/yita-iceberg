# Development Plan

The project will be built in controlled phases. Security, auditability, and inventory consistency come before dashboards and visual polish.

## Phase 1 - Project Inspection and Architecture

Status: complete after this documentation is committed.

Created files:

- `README.md`
- `docs/architecture.md`
- `docs/firestore-schema.md`
- `docs/order-state-machine.md`
- `docs/security-model.md`
- `docs/development-plan.md`

Checks:

- Confirm files exist.
- Run `git diff --check`.
- TypeScript, linting, and automated tests are not available until Phase 2 scaffolding creates the application and package scripts.

## Phase 2 - Firebase Foundation

Implement:

- Next.js with TypeScript project scaffold.
- Tailwind CSS and shadcn/ui baseline.
- Firebase client SDK setup.
- Firebase Admin SDK server-only setup.
- Firebase Emulator Suite configuration.
- Environment variable validation.
- `firebase.json`.
- `.firebaserc`.
- `firestore.rules`.
- `firestore.indexes.json`.
- `storage.rules`.
- Functions project structure.
- Scripts for development, emulators, rules tests, function tests, linting, type checking, build, and deployment.

Testing:

- Install dependencies.
- Run TypeScript checks.
- Run linting.
- Run production build.
- Run Firebase emulator startup smoke check if possible.

## Phase 3 - Authentication, Users, Roles, and Branch Access

Status: complete after Phase 3 checks pass.

Implement:

- Sign-in and sign-out.
- Protected routes.
- Role-aware navigation.
- Secure user provisioning.
- Branch assignment flow.
- Safe initial super-admin bootstrap not exposed in production UI.
- Firestore rules for users, branches, products, inventory, orders, payments, audit logs, and stock movements.
- Emulator tests proving branch isolation.

Testing:

- Rules tests for unauthorized users, inactive users, same-branch access, cross-branch denial, admin access, and super-admin access.
- Function tests for user provisioning, role assignment, self-access denial, audit logging, branch validation, inactive caller denial, and custom-claim synchronization.

## Phase 4 - Backend Domain Logic

Status: complete after Phase 4 checks pass.

Implement Cloud Functions first:

- `createOrder`
- `updateUnpaidOrder`
- `cancelOrder`
- `confirmPayment`
- `verifyAndCompleteRelease`

Then continue:

- `expireStaleOrders`
- `requestDiscountApproval`
- `approveDiscount`
- `reverseCompletedSale`
- `adjustInventory`
- `createCustomer`
- `updateCustomer`
- `createBranch`
- `updateBranch`
- `createProduct`
- `updateBranchProductPrice`
- `assignUserRole`
- `assignUserToBranch`

Testing:

- Insufficient stock.
- Concurrent orders for the same product.
- Editing quantity upward and downward.
- Cancelled order stock release.
- Payment confirmation.
- Incorrect payment total.
- Unauthorized payment confirmation.
- Release before payment.
- Double-release prevention.
- Retry/idempotency.
- Branch access denial.
- Tampered client price denial.
- Payment confirmation and exact-total validation.
- QR/manual release verification.
- Idempotent create, payment, and release retries.
- Immutable stock movement, financial transaction, and audit log creation.

## Phase 5 - Operational Screens: First End-to-End Vertical Slice

Build only after backend functions and tests work:

- Sign-in page.
- Role-aware dashboard shell.
- Order registration page.
- Product search and cart.
- Customer selector with fast walk-in option.
- Discount approval UI.
- Order QR slip and printable receipt.
- Cashier payment-confirmation page.
- Payment receipt page.
- Release-verification page.
- Completed-sale confirmation page.

Required vertical slice:

```text
Create order -> reserve stock -> confirm payment -> verify release -> complete sale
```

Use real Firebase data, not mock data.

## Phase 6 - Inventory Management

Build:

- Branch inventory dashboard.
- Stock receipt form.
- Stock adjustment form with approval and reason.
- Low-stock alerts.
- Stock movement ledger.
- Inventory valuation.
- Product management.
- Branch product price management.

All stock adjustments must use server-side functions and audit logs.

## Phase 7 - Reversals and Returns

Build:

- Completed-sale reversal request screen.
- Partial return workflow.
- Full return workflow.
- Stock-return selection.
- Refund recording.
- Approval workflow.
- Reversal audit screen.

## Phase 8 - Dashboards and Reports

Build role-specific dashboards.

Admin dashboard should include:

- Sales today.
- Sales by branch.
- Cash payments.
- Transfers.
- POS payments.
- Credit sales.
- Discounts.
- Reversals.
- Pending unpaid orders.
- Paid but unreleased orders.
- Low-stock products.
- Stock value.
- Best-selling products.
- Staff activity.

Reports must use pagination, date filters, and aggregation strategy instead of expensive unbounded reads.

## Phase 9 - Production Readiness

Before deployment:

- Add loading, empty, error, offline, and permission-denied states.
- Add toast notifications and action confirmations.
- Add audit-log viewer for admin.
- Add required Firestore indexes.
- Add Cloud Scheduler function for stale-order expiry.
- Add App Check configuration.
- Add error monitoring and structured logs.
- Add rate limiting or abuse controls.
- Add backup and recovery documentation.
- Add local emulator and production environment configuration.
- Add Firebase App Hosting configuration.
- Add GitHub Actions CI for lint, type check, tests, and build.
