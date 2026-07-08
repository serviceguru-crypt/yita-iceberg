# Order State Machine

Order fulfilment state and payment settlement state are separate.

## Order Statuses

```text
draft
awaiting_discount_approval
awaiting_payment
awaiting_release
completed
cancelled
expired
partially_reversed
reversed
```

## Payment Statuses

```text
unpaid
paid
credit
```

`awaiting_payment` means stock is reserved and payment is not yet confirmed. `awaiting_release` means payment is confirmed and goods have not yet been released. `completed` means release was verified and stock was finally deducted.

`draft` and `awaiting_discount_approval` must not reserve stock.

## Allowed Order Transitions

```text
draft -> awaiting_discount_approval
draft -> awaiting_payment
awaiting_discount_approval -> awaiting_payment
awaiting_discount_approval -> cancelled
awaiting_payment -> awaiting_release
awaiting_payment -> cancelled
awaiting_payment -> expired
awaiting_release -> completed
completed -> partially_reversed
completed -> reversed
partially_reversed -> reversed
```

Reversal states remain in the model, but reversal functions are deferred until Phase 7.

## Transition Rules

### `draft -> awaiting_payment`

Triggered by `createOrder` when discount approval is not required.

- Validate authenticated active user.
- Validate branch access and registrar-capable role.
- Read branch product prices and inventory server-side.
- Recalculate all totals in kobo server-side.
- Validate discount permissions and branch settings.
- Reserve stock by increasing `reservedQty`.
- Create `reservation_created` stock movement records.
- Create audit log.
- Store only `qrTokenHash`; return the raw QR token once.

### `draft -> awaiting_discount_approval`

Triggered by `createOrder` when requested discounts exceed registrar authority.

- Build the order server-side.
- Do not reserve stock.
- Set `paymentStatus: unpaid`.
- Create audit log.

### `awaiting_discount_approval -> awaiting_payment`

Triggered by `approveDiscount`.

- Only branch manager, admin, or super admin.
- Recheck stock availability at approval time.
- Reserve stock transactionally.
- Mark discount approval approved.
- Create stock movement and audit log.

### `awaiting_payment -> awaiting_release`

Triggered by `confirmPayment`.

- Only cashier, branch manager, admin, or super admin.
- Confirm exact payment-line total.
- Create payment records and financial transaction records.
- For credit, validate registered customer and credit limit.
- Set `paymentStatus` to `paid` or `credit`.
- Do not deduct stock.
- Create audit log.

### `awaiting_release -> completed`

Triggered by `verifyAndCompleteRelease`.

- Only release verifier, branch manager, admin, or super admin.
- Verify QR token or require manual-verification reason.
- In one transaction:
  - reduce `reservedQty`
  - reduce `onHandQty`
  - increase `soldQty`
  - reduce `inventoryFinancials.stockValueKobo` using current average unit cost
  - create `stock_out` movement records
  - mark order `completed`
  - save release actor and server timestamp
  - create audit log

### `awaiting_payment -> cancelled`

Triggered by `cancelOrder`.

- Require cancellation reason.
- Release reserved stock.
- Mark order `cancelled`.
- Create `reservation_released` movements and audit log.

### `awaiting_payment -> expired`

Triggered by scheduled `expireStaleOrders`.

- Select bounded batches of expired awaiting-payment orders.
- Release reserved stock transactionally.
- Mark order `expired`.
- Create stock movement records and audit logs.

## Invalid Transitions

Examples of rejected transitions:

```text
awaiting_payment -> completed
awaiting_release -> cancelled
completed -> awaiting_payment
completed -> cancelled
expired -> awaiting_release
cancelled -> awaiting_release
reversed -> completed
```

Completed orders cannot be edited. Reversals and corrections must be modeled as separate records and movements.

## QR Token Policy

QR codes contain only a safe verification payload with order number and opaque token. They must not expose customer details, payment details, pricing internals, or staff information.

Only the token hash is stored. The raw token is returned only to the authorized order-creation response.

Phase 5 adds `reissueOrderQrToken` for secure reprints while an order is unpaid. Reissue increments `qrTokenVersion`, replaces `qrTokenHash`, invalidates the previous QR token, and records an audit log without storing the raw token.

Release QR preview uses `validateReleaseQr`. It validates the token hash and branch access server-side, returns only minimal release data, and does not mutate inventory or order status.

Phase 6 keeps raw QR tokens out of persistent browser storage. The frontend holds tokens only in short-lived module memory for immediate print/release flows. If memory is gone, a new token must be issued by `reissueOrderQrToken`.

## Phase 5 Receipt Points

- Order slips are printable while the order is unpaid and include `YITA1|{orderNumber}|{rawToken}` as the QR payload.
- Payment receipts are printed after `confirmPayment` moves the order to `awaiting_release`.
- Completed release confirmation is printed after `verifyAndCompleteRelease` moves the order to `completed`.
