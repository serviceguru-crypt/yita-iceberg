"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { IconPlus, IconRefresh } from "@tabler/icons-react";

import { BranchRequired } from "@/components/branch/branch-required";
import { useBranchContext } from "@/components/branch/branch-context";
import { Field } from "@/components/shared/field";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { isAdminRole } from "@/lib/domain/roles";
import { callFunction } from "@/lib/firebase/callables";
import { getFirebaseServices } from "@/lib/firebase/client";
import { formatNairaFromKobo, formatQuantity, parseNairaToKobo } from "@/lib/format/number";
import { createIdempotencyKey } from "@/lib/idempotency";
import { useUserDisplayNames } from "@/lib/hooks/use-user-display-names";
import type {
  ReversalPreview,
  ReversalType,
  SaleReversalDocument,
  SaleReversalItemDocument,
} from "@/lib/types/operational";
import { timestampLabel } from "@/lib/types/operational";

const reversalTypes: ReversalType[] = [
  "full_reversal_with_stock_return",
  "full_reversal_without_stock_return",
  "partial_reversal_with_stock_return",
  "partial_reversal_without_stock_return",
  "refund_only",
  "credit_correction",
  "correction_note",
];

function canManageReversals(role: string) {
  return role === "branch_manager" || role === "admin" || role === "super_admin";
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function fromDoc<T>(id: string, data: Record<string, unknown>) {
  return { id, ...data } as T;
}

export function ReversalListClient() {
  return <BranchRequired><ReversalList /></BranchRequired>;
}

function ReversalList() {
  const { selectedBranch, selectedBranchId, user } = useBranchContext();
  const [status, setStatus] = useState("requested");
  const [type, setType] = useState("all");
  const [rows, setRows] = useState<SaleReversalDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const manager = canManageReversals(user.platformRole);
  const userName = useUserDisplayNames(rows.map((row) => row.requestedBy), selectedBranchId);

  async function load() {
    if (!selectedBranchId) return;
    setError(null);
    try {
      const clauses = [where("branchId", "==", selectedBranchId)];
      if (status !== "all") clauses.push(where("status", "==", status));
      if (type !== "all") clauses.push(where("reversalType", "==", type));
      const snapshot = await getDocs(query(collection(getFirebaseServices().db, "saleReversals"), ...clauses, orderBy("requestedAt", "desc"), limit(30)));
      setRows(snapshot.docs.map((item) => fromDoc<SaleReversalDocument>(item.id, item.data())));
    } catch {
      setError("Unable to load reversals for this branch.");
    }
  }

  useEffect(() => { void load(); }, [selectedBranchId, status, type]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Reversals</h1>
          <p className="text-sm text-muted-foreground">{selectedBranch?.name} sale corrections</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void load()} type="button" variant="outline"><IconRefresh />Refresh</Button>
          {manager ? <Button asChild><Link href="/reversals/new"><IconPlus />New reversal</Link></Button> : null}
        </div>
      </div>
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2">
        <Field label="Status">
          <select className="h-9 rounded-md border bg-background px-3" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="all">All statuses</option>
            {["requested", "approved", "rejected", "completed", "cancelled"].map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select className="h-9 rounded-md border bg-background px-3" onChange={(event) => setType(event.target.value)} value={type}>
            <option value="all">All types</option>
            {reversalTypes.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
        </Field>
      </div>
      {error ? <OperationState detail={error} title="Reversals unavailable" /> : null}
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2">Reversal</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Refund</th><th className="px-3 py-2">Credit</th><th className="px-3 py-2">Requested by</th><th className="px-3 py-2">Requested</th><th className="px-3 py-2">Action</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 font-medium">{row.reversalNumber}</td>
                <td className="px-3 py-2">{row.orderNumber}</td>
                <td className="px-3 py-2">{label(row.reversalType)}</td>
                <td className="px-3 py-2">{label(row.status)}</td>
                <td className="px-3 py-2">{formatNairaFromKobo(row.refundAmountKobo)}</td>
                <td className="px-3 py-2">{formatNairaFromKobo(row.creditReductionKobo)}</td>
                <td className="px-3 py-2">{userName(row.requestedBy)}</td>
                <td className="px-3 py-2">{timestampLabel(row.requestedAt)}</td>
                <td className="px-3 py-2"><Button asChild size="sm" variant="outline"><Link href={`/reversals/${row.id}`}>Open</Link></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NewReversalClient({ orderId }: { orderId?: string }) {
  return <BranchRequired><ReversalForm initialOrderId={orderId} /></BranchRequired>;
}

export function NewReversalFromSearchClient() {
  const params = useSearchParams();
  return <NewReversalClient orderId={params.get("orderId") ?? undefined} />;
}

function ReversalForm({ initialOrderId }: { initialOrderId?: string }) {
  const { selectedBranchId, user } = useBranchContext();
  const [orderId, setOrderId] = useState(initialOrderId ?? "");
  const [preview, setPreview] = useState<ReversalPreview | null>(null);
  const [type, setType] = useState<ReversalType>("partial_reversal_with_stock_return");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [returned, setReturned] = useState<Record<string, string>>({});
  const [refund, setRefund] = useState("");
  const [credit, setCredit] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const manager = canManageReversals(user.platformRole);
  const itemType = type.startsWith("full_reversal") || type.startsWith("partial_reversal");
  const requestedSubtotal = useMemo(() => preview?.items.reduce((sum, item) => {
    const qty = type.startsWith("full_reversal") ? item.remainingReversibleQuantity : Number(quantities[item.productId]) || 0;
    return sum + Math.min(qty, item.remainingReversibleQuantity) * item.originalUnitPriceKobo;
  }, 0) ?? 0, [preview, quantities, type]);

  async function loadPreview() {
    setError(null);
    setMessage(null);
    try {
      const result = await callFunction<{ orderId: string }, ReversalPreview>("getReversalPreview", { orderId });
      if (result.branchId !== selectedBranchId) throw new Error("This order is not in the active branch.");
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load reversal preview.");
    }
  }

  useEffect(() => {
    if (initialOrderId) void loadPreview();
  }, [initialOrderId]);

  async function submit() {
    if (!preview || !window.confirm("Submit this reversal request for review?")) return;
    const items = itemType
      ? preview.items
        .map((item) => {
          const quantity = type.startsWith("full_reversal") ? item.remainingReversibleQuantity : Number(quantities[item.productId]) || 0;
          const stockReturnedQuantity = type.endsWith("_without_stock_return") ? 0 : Number(returned[item.productId] ?? quantity) || 0;
          return { productId: item.productId, quantity, stockReturnedQuantity };
        })
        .filter((item) => item.quantity > 0)
      : [];
    try {
      const result = await callFunction<Record<string, unknown>, { reversalId: string; reversalNumber: string }>("createReversalRequest", {
        orderId: preview.orderId,
        reversalType: type,
        reason,
        items,
        refundAmountKobo: parseNairaToKobo(refund),
        creditReductionKobo: parseNairaToKobo(credit),
        refundMethod: parseNairaToKobo(refund) > 0 ? "cash" : "no_refund",
        idempotencyKey: createIdempotencyKey("reversal-request"),
      });
      setMessage(`Reversal ${result.reversalNumber} submitted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit reversal.");
    }
  }

  if (!manager) return <OperationState detail="Only branch managers and admins can request reversals." title="Restricted action" />;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-normal">New reversal</h1>
        <Button asChild variant="outline"><Link href="/reversals">Back</Link></Button>
      </div>
      {error ? <OperationState detail={error} title="Reversal error" /> : null}
      {message ? <OperationState detail={message} title="Request submitted" /> : null}
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_auto]">
        <Field label="Completed order ID">
          <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setOrderId(event.target.value)} value={orderId} />
        </Field>
        <Button className="self-end" disabled={!orderId} onClick={() => void loadPreview()} type="button">Load preview</Button>
      </div>
      {preview ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Order" value={preview.orderNumber} />
            <Metric label="Maximum refund" value={formatNairaFromKobo(preview.maximumRefundableAmountKobo)} />
            <Metric label="Maximum credit reduction" value={formatNairaFromKobo(preview.maximumCreditReductionKobo)} />
          </div>
          <Field label="Reversal type">
            <select className="h-9 rounded-md border bg-background px-3" onChange={(event) => setType(event.target.value as ReversalType)} value={type}>
              {reversalTypes.map((item) => <option key={item} value={item}>{label(item)}</option>)}
            </select>
          </Field>
          {itemType ? <ItemInputs preview={preview} quantities={quantities} returned={returned} setQuantities={setQuantities} setReturned={setReturned} type={type} /> : null}
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Requested item value" value={formatNairaFromKobo(requestedSubtotal)} />
            <Field label="Refund amount"><input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setRefund(event.target.value)} value={refund} /></Field>
            <Field label="Credit reduction"><input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setCredit(event.target.value)} value={credit} /></Field>
          </div>
          <Field label="Reason">
            <textarea className="min-h-24 rounded-md border bg-background px-3 py-2" onChange={(event) => setReason(event.target.value)} value={reason} />
          </Field>
          <Button disabled={reason.trim().length < 5} onClick={() => void submit()} type="button">Submit request</Button>
        </>
      ) : null}
    </div>
  );
}

function ItemInputs({ preview, type, quantities, returned, setQuantities, setReturned }: {
  preview: ReversalPreview;
  type: ReversalType;
  quantities: Record<string, string>;
  returned: Record<string, string>;
  setQuantities: (next: Record<string, string>) => void;
  setReturned: (next: Record<string, string>) => void;
}) {
  const full = type.startsWith("full_reversal");
  const noReturn = type.endsWith("_without_stock_return");
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Remaining</th><th className="px-3 py-2">Reverse</th><th className="px-3 py-2">Stock returned</th><th className="px-3 py-2">Line value</th></tr></thead>
        <tbody className="divide-y">
          {preview.items.map((item) => {
            const qty = full ? item.remainingReversibleQuantity : Number(quantities[item.productId]) || 0;
            return (
              <tr key={item.productId}>
                <td className="px-3 py-2"><p className="font-medium">{item.productName}</p><p className="text-xs text-muted-foreground">{item.sku} · {item.unit}</p></td>
                <td className="px-3 py-2">{formatQuantity(item.remainingReversibleQuantity)}</td>
                <td className="px-3 py-2"><input className="h-9 w-24 rounded-md border bg-background px-3" disabled={full} max={item.remainingReversibleQuantity} min={0} onChange={(event) => setQuantities({ ...quantities, [item.productId]: event.target.value })} type="number" value={full ? item.remainingReversibleQuantity : quantities[item.productId] ?? ""} /></td>
                <td className="px-3 py-2"><input className="h-9 w-24 rounded-md border bg-background px-3" disabled={noReturn} max={qty} min={0} onChange={(event) => setReturned({ ...returned, [item.productId]: event.target.value })} type="number" value={noReturn ? 0 : returned[item.productId] ?? qty} /></td>
                <td className="px-3 py-2">{formatNairaFromKobo(qty * item.originalUnitPriceKobo)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ReversalDetailClient({ reversalId }: { reversalId: string }) {
  return <BranchRequired><ReversalDetail reversalId={reversalId} /></BranchRequired>;
}

function ReversalDetail({ reversalId }: { reversalId: string }) {
  const { selectedBranchId, user } = useBranchContext();
  const [row, setRow] = useState<SaleReversalDocument | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const userName = useUserDisplayNames(
    [row?.requestedBy, row?.approvedBy, row?.completedBy, row?.rejectedBy],
    row?.branchId || selectedBranchId,
  );
  async function load() {
    const snapshot = await getDoc(doc(getFirebaseServices().db, "saleReversals", reversalId));
    if (snapshot.exists()) setRow(fromDoc<SaleReversalDocument>(snapshot.id, snapshot.data()));
  }
  useEffect(() => { void load(); }, [reversalId]);
  async function action(name: "rejectReversalRequest" | "cancelReversalRequest" | "completeApprovedReversal") {
    const reason = name === "completeApprovedReversal" ? window.prompt("Completion note", "Completed") : window.prompt(name === "rejectReversalRequest" ? "Rejection reason" : "Cancellation reason");
    if (!reason || !window.confirm("Confirm this reversal action?")) return;
    const field = name === "rejectReversalRequest" ? { rejectionReason: reason } : name === "cancelReversalRequest" ? { cancellationReason: reason } : { completionNote: reason };
    const result = await callFunction<Record<string, unknown>, { status: string }>(name, { reversalId, ...field, idempotencyKey: createIdempotencyKey(name) });
    setMessage(`Reversal ${result.status}.`);
    await load();
  }
  if (!row) return <OperationState title="Loading reversal" />;
  const admin = isAdminRole(user.platformRole);
  const manager = canManageReversals(user.platformRole);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-normal">{row.reversalNumber}</h1><p className="text-sm text-muted-foreground">{row.orderNumber} · {label(row.reversalType)}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/reversals">Back</Link></Button>
          {manager && row.status === "requested" ? <Button asChild><Link href={`/reversals/${row.id}/approve`}>Review</Link></Button> : null}
          {manager && row.status === "requested" ? <Button onClick={() => void action("cancelReversalRequest")} type="button" variant="outline">Cancel</Button> : null}
          {admin && row.status === "approved" ? <Button onClick={() => void action("completeApprovedReversal")} type="button">Complete</Button> : null}
        </div>
      </div>
      {message ? <OperationState detail={message} title="Updated" /> : null}
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Status" value={label(row.status)} />
        <Metric label="Refund" value={formatNairaFromKobo(row.refundAmountKobo)} />
        <Metric label="Credit reduction" value={formatNairaFromKobo(row.creditReductionKobo)} />
        <Metric label="Requested" value={timestampLabel(row.requestedAt)} />
      </div>
      <div className="rounded-lg border bg-card p-4 text-sm"><p className="font-medium">Reason</p><p className="mt-1 text-muted-foreground">{row.reason}</p></div>
      <ReversalItems items={row.items} />
      <div className="grid gap-2 rounded-lg border bg-card p-4 text-sm">
        <p>Requested by: {userName(row.requestedBy)} · {timestampLabel(row.requestedAt)}</p>
        <p>Approved: {row.approvedBy ? `${userName(row.approvedBy)} · ${timestampLabel(row.approvedAt)}` : "Not approved"}</p>
        <p>Completed: {row.completedBy ? `${userName(row.completedBy)} · ${timestampLabel(row.completedAt)}` : "Not completed"}</p>
        <p>Rejected: {row.rejectedBy ? `${userName(row.rejectedBy)} · ${timestampLabel(row.rejectedAt)}` : "Not rejected"}</p>
      </div>
    </div>
  );
}

export function ReversalApprovalClient({ reversalId }: { reversalId: string }) {
  return <BranchRequired><ReversalApproval reversalId={reversalId} /></BranchRequired>;
}

function ReversalApproval({ reversalId }: { reversalId: string }) {
  const { selectedBranchId } = useBranchContext();
  const [row, setRow] = useState<SaleReversalDocument | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const userName = useUserDisplayNames([row?.requestedBy], row?.branchId || selectedBranchId);
  useEffect(() => {
    void getDoc(doc(getFirebaseServices().db, "saleReversals", reversalId)).then((snapshot) => {
      if (snapshot.exists()) setRow(fromDoc<SaleReversalDocument>(snapshot.id, snapshot.data()));
    });
  }, [reversalId]);
  async function decide(decision: "approve" | "reject") {
    const rejectionReason = decision === "reject" ? note : undefined;
    if (decision === "reject" && note.trim().length < 3) {
      setMessage("Rejection reason is required.");
      return;
    }
    if (!window.confirm(`${decision === "approve" ? "Approve" : "Reject"} this reversal?`)) return;
    const fn = decision === "approve" ? "approveReversalRequest" : "rejectReversalRequest";
    const payload = decision === "approve" ? { approvalNote: note } : { rejectionReason };
    const result = await callFunction<Record<string, unknown>, { status: string }>(fn, { reversalId, ...payload, idempotencyKey: createIdempotencyKey(fn) });
    setMessage(`Reversal ${result.status}.`);
  }
  if (!row) return <OperationState title="Loading reversal review" />;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-normal">Review reversal</h1><Button asChild variant="outline"><Link href={`/reversals/${reversalId}`}>Back</Link></Button></div>
      {message ? <OperationState detail={message} title="Review updated" /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Original order total" value={formatNairaFromKobo(row.originalOrderTotalKobo)} />
        <Metric label="Requested item value" value={formatNairaFromKobo(row.reversalSubtotalKobo)} />
        <Metric label="Financial impact" value={label(row.financialImpact)} />
      </div>
      <p className="text-sm text-muted-foreground">Requested by {userName(row.requestedBy)} · {timestampLabel(row.requestedAt)}</p>
      <ReversalItems items={row.items} />
      <Field label="Approval note or rejection reason"><textarea className="min-h-24 rounded-md border bg-background px-3 py-2" onChange={(event) => setNote(event.target.value)} value={note} /></Field>
      <div className="flex gap-2"><Button onClick={() => void decide("approve")} type="button">Approve</Button><Button onClick={() => void decide("reject")} type="button" variant="destructive">Reject</Button></div>
    </div>
  );
}

function ReversalItems({ items }: { items: SaleReversalItemDocument[] }) {
  if (items.length === 0) return <OperationState detail="This reversal has no item quantity correction." title="No item movement" />;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Returned</th><th className="px-3 py-2">Not returned</th><th className="px-3 py-2">Line total</th><th className="px-3 py-2">Value impact</th></tr></thead>
        <tbody className="divide-y">{items.map((item) => <tr key={item.productId}><td className="px-3 py-2"><p className="font-medium">{item.productName}</p><p className="text-xs text-muted-foreground">{item.sku}</p></td><td className="px-3 py-2">{item.requestedReversalQuantity}</td><td className="px-3 py-2">{item.stockReturnedQuantity}</td><td className="px-3 py-2">{item.stockNotReturnedQuantity}</td><td className="px-3 py-2">{formatNairaFromKobo(item.reversalLineTotalKobo)}</td><td className="px-3 py-2">{formatNairaFromKobo(item.inventoryValueImpactKobo)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Metric({ label: metricLabel, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{metricLabel}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
