"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { BranchRequired } from "@/components/branch/branch-required";
import { useBranchContext } from "@/components/branch/branch-context";
import { OrderItemTable } from "@/components/orders/order-item-table";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/orders/status-badges";
import { PrintButton } from "@/components/receipts/print-button";
import { Field } from "@/components/shared/field";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { callFunction } from "@/lib/firebase/callables";
import { getFirebaseServices } from "@/lib/firebase/client";
import { createIdempotencyKey } from "@/lib/idempotency";
import {
  clearReleaseQrToken,
  readReleaseQrToken,
  storeReleaseQrToken,
} from "@/lib/qr/volatile-token-store";
import type { OrderDocument } from "@/lib/types/operational";
import { timestampLabel } from "@/lib/types/operational";

function parseQrPayload(value: string) {
  const [version, orderNumber, qrToken] = value.trim().split("|");
  if (version !== "YITA1" || !orderNumber || !qrToken) {
    throw new Error("Invalid YITA QR payload.");
  }

  return { orderNumber, qrToken };
}

export function ReleaseQueueClient() {
  return (
    <BranchRequired>
      <ReleaseQueue />
    </BranchRequired>
  );
}

function ReleaseQueue() {
  const { selectedBranchId } = useBranchContext();
  const [orders, setOrders] = useState<OrderDocument[]>([]);
  const [manualOrderNumber, setManualOrderNumber] = useState("");
  const [qrText, setQrText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadQueue() {
    if (!selectedBranchId) return;
    try {
      const snapshot = await getDocs(
        query(
          collection(getFirebaseServices().db, "orders"),
          where("branchId", "==", selectedBranchId),
          where("status", "==", "awaiting_release"),
          orderBy("createdAt", "desc"),
          limit(25),
        ),
      );
      setOrders(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<OrderDocument, "id">) })));
    } catch {
      setError("Unable to load release queue.");
    }
  }

  useEffect(() => {
    void loadQueue();
  }, [selectedBranchId]);

  async function validateQr() {
    setError(null);
    try {
      const parsed = parseQrPayload(qrText);
      const preview = await callFunction<typeof parsed, { orderId: string }>(
        "validateReleaseQr",
        parsed,
      );
      storeReleaseQrToken(preview.orderId, {
        orderNumber: parsed.orderNumber,
        qrToken: parsed.qrToken,
      });
      window.location.href = `/release/orders/${preview.orderId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to validate QR.");
    }
  }

  async function openManual() {
    if (!selectedBranchId || !manualOrderNumber.trim()) return;
    setError(null);
    try {
      const snapshot = await getDocs(
        query(
          collection(getFirebaseServices().db, "orders"),
          where("branchId", "==", selectedBranchId),
          where("orderNumber", "==", manualOrderNumber.trim()),
          limit(1),
        ),
      );
      if (snapshot.empty) throw new Error("Order not found in active branch.");
      window.location.href = `/release/orders/${snapshot.docs[0].id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open order.");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Release verification</h1>
        <p className="text-sm text-muted-foreground">Use QR payload scan or manual order-number fallback.</p>
      </div>
      {error ? <OperationState detail={error} title="Verification failed" /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <Field label="QR payload">
            <textarea className="min-h-28 rounded-md border bg-background px-3 py-2" onChange={(event) => setQrText(event.target.value)} placeholder="YITA1|order|token" value={qrText} />
          </Field>
          <Button className="mt-3" disabled={!qrText.trim()} onClick={() => void validateQr()} type="button">Validate QR</Button>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <Field label="Manual order number">
            <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setManualOrderNumber(event.target.value)} value={manualOrderNumber} />
          </Field>
          <Button className="mt-3" disabled={!manualOrderNumber.trim()} onClick={() => void openManual()} type="button" variant="outline">Open manually</Button>
        </div>
      </div>
      <div className="grid gap-3">
        {orders.map((order) => (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4" key={order.id}>
            <div>
              <p className="font-medium">{order.orderNumber}</p>
              <p className="text-sm text-muted-foreground">{order.items.length} item lines · {order.customerSnapshot?.name || "Walk-in"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <Button asChild><Link href={`/release/orders/${order.id}`}>Verify</Link></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReleaseCompleteClient({ orderId }: { orderId: string }) {
  return (
    <BranchRequired>
      <ReleaseComplete orderId={orderId} />
    </BranchRequired>
  );
}

function ReleaseComplete({ orderId }: { orderId: string }) {
  const { selectedBranchId, user } = useBranchContext();
  const [order, setOrder] = useState<OrderDocument | null>(null);
  const [manualReason, setManualReason] = useState("");
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOrder() {
    try {
      const snapshot = await getDoc(doc(getFirebaseServices().db, "orders", orderId));
      if (!snapshot.exists()) throw new Error("Order not found.");
      const nextOrder = { id: snapshot.id, ...(snapshot.data() as Omit<OrderDocument, "id">) };
      if (nextOrder.branchId !== selectedBranchId) throw new Error("This order is not in the active branch.");
      setOrder(nextOrder);
      setQrToken(readReleaseQrToken(orderId)?.qrToken ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load release order.");
    }
  }

  useEffect(() => {
    void loadOrder();
  }, [orderId, selectedBranchId]);

  async function completeRelease(method: "qr" | "manual") {
    if (!order) return;
    if (method === "manual" && manualReason.trim().length < 3) {
      setError("Manual verification requires a reason.");
      return;
    }
    if (!window.confirm("Complete goods release and deduct inventory?")) return;
    try {
      await callFunction("verifyAndCompleteRelease", {
        orderId,
        verificationMethod: method,
        ...(method === "qr" ? { qrToken } : { manualReason }),
        idempotencyKey: createIdempotencyKey("release"),
      });
      clearReleaseQrToken(orderId);
      setCompleted(true);
      await loadOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete release.");
    }
  }

  if (!order && !error) return <OperationState title="Loading release order" />;
  if (error && !order) return <OperationState detail={error} title="Release unavailable" />;

  return (
    <div className="space-y-5">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Complete release</h1>
          <p className="text-sm text-muted-foreground">{order?.orderNumber}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/release">Back</Link></Button>
          {completed || order?.status === "completed" ? <PrintButton label="Print confirmation" /> : null}
        </div>
      </div>
      {error ? <OperationState detail={error} title="Action failed" /> : null}
      {completed ? <OperationState detail={`Released by ${user.displayName}.`} title="Sale completed" /> : null}
      {order ? (
        <section className="print-surface space-y-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{order.orderNumber}</p>
              <p className="text-sm text-muted-foreground">{order.customerSnapshot?.name || "Walk-in customer"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <OrderStatusBadge status={order.status} />
              <PaymentStatusBadge status={order.paymentStatus} />
            </div>
          </div>
          <OrderItemTable compact items={order.items} />
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Manual verification reason">
              <textarea className="min-h-24 rounded-md border bg-background px-3 py-2" onChange={(event) => setManualReason(event.target.value)} value={manualReason} />
            </Field>
            <div className="grid content-end gap-2">
              <Button disabled={order.status !== "awaiting_release" || !qrToken || completed} onClick={() => void completeRelease("qr")} type="button">
                Complete with QR
              </Button>
              <Button disabled={order.status !== "awaiting_release" || completed} onClick={() => void completeRelease("manual")} type="button" variant="outline">
                Complete manually
              </Button>
            </div>
          </div>
          {order.status === "completed" ? (
            <div className="grid gap-2 border-t pt-3 text-sm">
              <div><span className="text-muted-foreground">Released</span><p className="font-medium">{timestampLabel(order.releasedAt)}</p></div>
              <div><span className="text-muted-foreground">Released by</span><p className="font-medium">{order.releasedBy || user.displayName}</p></div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
