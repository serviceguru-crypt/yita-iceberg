export type OrderStatus =
  | "draft"
  | "awaiting_discount_approval"
  | "awaiting_payment"
  | "awaiting_release"
  | "completed"
  | "cancelled"
  | "expired"
  | "partially_reversed"
  | "reversed";

export type PaymentStatus = "unpaid" | "paid" | "credit";

export type PaymentMethod = "cash" | "bank_transfer" | "pos_terminal" | "credit";

export type StockMovementType =
  | "reservation_created"
  | "reservation_adjusted"
  | "reservation_released"
  | "stock_out"
  | "stock_received"
  | "central_stock_allocation"
  | "inventory_increase_adjustment"
  | "inventory_decrease_adjustment"
  | "damage_write_off"
  | "stock_count_reconciliation"
  | "sale_returned"
  | "sale_reversed_no_stock_return";

export type DiscountApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

export type OrderItem = {
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
  discountAppliedBy?: string;
  discountApprovedBy?: string;
  discountApprovedAt?: FirebaseFirestore.Timestamp;
};

export type OrderDocument = {
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
  items: OrderItem[];
  subtotalKobo: number;
  discountTotalKobo: number;
  grandTotalKobo: number;
  discountApprovalStatus: DiscountApprovalStatus;
  createdBy: string;
  updatedBy: string;
  qrTokenHash: string;
  qrTokenVersion: number;
  idempotencyKeyHash: string;
};
