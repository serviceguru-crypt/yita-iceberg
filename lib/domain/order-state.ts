export const orderStatuses = [
  "draft",
  "awaiting_discount_approval",
  "awaiting_payment",
  "awaiting_release",
  "completed",
  "cancelled",
  "expired",
  "reversed",
  "partially_reversed",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export const paymentStatuses = ["unpaid", "paid", "credit"] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];

export const allowedOrderTransitions = {
  draft: ["awaiting_discount_approval", "awaiting_payment"],
  awaiting_discount_approval: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["awaiting_release", "cancelled", "expired"],
  awaiting_release: ["completed"],
  completed: ["partially_reversed", "reversed"],
  cancelled: [],
  expired: [],
  reversed: [],
  partially_reversed: ["reversed"],
} satisfies Record<OrderStatus, readonly OrderStatus[]>;

export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return (allowedOrderTransitions[from] as readonly OrderStatus[]).includes(to);
}
