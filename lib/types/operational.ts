import type { OrderStatus, PaymentStatus } from "@/lib/domain/order-state";
import type { PlatformRole } from "@/lib/domain/roles";

export type SessionUserForClient = {
  uid: string;
  displayName: string;
  email: string;
  platformRole: PlatformRole;
  assignedBranchIds: string[];
};

export type BranchDocument = {
  id: string;
  name: string;
  code?: string;
  isActive?: boolean;
  settings?: {
    requireDiscountReason?: boolean;
    requireTransferProof?: boolean;
    allowCreditSales?: boolean;
    allowSplitPayments?: boolean;
  };
};

export type ProductDocument = {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  unit: string;
  barcode?: string | null;
  qrCodePayload?: string | null;
  sellingPriceKobo?: number;
  minimumPriceKobo?: number;
  isActive?: boolean;
};

export type InventoryDocument = {
  id: string;
  productId?: string;
  sku?: string;
  productName?: string;
  unit?: string;
  onHandQty: number;
  reservedQty: number;
  soldQty?: number;
  damagedQty?: number;
  returnedQty?: number;
  reorderLevel?: number;
  isLowStock?: boolean;
  isActive?: boolean;
  updatedAt?: unknown;
  updatedBy?: string;
};

export type InventoryFinancialDocument = {
  id: string;
  productId: string;
  averageUnitCostKobo: number;
  stockValueKobo: number;
  updatedAt?: unknown;
};

export type CustomerDocument = {
  id: string;
  name: string;
  phone: string;
  address?: string | null;
  branchId: string;
  creditLimitKobo?: number;
  outstandingBalanceKobo?: number;
  isActive?: boolean;
};

export type OrderItemDocument = {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  originalUnitPriceKobo: number;
  finalUnitPriceKobo: number;
  lineSubtotalKobo: number;
  lineDiscountKobo: number;
  lineTotalKobo: number;
  discountPercent: number;
  discountReason?: string;
};

export type OrderDocument = {
  id: string;
  orderNumber: string;
  branchId: string;
  customerType: "walk_in" | "registered";
  customerId?: string | null;
  customerSnapshot?: {
    name?: string;
    phone?: string;
    address?: string;
  } | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  items: OrderItemDocument[];
  subtotalKobo: number;
  discountTotalKobo: number;
  grandTotalKobo: number;
  discountApprovalStatus?: "not_required" | "pending" | "approved" | "rejected";
  discountRequest?: {
    reason?: string | null;
    requestedBy?: string;
    requestedAt?: unknown;
    maxDiscountPercent?: number;
  } | null;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  paidAt?: unknown;
  paidBy?: string;
  releasedAt?: unknown;
  releasedBy?: string;
  expiresAt?: unknown;
};

export type PaymentDocument = {
  id: string;
  paymentMethod: "cash" | "bank_transfer" | "pos_terminal" | "credit";
  amountKobo: number;
  reference?: string | null;
  receivedBy?: string;
  receivedAt?: unknown;
  status?: string;
};

export type StockMovementDocument = {
  id: string;
  branchId: string;
  productId: string;
  movementType: string;
  quantity: number;
  onHandBefore: number;
  onHandAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  reason?: string;
  performedBy?: string;
  createdAt?: unknown;
  orderId?: string;
  stockReceiptId?: string;
  adjustmentRequestId?: string;
  stockCountId?: string;
};

export type StockReceiptDocument = {
  id: string;
  receiptNumber: string;
  branchId: string;
  supplierName?: string | null;
  supplierReference?: string | null;
  deliveryReference?: string | null;
  notes?: string | null;
  items: Array<{
    productId: string;
    sku: string;
    productName: string;
    quantity: number;
    unitCostKobo: number;
    lineValueKobo: number;
  }>;
  totalValueKobo: number;
  status: "posted";
  receivedBy: string;
  receivedAt?: unknown;
};

export type InventoryAdjustmentRequestDocument = {
  id: string;
  branchId: string;
  productId: string;
  adjustmentType: "increase" | "decrease" | "damage_write_off";
  quantity: number;
  unitCostKobo?: number | null;
  reason: string;
  supportingReference?: string | null;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  requestedAt?: unknown;
  reviewedBy?: string;
  reviewedAt?: unknown;
  reviewReason?: string;
  postedMovementId?: string;
};

