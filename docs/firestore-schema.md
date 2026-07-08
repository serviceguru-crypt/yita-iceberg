# Firestore Schema

This schema is the initial source of truth for Phase 2 and later implementation. Any structural change must preserve branch isolation, auditability, and transactional inventory consistency.

## Collections

```text
users/{uid}
  displayName
  email
  phone
  isActive
  platformRole
  assignedBranchIds
  createdAt
  updatedAt
  createdBy
  updatedBy

branches/{branchId}
  name
  code
  address
  phone
  isActive
  settings
  createdAt
  updatedAt

products/{productId}
  sku
  name
  description
  categoryId
  unit
  barcode
  imageUrl
  isActive
  createdAt
  updatedAt

branches/{branchId}/products/{productId}
  productId
  sku
  name
  description
  categoryId
  unit
  barcode
  sellingPriceKobo
  isActive
  updatedAt
  updatedBy

branches/{branchId}/productControls/{productId}
  productId
  minimumPriceKobo
  defaultCostPriceKobo
  updatedAt
  updatedBy

branches/{branchId}/inventory/{productId}
  productId
  sku
  productName
  unit
  onHandQty
  reservedQty
  soldQty
  damagedQty
  returnedQty
  reorderLevel
  isLowStock
  isActive
  updatedAt
  updatedBy

branches/{branchId}/inventoryFinancials/{productId}
  productId
  averageUnitCostKobo
  stockValueKobo
  updatedAt
  updatedBy

customers/{customerId}
  name
  phone
  address
  branchId
  creditLimit
  outstandingBalance
  isActive
  createdAt
  updatedAt

orders/{orderId}
  orderNumber
  branchId
  customerType
  customerId
  customerSnapshot
  status
  paymentStatus
  items[]
  subtotalKobo
  discountTotalKobo
  grandTotalKobo
  discountApprovalStatus
  discountRequest
  createdBy
  createdAt
  updatedAt
  updatedBy
  expiresAt
  paidAt
  paidBy
  releasedAt
  releasedBy
  cancelledAt
  cancelledBy
  cancellationReason
  qrTokenHash
  qrTokenVersion
  idempotencyKeyHash

orders/{orderId}/payments/{paymentId}
  branchId
  orderId
  paymentMethod
  amountKobo
  reference
  proofStoragePath
  proofRequired
  receivedBy
  receivedAt
  status
  idempotencyKeyHash

financialTransactions/{transactionId}
  branchId
  orderId
  paymentId
  transactionType
  paymentMethod
  amountKobo
  direction
  reference
  receivedBy
  createdAt
  idempotencyKeyHash

stockMovements/{movementId}
  branchId
  productId
  orderId
  stockReceiptId
  adjustmentRequestId
  stockCountId
  movementType
  quantity
  onHandBefore
  onHandAfter
  reservedBefore
  reservedAfter
  reason
  performedBy
  createdAt
  idempotencyKeyHash

stockReceipts/{receiptId}
  receiptNumber
  branchId
  supplierName
  supplierReference
  deliveryReference
  notes
  items[]
  totalValueKobo
  status
  receivedBy
  receivedAt
  createdBy
  createdAt
  idempotencyKeyHash

inventoryAdjustmentRequests/{requestId}
  branchId
  productId
  adjustmentType
  quantity
  unitCostKobo
  reason
  supportingReference
  status
  requestedBy
  requestedAt
  reviewedBy
  reviewedAt
  reviewReason
  postedMovementId
  idempotencyKeyHash

stockCounts/{stockCountId}
  stockCountNumber
  branchId
  status
  productIds
  startedBy
  startedAt
  submittedBy
  submittedAt
  reviewedBy
  reviewedAt
  reviewReason
  createdAt
  updatedAt
  idempotencyKeyHash

stockCounts/{stockCountId}/items/{productId}
  productId
  expectedOnHandQtyAtStart
  countedQty
  differenceQty
  status
  countedBy
  countedAt

saleReversals/{reversalId}
  orderId
  orderNumber
  branchId
  reversalNumber
  reversalType
  status
  reason
  internalNote
  items[]
  originalOrderTotalKobo
  reversalSubtotalKobo
  refundAmountKobo
  refundMethod
  creditReductionKobo
  stockReturnRequired
  stockReturned
  financialImpact
  requestedBy
  requestedAt
  approvedBy
  approvedAt
  approvalNote
  rejectedBy
  rejectedAt
  rejectionReason
  completedBy
  completedAt
  cancelledBy
  cancelledAt
  cancellationReason
  idempotencyKeyHash
  createdAt
  updatedAt

auditLogs/{auditId}
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

settings/company
settings/branches/{branchId}

idempotencyRecords/{actorUid_operation_keyHash}
  actorId
  operation
  keyHash
  entityId
  responseSnapshot
  createdAt
  expiresAt

paymentProofUploadIntents/{paymentId}
  paymentId
  branchId
  orderId
  storagePath
  contentType
  sizeBytes
  createdBy
  createdAt
  expiresAt
  consumed
  consumedAt
  idempotencyKeyHash

reportSummaries/{summaryId}
  branchId
  periodType
  periodKey
  grossSalesKobo
  netSalesKobo
  paymentReceivedKobo
  creditSalesKobo
  refundsKobo
  reversalValueKobo
  orderCount
  completedOrderCount
  cancelledOrderCount
  expiredOrderCount
  reversedOrderCount
  partiallyReversedOrderCount
  cashReceivedKobo
  transferReceivedKobo
  posReceivedKobo
  lowStockCount
  stockValueKobo
  updatedAt
  generatedBy

reportExports/{exportId}
  branchId
  reportType
  storagePath
  createdBy
  createdAt
  expiresAt
```

