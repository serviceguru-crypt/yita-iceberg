"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ref, uploadBytesResumable } from "firebase/storage";

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
import { formatNairaFromKobo, parseNairaToKobo } from "@/lib/format/number";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { OrderDocument, PaymentDocument } from "@/lib/types/operational";
import { timestampLabel } from "@/lib/types/operational";

type PaymentLine = {
  id: string;
  paymentMethod: "cash" | "bank_transfer" | "pos_terminal" | "credit";
  amount: string;
  reference: string;
  proofUploadIntentId?: string;
  proofStoragePath?: string;
  uploadProgress?: number;
};

type CashierOrdersResponse = {
  ok?: boolean;
  message?: string;
  orders?: OrderDocument[];
  order?: OrderDocument;
  payments?: PaymentDocument[];
  awaitingApprovalCount?: number;
};

function newLine(): PaymentLine {
  return {
    id: createIdempotencyKey("line"),
    paymentMethod: "cash",
    amount: "",
    reference: "",
  };
}

export function CashierQueueClient() {
  return (
    <BranchRequired>
      <CashierQueue />
    </BranchRequired>
  );
}

function CashierQueue() {
  const { selectedBranchId } = useBranchContext();
  const [orders, setOrders] = useState<OrderDocument[]>([]);
  const [lookup, setLookup] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [awaitingApprovalCount, setAwaitingApprovalCount] = useState(0);

  async function loadQueue() {
    if (!selectedBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/cashier/orders?branchId=${encodeURIComponent(selectedBranchId)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const result = (await response.json()) as CashierOrdersResponse;

      if (!response.ok || !result.ok || !Array.isArray(result.orders)) {
        throw new Error(result.message || "Unable to load payment queue.");
      }

      setOrders(result.orders);
      setAwaitingApprovalCount(result.awaitingApprovalCount ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load payment queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, [selectedBranchId]);

  const filtered = orders.filter((order) =>
    lookup.trim()
      ? order.orderNumber.toLowerCase().includes(lookup.trim().toLowerCase())
      : true,
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Cashier</h1>
        <p className="text-sm text-muted-foreground">Scan fallback: enter the order number from the slip.</p>
      </div>
      <Field label="Order number">
        <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setLookup(event.target.value)} placeholder="YI-..." value={lookup} />
      </Field>
      {error ? <OperationState detail={error} title="Queue unavailable" /> : null}
      {loading ? <OperationState title="Loading payment queue" /> : null}
      {!loading && !error && awaitingApprovalCount > 0 ? (
        <OperationState
          detail={`${awaitingApprovalCount} ${awaitingApprovalCount === 1 ? "order is" : "orders are"} waiting for manager discount approval before payment can be received.`}
          title="Approval pending"
        />
      ) : null}
      <div className="grid gap-3">
        {filtered.map((order) => (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4" key={order.id}>
            <div>
              <p className="font-medium">{order.orderNumber}</p>
              <p className="text-sm text-muted-foreground">{order.customerSnapshot?.name || "Walk-in"} · {formatNairaFromKobo(order.grandTotalKobo)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <Button asChild><Link href={`/cashier/orders/${order.id}`}>Receive payment</Link></Button>
            </div>
          </div>
        ))}
        {!loading && !error && filtered.length === 0 ? (
          <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            {lookup.trim()
              ? "No awaiting-payment order matches that order number."
              : "No orders are currently awaiting payment at this branch."}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PaymentClient({ orderId }: { orderId: string }) {
  return (
    <BranchRequired>
      <PaymentContent orderId={orderId} />
    </BranchRequired>
  );
}

function PaymentContent({ orderId }: { orderId: string }) {
  const { selectedBranch, selectedBranchId } = useBranchContext();
  const [order, setOrder] = useState<OrderDocument | null>(null);
  const [lines, setLines] = useState<PaymentLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ paymentIds: string[] } | null>(null);
  const requireProof = selectedBranch?.settings?.requireTransferProof === true;

  async function loadOrder() {
    if (!selectedBranchId) return;
    setError(null);
    try {
      const searchParams = new URLSearchParams({
        branchId: selectedBranchId,
        orderId,
      });
      const response = await fetch(`/api/cashier/orders?${searchParams}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = (await response.json()) as CashierOrdersResponse;

      if (!response.ok || !result.ok || !result.order) {
        throw new Error(result.message || "Unable to load order.");
      }

      const nextOrder = result.order;
      if (nextOrder.status !== "awaiting_payment") throw new Error("This order is not ready for payment.");
      setOrder(nextOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load order.");
    }
  }

  useEffect(() => {
    void loadOrder();
  }, [orderId, selectedBranchId]);

  const enteredTotal = useMemo(
    () => lines.reduce((sum, line) => sum + parseNairaToKobo(line.amount), 0),
    [lines],
  );
  const remaining = (order?.grandTotalKobo ?? 0) - enteredTotal;

  function updateLine(id: string, patch: Partial<PaymentLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  async function uploadProof(line: PaymentLine, file: File) {
    setError(null);
    const intent = await callFunction<Record<string, unknown>, {
      proofUploadIntentId: string;
      storagePath: string;
      contentType: string;
      sizeBytes: number;
      requiredMetadata: Record<string, string>;
    }>("createPaymentProofUploadIntent", {
      orderId,
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      idempotencyKey: createIdempotencyKey("proof-intent"),
    });
    const uploadTask = uploadBytesResumable(
      ref(getFirebaseServices().storage, intent.storagePath),
      file,
      {
        contentType: intent.contentType,
        customMetadata: intent.requiredMetadata,
      },
    );
    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => updateLine(line.id, { uploadProgress: Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) }),
        reject,
        () => resolve(),
      );
    });
    updateLine(line.id, {
      proofUploadIntentId: intent.proofUploadIntentId,
      proofStoragePath: intent.storagePath,
      uploadProgress: 100,
    });
  }

  async function confirmPayment() {
    if (!order) return;
    if (enteredTotal !== order.grandTotalKobo) {
      setError("Entered payment total must match the order total exactly.");
      return;
    }
    if (!window.confirm("Confirm this payment?")) return;
    setSaving(true);
    setError(null);
    try {
      const response = await callFunction<Record<string, unknown>, { paymentIds: string[] }>(
        "confirmPayment",
        {
          orderId,
          paymentLines: lines.map((line) => ({
            paymentMethod: line.paymentMethod,
            amountKobo: parseNairaToKobo(line.amount),
            ...(line.reference.trim() ? { reference: line.reference.trim() } : {}),
            ...(line.proofUploadIntentId ? { proofUploadIntentId: line.proofUploadIntentId } : {}),
            ...(line.proofStoragePath ? { proofStoragePath: line.proofStoragePath } : {}),
          })),
          idempotencyKey: createIdempotencyKey("confirm-payment"),
        },
      );
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to confirm payment.");
    } finally {
      setSaving(false);
    }
  }

  if (!order && !error) return <OperationState title="Loading order" />;
  if (error && !order) return <OperationState detail={error} title="Payment unavailable" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Payment</h1>
          <p className="text-sm text-muted-foreground">{order?.orderNumber}</p>
        </div>
        <Button asChild variant="outline"><Link href="/cashier">Back to cashier</Link></Button>
      </div>
      {error ? <OperationState detail={error} title="Action failed" /> : null}
      {result ? (
        <OperationState
          detail={`Payment recorded. Confirmation lines: ${result.paymentIds.join(", ")}`}
          title="Paid — awaiting release"
        />
      ) : null}
      {result ? <Button asChild><Link href={`/cashier/orders/${orderId}/receipt`}>Open receipt</Link></Button> : null}

      {order ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{order.customerSnapshot?.name || "Walk-in customer"}</p>
                  <p className="text-sm text-muted-foreground">{order.customerSnapshot?.phone || "No phone recorded"}</p>
                  <p className="text-sm text-muted-foreground">Registered by {order.createdByName || "Staff member"}</p>
                </div>
                <div className="flex gap-2">
                  <OrderStatusBadge status={order.status} />
                  <PaymentStatusBadge status={order.paymentStatus} />
                </div>
              </div>
            </div>
            <OrderItemTable items={order.items} />
          </section>

          <aside className="space-y-4 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total due</span>
              <span className="text-xl font-semibold">{formatNairaFromKobo(order.grandTotalKobo)}</span>
            </div>
            {lines.map((line, index) => (
              <div className="grid gap-3 rounded-lg border p-3" key={line.id}>
                <div className="flex items-center justify-between">
                  <p className="font-medium">Payment line {index + 1}</p>
                  {lines.length > 1 ? (
                    <Button onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} size="sm" type="button" variant="ghost">Remove</Button>
                  ) : null}
                </div>
                <Field label="Method">
                  <select className="h-9 rounded-md border bg-background px-3" onChange={(event) => updateLine(line.id, { paymentMethod: event.target.value as PaymentLine["paymentMethod"] })} value={line.paymentMethod}>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="pos_terminal">POS terminal</option>
                    <option value="credit">Credit</option>
                  </select>
                </Field>
                <Field label="Amount">
                  <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => updateLine(line.id, { amount: event.target.value })} placeholder="0.00" value={line.amount} />
                </Field>
                <Field label="Reference">
                  <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => updateLine(line.id, { reference: event.target.value })} value={line.reference} />
                </Field>
                {line.paymentMethod === "bank_transfer" && requireProof ? (
                  <Field label="Transfer proof">
                    <input
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="rounded-md border bg-background px-3 py-2"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadProof(line, file).catch((err) => setError(err instanceof Error ? err.message : "Upload failed."));
                      }}
                      type="file"
                    />
                    {line.uploadProgress ? <span className="text-xs text-muted-foreground">{line.uploadProgress}% uploaded</span> : null}
                  </Field>
                ) : null}
              </div>
            ))}
            <Button onClick={() => setLines((current) => [...current, newLine()])} type="button" variant="outline">Add payment line</Button>
            <div className="grid gap-2 border-t pt-3 text-sm">
              <div className="flex justify-between"><span>Entered</span><span>{formatNairaFromKobo(enteredTotal)}</span></div>
              <div className="flex justify-between"><span>Remaining</span><span>{formatNairaFromKobo(remaining)}</span></div>
            </div>
            <Button disabled={saving || remaining !== 0 || Boolean(result)} onClick={() => void confirmPayment()} type="button">
              {saving ? "Confirming..." : "Confirm payment"}
            </Button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export function PaymentReceiptClient({ orderId }: { orderId: string }) {
  return (
    <BranchRequired>
      <PaymentReceipt orderId={orderId} />
    </BranchRequired>
  );
}

function PaymentReceipt({ orderId }: { orderId: string }) {
  const { selectedBranch, selectedBranchId } = useBranchContext();
  const [order, setOrder] = useState<OrderDocument | null>(null);
  const [payments, setPayments] = useState<PaymentDocument[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!selectedBranchId) return;
      setError(null);
      try {
        const searchParams = new URLSearchParams({
          branchId: selectedBranchId,
          orderId,
        });
        const response = await fetch(`/api/cashier/orders?${searchParams}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const result = (await response.json()) as CashierOrdersResponse;

        if (!response.ok || !result.ok || !result.order || !Array.isArray(result.payments)) {
          throw new Error(result.message || "Unable to load payment receipt.");
        }

        setOrder(result.order);
        setPayments(result.payments);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load payment receipt.");
      }
    }
    void load();
  }, [orderId, selectedBranchId]);

  if (error) return <OperationState detail={error} title="Receipt unavailable" />;
  if (!order) return <OperationState title="Loading receipt" />;

  const total = payments.reduce((sum, payment) => sum + payment.amountKobo, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="print-hidden flex justify-between gap-2">
        <Button asChild variant="outline"><Link href={`/cashier/orders/${orderId}`}>Back</Link></Button>
        <PrintButton label="Print receipt" />
      </div>
      <section className="print-surface rounded-lg border bg-card p-6">
        <p className="text-sm font-semibold uppercase text-muted-foreground">YITA Iceberg</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal">Payment receipt</h1>
        <p className="text-sm text-muted-foreground">{selectedBranch?.name}</p>
        <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <div><span className="text-muted-foreground">Order</span><p className="font-medium">{order.orderNumber}</p></div>
          <div><span className="text-muted-foreground">Status</span><p className="font-medium">PAID — AWAITING RELEASE</p></div>
          <div><span className="text-muted-foreground">Customer</span><p className="font-medium">{order.customerSnapshot?.name || "Walk-in customer"}</p></div>
          <div><span className="text-muted-foreground">Paid</span><p className="font-medium">{timestampLabel(order.paidAt)}</p></div>
          <div><span className="text-muted-foreground">Received by</span><p className="font-medium">{order.paidByName || "Staff member"}</p></div>
        </div>
        <div className="mt-5 overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Method</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Cashier</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
            <tbody className="divide-y">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-3 py-2">{payment.paymentMethod.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2">{payment.reference || "Not recorded"}</td>
                  <td className="px-3 py-2">{payment.receivedByName || "Staff member"}</td>
                  <td className="px-3 py-2 text-right">{formatNairaFromKobo(payment.amountKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex justify-between border-t pt-3 text-lg font-semibold">
          <span>Total received</span>
          <span>{formatNairaFromKobo(total)}</span>
        </div>
      </section>
    </div>
  );
}
