# YITA Iceberg

YITA Iceberg is a multi-branch inventory, POS, sales-control, and finance-oversight web application.

The system is designed around a controlled three-step sale workflow:

```text
Order Registered -> Payment Confirmed -> Release Verified -> Sale Completed
```

Inventory is reserved when an order is created. Stock is only finally deducted when a release verifier completes the sale. All sensitive mutations must run through authenticated Cloud Functions with server-side role, branch, pricing, stock, payment, and status validation.

## Current Project Status

This repository was inspected on 2026-07-06. It is a fresh Git repository with no application files, package manager metadata, Firebase configuration, or existing source code.

Phase 1 creates the architecture documentation only. Application scaffolding starts in Phase 2.

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
```

Phase 4/5 backend functions are covered by `npm run functions:test`, which runs against the Auth, Firestore, and Storage emulators. Firestore and Storage access rules are covered by `npm run rules:test`.

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
- Do not allow negative inventory.
- Store monetary values as integer kobo.
- Derive available stock as `onHandQty - reservedQty`.
- Do not edit completed orders.
- Do not delete orders, payments, stock movements, reversals, or audit logs.
- Use Firestore transactions for inventory-changing actions.
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
