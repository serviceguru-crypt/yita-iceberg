"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";

import { BranchRequired } from "@/components/branch/branch-required";
import { useBranchContext } from "@/components/branch/branch-context";
import { OrderItemTable } from "@/components/orders/order-item-table";
import { OrderStatusBadge } from "@/components/orders/status-badges";
import { QrCode } from "@/components/qr/qr-code";
import { PrintButton } from "@/components/receipts/print-button";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { callFunction } from "@/lib/firebase/callables";
import { getFirebaseServices } from "@/lib/firebase/client";
import { formatNairaFromKobo } from "@/lib/format/number";
import { createIdempotencyKey } from "@/lib/idempotency";
import {
  clearOrderQrToken,
  readOrderQrToken,
  storeOrderQrToken,
} from "@/lib/qr/volatile-token-store";
import type { OrderDocument } from "@/lib/types/operational";
import { timestampLabel } from "@/lib/types/operational";

type StoredQr = { orderNumber: string; qrToken: string };

export function OrderSlipClient({ orderId }: { orderId: string }) {
  return (
    <BranchRequired>
      <OrderSlipContent orderId={orderId} />
    </BranchRequired>
  );
}

function OrderSlipContent({ orderId }: { orderId: string }) {
  const { selectedBranch, selectedBranchId } = useBranchContext();
  const [order, setOrder] = useState<OrderDocument | null>(null);
  const [qr, setQr] = useState<StoredQr | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadOrder() {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDoc(doc(getFirebaseServices().db, "orders", orderId));
      if (!snapshot.exists()) throw new Error("Order not found.");
      const nextOrder = { id: snapshot.id, ...(snapshot.data() as Omit<OrderDocument, "id">) };
      if (nextOrder.branchId !== selectedBranchId) throw new Error("This order is not in the active branch.");
      setOrder(nextOrder);
      setQr(readOrderQrToken(orderId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load slip.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrder();
    return () => {
      if (order?.paymentStatus !== "unpaid") {
        clearOrderQrToken(orderId);
      }
    };
  }, [orderId, selectedBranchId]);

  const qrPayload = useMemo(() => {
    if (!order || !qr?.qrToken) return null;
    return `YITA1|${order.orderNumber}|${qr.qrToken}`;
  }, [order, qr]);

  async function reissueQr() {
    if (!window.confirm("Reissue this QR token? The previous QR will stop working.")) return;
    try {
      const next = await callFunction<Record<string, unknown>, StoredQr & { orderId: string }>(
        "reissueOrderQrToken",
        { orderId, idempotencyKey: createIdempotencyKey("reissue-qr") },
      );
      storeOrderQrToken(orderId, next);
      setQr(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reissue QR token.");
    }
  }

  if (loading) return <OperationState title="Loading slip" />;
  if (error || !order) {
    return <OperationState actionLabel="Retry" detail={error ?? undefined} onAction={() => void loadOrder()} title="Slip unavailable" />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline"><Link href={`/orders/${orderId}`}>Back</Link></Button>
        <div className="flex flex-wrap gap-2">
          {order.paymentStatus === "unpaid" ? (
            <Button onClick={() => void reissueQr()} type="button" variant="outline">Reissue QR</Button>
          ) : null}
          <PrintButton label="Print slip" />
        </div>
      </div>

      <section className="print-surface rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-muted-foreground">YITA Iceberg</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">Order slip</h1>
            <p className="text-sm text-muted-foreground">{selectedBranch?.name}</p>
          </div>
          {qrPayload ? <QrCode payload={qrPayload} /> : (
            <div className="grid size-48 place-items-center rounded-lg border text-center text-sm text-muted-foreground">
              QR token unavailable. Reissue to print.
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <div><span className="text-muted-foreground">Order number</span><p className="font-medium">{order.orderNumber}</p></div>
          <div><span className="text-muted-foreground">Created</span><p className="font-medium">{timestampLabel(order.createdAt)}</p></div>
          <div><span className="text-muted-foreground">Customer</span><p className="font-medium">{order.customerSnapshot?.name || "Walk-in customer"}</p></div>
          <div><span className="text-muted-foreground">Status</span><div className="mt-1"><OrderStatusBadge status={order.status} /></div></div>
        </div>

        <div className="mt-5">
          <OrderItemTable items={order.items} />
        </div>

        <div className="ml-auto mt-5 grid max-w-sm gap-2 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatNairaFromKobo(order.subtotalKobo)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>{formatNairaFromKobo(order.discountTotalKobo)}</span></div>
          <div className="flex justify-between border-t pt-2 text-lg font-semibold"><span>Total</span><span>{formatNairaFromKobo(order.grandTotalKobo)}</span></div>
        </div>

        <p className="mt-6 rounded-lg border p-3 text-center font-medium">Present this slip at payment.</p>
      </section>
    </div>
  );
}
