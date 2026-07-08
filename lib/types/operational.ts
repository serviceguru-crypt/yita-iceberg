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

export function timestampLabel(value: unknown) {
  if (!value || typeof value !== "object") return "Not recorded";
  if ("toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toLocaleString("en-NG");
  }

  return "Not recorded";
}
