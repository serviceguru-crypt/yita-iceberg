import type { OrderStatus, PaymentStatus } from "@/lib/domain/order-state";
import { cn } from "@/lib/utils";

const orderLabels: Record<OrderStatus, string> = {
  draft: "Draft",
  awaiting_discount_approval: "Awaiting approval",
  awaiting_payment: "Awaiting payment",
  awaiting_release: "Awaiting release",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  partially_reversed: "Partially reversed",
  reversed: "Reversed",
};

const orderClass: Record<OrderStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  awaiting_discount_approval: "bg-amber-100 text-amber-900",
  awaiting_payment: "bg-blue-100 text-blue-900",
  awaiting_release: "bg-emerald-100 text-emerald-900",
  completed: "bg-zinc-900 text-white",
  cancelled: "bg-red-100 text-red-900",
  expired: "bg-stone-100 text-stone-700",
  partially_reversed: "bg-purple-100 text-purple-900",
  reversed: "bg-purple-100 text-purple-900",
};

const paymentLabels: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  credit: "Credit",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cn("inline-flex rounded-md px-2 py-1 text-xs font-medium", orderClass[status])}>
      {orderLabels[status]}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className="inline-flex rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
      {paymentLabels[status]}
    </span>
  );
}

export function orderStatusLabel(status: OrderStatus) {
  return orderLabels[status];
}