export type StockCountDocument = {
  id: string;
  stockCountNumber: string;
  branchId: string;
  status: "open" | "submitted" | "approved" | "rejected" | "expired";
  productIds: string[];
  startedBy: string;
  startedAt?: unknown;
  submittedBy?: string;
  submittedAt?: unknown;
  reviewedBy?: string;
  reviewedAt?: unknown;
  reviewReason?: string;
};

export type StockCountItemDocument = {
  id: string;
  productId: string;
  expectedOnHandQtyAtStart: number;
  countedQty?: number;
  differenceQty?: number;
  status: "pending" | "counted" | "approved" | "rejected";
};

export type ReversalType =
  | "full_reversal_with_stock_return"
  | "full_reversal_without_stock_return"
  | "partial_reversal_with_stock_return"
  | "partial_reversal_without_stock_return"
  | "refund_only"
  | "credit_correction"
  | "correction_note";

export type ReversalStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export type SaleReversalItemDocument = {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  originalSoldQuantity: number;
  previouslyReversedQuantity: number;
  requestedReversalQuantity: number;
  originalUnitPriceKobo: number;
  reversalLineTotalKobo: number;
  stockReturnedQuantity: number;
  stockNotReturnedQuantity: number;
  inventoryUnitCostKobo?: number;
  inventoryValueImpactKobo?: number;
};

export type SaleReversalDocument = {
  id: string;
  reversalNumber: string;
  orderId: string;
  orderNumber: string;
  branchId: string;
  reversalType: ReversalType;
  status: ReversalStatus;
  reason: string;
  internalNote?: string | null;
  requestedBy: string;
  requestedAt?: unknown;
  approvedBy?: string;
  approvedAt?: unknown;
  approvalNote?: string | null;
  rejectedBy?: string;
  rejectedAt?: unknown;
  rejectionReason?: string;
  completedBy?: string;
  completedAt?: unknown;
  cancelledBy?: string;
  cancelledAt?: unknown;
  cancellationReason?: string;
  items: SaleReversalItemDocument[];
  originalOrderTotalKobo: number;
  reversalSubtotalKobo: number;
  refundAmountKobo: number;
  refundMethod?: "cash" | "bank_transfer" | "pos_reversal" | "credit_note" | "no_refund";
  creditReductionKobo: number;
  stockReturnRequired: boolean;
  stockReturned: boolean;
  financialImpact: "refund_due" | "refund_recorded" | "credit_reduced" | "no_financial_refund" | "correction_only";
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ReversalPreviewItem = {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  originalSoldQuantity: number;
  previouslyReversedQuantity: number;
  remainingReversibleQuantity: number;
  originalUnitPriceKobo: number;
};

export type ReversalPreview = {
  orderId: string;
  orderNumber: string;
  branchId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerType: "walk_in" | "registered";
  customerId?: string | null;
  customerSnapshot?: { name?: string; phone?: string; address?: string } | null;
  originalOrderTotalKobo: number;
  previousReversalSummary: {
    refundAmountKobo: number;
    creditReductionKobo: number;
    reversedQuantity: number;
  };
  maximumRefundableAmountKobo: number;
  maximumCreditReductionKobo: number;
  stockReturnPossible: boolean;
  items: ReversalPreviewItem[];
};

export type BranchScope = "selected_branch" | "all_branches";

export type ReportType =
  | "dashboard"
  | "sales"
  | "payments"
  | "inventory"
  | "stock_movements"
  | "reversals"
  | "credit"
  | "staff_activity"
  | "low_stock";

export type ReportResult = {
  summary: Record<string, unknown>;
  rows: Record<string, unknown>[];
  nextPageCursor: string | null;
  generatedAt: string;
  branchScope: BranchScope;
  branchIds: string[];
  sensitiveFieldsIncluded: boolean;
};

export function timestampLabel(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString("en-NG");
  }

  if (!value || typeof value !== "object") return "Not recorded";
  if ("toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toLocaleString("en-NG");
  }

  return "Not recorded";
}