## Order Item Snapshot

Each order item should preserve the sale-time pricing context:

```text
productId
sku
name
unit
quantity
originalUnitPrice
finalUnitPrice
lineSubtotalKobo
lineDiscountKobo
lineTotalKobo
discountPercent
discountReason
discountAppliedBy
discountApprovedBy
discountApprovedAt
```

Historical order item data must not be silently changed when product names or prices change later.

## Branch Settings

Branch settings should include:

```text
registrarMaximumDiscountPercent
managerApprovalThresholdPercent
requireDiscountReason
requireTransferProof
allowCreditSales
allowSplitPayments
orderExpiryMinutes
```

## Payment Methods

Supported payment methods:

```text
cash
bank_transfer
pos_terminal
credit
```

Split or mixed payment is derived from multiple payment records. Payment confirmation can include multiple payment documents. An order moves to `awaiting_release` only when confirmed payment lines equal `grandTotalKobo`, except for approved credit sales.

## Stock Movement Types

Initial movement types:

```text
reservation_created
reservation_adjusted
reservation_released
stock_out
stock_received
inventory_increase_adjustment
inventory_decrease_adjustment
damage_write_off
stock_count_reconciliation
sale_returned
sale_reversed_no_stock_return
```

The stock movement ledger is append-only. Corrections create new movement records instead of editing or deleting historical entries.

## Query and Reporting Notes

Reports must avoid unbounded reads. Operational queries should use branch, status, and date filters with pagination. Higher-level dashboards should use aggregation documents or scheduled rollups once reporting requirements stabilize.

Phase 8 report callables read from `orders`, `orders/{orderId}/payments`, `financialTransactions`, `saleReversals`, `stockMovements`, `auditLogs`, and branch inventory subcollections. Each report validates branch scope server-side and returns sanitized rows.

Reserved summary document IDs:

```text
reportSummaries/dailyBranch_{branchId}_{yyyyMMdd}
reportSummaries/dailyCompany_{yyyyMMdd}
reportSummaries/monthlyBranch_{branchId}_{yyyyMM}
reportSummaries/monthlyCompany_{yyyyMM}
```

Client writes to `reportSummaries` and `reportExports` are denied. Company summary documents without `branchId` are admin/super-admin readable only. Branch summary documents are branch-scoped, while protected valuation fields remain exposed through report callables only when the actor is authorized.

## Phase 5 Operational Query Notes

Operational screens use bounded branch-scoped reads:

- Orders filter by `branchId`, `status`, and recent `createdAt`.
- Cashier queues read only `awaiting_payment`.
- Release queues read only `awaiting_release`.
- Product and inventory reads are limited to the active branch.
- Customer reads are limited to active customers in the selected branch.

`paymentProofUploadIntents` is a server-owned collection. Clients do not read or write it directly; callable functions create and consume intents.

## Phase 6 Inventory Notes

`branches/{branchId}/inventory/{productId}` is operational only and must not contain cost, protected minimum price, or valuation fields. Cost and valuation are split into:

- `branches/{branchId}/productControls/{productId}` for protected price/cost controls.
- `branches/{branchId}/inventoryFinancials/{productId}` for average cost and stock value.

Stock receipts are immutable once posted and update weighted average cost:

```text
newAverageUnitCostKobo = floor((previousStockValueKobo + receiptLineValueKobo) / newOnHandQty)
```

Stock-outs and approved decreases remove value using the current average unit cost. Removing all remaining stock removes the entire remaining stock value to avoid rounding residue.

Inventory adjustments are request/review workflows. A request never mutates stock. Approval mutates stock and financials transactionally. Stock count approval is rejected if current `onHandQty` no longer matches the count's captured expected quantity, forcing a fresh count instead of reconciling stale data.

## Phase 7 Reversal Notes

Reversals are correction records, not order edits. Completed orders retain their original items, payments, release fields, stock movements, and audit logs. Completion updates the order status only to `partially_reversed` or `reversed`.

Reversal item shape:

```text
productId
sku
productName
unit
originalSoldQuantity
previouslyReversedQuantity
requestedReversalQuantity
originalUnitPriceKobo
reversalLineTotalKobo
stockReturnedQuantity
stockNotReturnedQuantity
inventoryUnitCostKobo
inventoryValueImpactKobo
```

Phase 7 uses `reversedSoldQty` on branch inventory as the correction counter. `soldQty` remains the historical gross sales quantity. Returned stock increases `onHandQty` and `returnedQty`; stock not physically returned does not change `onHandQty`.

Returned-stock valuation uses the original `stock_out` movement cost basis when available. New Phase 7 stock-out movements include `unitCostKobo` and `inventoryValueImpactKobo`. If an older stock-out lacks cost metadata, completion falls back to the current `inventoryFinancials.averageUnitCostKobo`; it never uses product default cost blindly.

Financial correction transactions:

```text
sale_refund              direction: out
credit_reduction         direction: receivable_reduction
reversal_adjustment      direction: none
```

Refund and credit records are audit records only. No external money movement is executed by the system.
