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
  unit: string;
  sellingPriceKobo: number;
  minimumPriceKobo?: number;
  isActive?: boolean;
};

export type InventoryDocument = {
  id: string;
  onHandQty: number;
  reservedQty: number;
  soldQty?: number;
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

export function timestampLabel(value: unknown) {
  if (!value || typeof value !== "object") return "Not recorded";
  if ("toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toLocaleString("en-NG");
  }

  return "Not recorded";
}
