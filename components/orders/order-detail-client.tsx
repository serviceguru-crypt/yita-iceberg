"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";

import { BranchRequired } from "@/components/branch/branch-required";
import { useBranchContext } from "@/components/branch/branch-context";
import { OrderItemTable } from "@/components/orders/order-item-table";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/orders/status-badges";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { getFirebaseServices } from "@/lib/firebase/client";
import { formatNairaFromKobo } from "@/lib/format/number";
import { useUserDisplayNames } from "@/lib/hooks/use-user-display-names";
import type { OrderDocument } from "@/lib/types/operational";
import { timestampLabel } from "@/lib/types/operational";

export function OrderDetailClient({ orderId }: { orderId: string }) {
  return (
    <BranchRequired>
      <OrderDetailContent orderId={orderId} />
    </BranchRequired>
  );
}

function OrderDetailContent({ orderId }: { orderId: string }) {
  const { selectedBranchId, user } = useBranchContext();
  const [order, setOrder] = useState<OrderDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userName = useUserDisplayNames([order?.createdBy], selectedBranchId);

  async function loadOrder() {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDoc(doc(getFirebaseServices().db, "orders", orderId));
      if (!snapshot.exists()) throw new Error("Order not found.");
      const nextOrder = { id: snapshot.id, ...(snapshot.data() as Omit<OrderDocument, "id">) };
      if (nextOrder.branchId !== selectedBranchId) {
        throw new Error("This order is not in the active branch.");
      }
      setOrder(nextOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load order.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrder();
  }, [orderId, selectedBranchId]);

  if (loading) return <OperationState title="Loading order" />;
  if (error || !order) {
    return <OperationState actionLabel="Retry" detail={error ?? undefined} onAction={() => void loadOrder()} title="Order unavailable" />;
  }
  const canRequestReversal = ["branch_manager", "admin", "super_admin"].includes(user.platformRole);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Created {timestampLabel(order.createdAt)} by {userName(order.createdBy)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/orders">Back</Link></Button>
          {["awaiting_payment", "awaiting_discount_approval"].includes(order.status) ? (
            <Button asChild variant="outline"><Link href={`/orders/${order.id}/edit`}>Edit unpaid</Link></Button>
          ) : null}
          {order.paymentStatus === "unpaid" ? (
            <Button asChild><Link href={`/orders/${order.id}/slip`}>Order slip</Link></Button>
          ) : null}
          {order.status === "awaiting_payment" ? (
            <Button asChild><Link href={`/cashier/orders/${order.id}`}>Take payment</Link></Button>
          ) : null}
          {order.status === "awaiting_release" ? (
            <Button asChild><Link href={`/release/orders/${order.id}`}>Release</Link></Button>
          ) : null}
          {canRequestReversal && ["completed", "partially_reversed"].includes(order.status) ? (
            <Button asChild><Link href={`/orders/${order.id}/reverse`}>Reverse</Link></Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Customer</p>
          <p className="mt-2 font-medium">{order.customerSnapshot?.name || "Walk-in customer"}</p>
          <p className="text-sm text-muted-foreground">{order.customerSnapshot?.phone || order.customerType.replace("_", " ")}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Grand total</p>
          <p className="mt-2 text-xl font-semibold">{formatNairaFromKobo(order.grandTotalKobo)}</p>
        </div>
      </div>

      <OrderItemTable items={order.items} />
      <div className="ml-auto grid max-w-sm gap-2 rounded-lg border bg-card p-4 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatNairaFromKobo(order.subtotalKobo)}</span></div>
        <div className="flex justify-between"><span>Discount</span><span>{formatNairaFromKobo(order.discountTotalKobo)}</span></div>
        <div className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span>{formatNairaFromKobo(order.grandTotalKobo)}</span></div>
      </div>
    </div>
  );
}
