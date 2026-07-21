"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  InventoryAdjustmentRequestDocument,
  InventoryDocument,
  InventoryFinancialDocument,
  ProductDocument,
  StockCountDocument,
  StockCountItemDocument,
  StockMovementDocument,
  StockReceiptDocument,
} from "@/lib/types/operational";
import { timestampLabel } from "@/lib/types/operational";

type ReceiptLine = { productId: string; quantity: number; unitCost: string };
type CountInput = { productId: string; countedQty: string };
type InventoryOverviewResponse = {
  ok?: boolean;
  message?: string;
  items?: InventoryDocument[];
};

function fromDoc<T>(id: string, data: Record<string, unknown>) {
  return { id, ...data } as T;
}

function canManageInventory(role: string) {
  return role === "branch_manager" || role === "admin" || role === "super_admin";
}

function InventoryManagerOnly({ children }: { children: React.ReactNode }) {
  const { user } = useBranchContext();
  if (!canManageInventory(user.platformRole)) {
    return <OperationState detail="Inventory receipts, adjustments, and counts are restricted to branch managers and admins." title="Restricted view" />;
  }
  return children;
}

async function loadBranchProducts(branchId: string) {
  const snapshot = await getDocs(
    query(
      collection(getFirebaseServices().db, `branches/${branchId}/products`),
      orderBy("name"),
      limit(100),
    ),
  );
  return snapshot.docs.map((item) => fromDoc<ProductDocument>(item.id, item.data()));
}

async function loadCatalogProducts() {
  const response = await fetch("/api/catalog/products", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = (await response.json()) as {
    ok?: boolean;
    message?: string;
    products?: ProductDocument[];
  };

  if (!response.ok || !result.ok || !Array.isArray(result.products)) {
    throw new Error(result.message || "Unable to load product catalog.");
  }

  return result.products;
}

async function fetchInventoryOverview(branchId: string) {
  const response = await fetch(
    `/api/inventory/overview?branchId=${encodeURIComponent(branchId)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const result = (await response.json()) as InventoryOverviewResponse;

  if (!response.ok || !result.ok || !Array.isArray(result.items)) {
    throw new Error(result.message || "Unable to load branch inventory.");
  }

  return result.items;
}

export function InventoryListClient() {
  return (
    <BranchRequired>
      <InventoryList />
    </BranchRequired>
  );
}

function InventoryList() {
  const { selectedBranch, selectedBranchId, user } = useBranchContext();
  const [items, setItems] = useState<InventoryDocument[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const admin = isAdminRole(user.platformRole);
  const manager = canManageInventory(user.platformRole);

  async function load() {
    if (!selectedBranchId) return;
    setError(null);
    try {
      setItems(await fetchInventoryOverview(selectedBranchId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load branch inventory.");
    }
  }

  useEffect(() => {
    void load();
  }, [selectedBranchId, filter]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const available = item.onHandQty - item.reservedQty;
      if (filter === "in_stock" && available <= 0) return false;
      if (filter === "out" && available > 0) return false;
      if (!term) return true;
      return `${item.productName ?? ""} ${item.sku ?? ""}`.toLowerCase().includes(term);
    });
  }, [filter, items, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Inventory</h1>
          <p className="text-sm text-muted-foreground">{selectedBranch?.name} stock position</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void load()} type="button" variant="outline"><IconRefresh />Refresh</Button>
          {manager ? (
            <>
              <Button asChild variant="outline"><Link href="/inventory/receipts/new"><IconPlus />Receive stock</Link></Button>
              <Button asChild variant="outline"><Link href="/inventory/adjustments/new">Stock correction</Link></Button>
              <Button asChild><Link href="/inventory/counts/new">Stock count</Link></Button>
            </>
          ) : null}
        </div>
      </div>
      {error ? <OperationState detail={error} title="Inventory unavailable" /> : null}
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[180px_1fr]">
        <Field label="Filter">
          <select className="h-9 rounded-md border bg-background px-3" onChange={(event) => setFilter(event.target.value)} value={filter}>
            <option value="all">All stock</option>
            <option value="low">Low stock</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="in_stock">In stock</option>
            <option value="out">Out of stock</option>
          </select>
        </Field>
        <Field label="Search">
          <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setSearch(event.target.value)} placeholder="Product or SKU" value={search} />
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">On hand</th><th className="px-3 py-2">Reserved</th><th className="px-3 py-2">Available</th><th className="px-3 py-2">Reorder</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Updated</th><th className="px-3 py-2">Action</th></tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((item) => {
              const available = item.onHandQty - item.reservedQty;
              return (
                <tr key={item.id}>
                  <td className="px-3 py-2"><p className="font-medium">{item.productName}</p><p className="text-xs text-muted-foreground">{item.sku} · {item.unit}</p></td>
                  <td className="px-3 py-2">{formatQuantity(item.onHandQty)}</td>
                  <td className="px-3 py-2">{formatQuantity(item.reservedQty)}</td>
                  <td className="px-3 py-2 font-medium">{formatQuantity(available)}</td>
                  <td className="px-3 py-2">{formatQuantity(item.reorderLevel ?? 0)}</td>
                  <td className="px-3 py-2">{item.isLowStock ? <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">Low stock</span> : <span className="rounded-md bg-secondary px-2 py-1 text-xs">Normal</span>} {item.isActive === false ? <span className="ml-1 rounded-md bg-red-100 px-2 py-1 text-xs text-red-900">Inactive</span> : null}</td>
                  <td className="px-3 py-2">{timestampLabel(item.updatedAt)}</td>
                  <td className="px-3 py-2"><Button asChild size="sm" variant="outline"><Link href={`/inventory/${item.id}`}>Ledger</Link></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!error && visible.length === 0 ? (
        <OperationState
          detail={
            items.length > 0
              ? "Try a different search term or inventory filter."
              : manager
              ? "Products become inventory items after they are added to the active branch. Add catalog products to this branch, then post stock receipts when physical stock arrives."
              : "No branch inventory is available for this branch yet."
          }
          title={items.length > 0 ? "No matching inventory items" : "No inventory items yet"}
        />
      ) : null}
      {admin && items.length === 0 ? (
        <Button asChild variant="outline">
          <Link href="/catalog/branch-products">Add products to branch</Link>
        </Button>
      ) : null}
      {manager && !admin && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ask an administrator to allocate catalog products to this branch.
        </p>
      ) : null}
      {!admin ? <p className="text-xs text-muted-foreground">Cost and valuation data are hidden for this role.</p> : null}
    </div>
  );
}

export function InventoryDetailClient({ productId }: { productId: string }) {
  return (
    <BranchRequired>
      <InventoryDetail productId={productId} />
    </BranchRequired>
  );
}

function InventoryDetail({ productId }: { productId: string }) {
  const { selectedBranchId, user } = useBranchContext();
  const [item, setItem] = useState<InventoryDocument | null>(null);
  const [financial, setFinancial] = useState<InventoryFinancialDocument | null>(null);
  const [movements, setMovements] = useState<StockMovementDocument[]>([]);
  const admin = isAdminRole(user.platformRole);

  useEffect(() => {
    async function load() {
      if (!selectedBranchId) return;
      const { db } = getFirebaseServices();
      const inv = await getDoc(doc(db, `branches/${selectedBranchId}/inventory/${productId}`));
      if (inv.exists()) setItem(fromDoc<InventoryDocument>(inv.id, inv.data()));
      if (admin) {
        const fin = await getDoc(doc(db, `branches/${selectedBranchId}/inventoryFinancials/${productId}`));
        if (fin.exists()) setFinancial(fromDoc<InventoryFinancialDocument>(fin.id, fin.data()));
      }
      const movementSnapshot = await getDocs(query(collection(db, "stockMovements"), where("branchId", "==", selectedBranchId), where("productId", "==", productId), orderBy("createdAt", "desc"), limit(30)));
      setMovements(movementSnapshot.docs.map((row) => fromDoc<StockMovementDocument>(row.id, row.data())));
    }
    void load();
  }, [admin, productId, selectedBranchId]);

  if (!item) return <OperationState title="Loading inventory item" />;
  const available = item.onHandQty - item.reservedQty;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-normal">{item.productName}</h1><p className="text-sm text-muted-foreground">{item.sku} · {item.unit}</p></div>
        <Button asChild variant="outline"><Link href="/inventory">Back</Link></Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="On hand" value={formatQuantity(item.onHandQty)} />
        <Metric label="Reserved" value={formatQuantity(item.reservedQty)} />
        <Metric label="Available" value={formatQuantity(available)} />
        <Metric label="Reorder level" value={formatQuantity(item.reorderLevel ?? 0)} />
      </div>
      {admin && financial ? (
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-3">
          <Metric label="Average unit cost" value={formatNairaFromKobo(financial.averageUnitCostKobo)} />
          <Metric label="Stock value" value={formatNairaFromKobo(financial.stockValueKobo)} />
          <Metric label="Valuation updated" value={timestampLabel(financial.updatedAt)} />
        </div>
      ) : null}
      <LedgerTable movements={movements} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}

function LedgerTable({ movements }: { movements: StockMovementDocument[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Movement</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">On hand</th><th className="px-3 py-2">Reserved</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Date</th></tr></thead>
        <tbody className="divide-y">
          {movements.map((movement) => (
            <tr key={movement.id}>
              <td className="px-3 py-2">{movement.movementType.replaceAll("_", " ")}</td>
              <td className="px-3 py-2">{movement.quantity}</td>
              <td className="px-3 py-2">{movement.onHandBefore} → {movement.onHandAfter}</td>
              <td className="px-3 py-2">{movement.reservedBefore} → {movement.reservedAfter}</td>
              <td className="px-3 py-2">{movement.stockReceiptId || movement.adjustmentRequestId || movement.stockCountId || movement.orderId || "None"}</td>
              <td className="px-3 py-2">{timestampLabel(movement.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StockReceiptListClient() {
  return <BranchRequired><InventoryManagerOnly><StockReceiptList /></InventoryManagerOnly></BranchRequired>;
}

function StockReceiptList() {
  const { selectedBranchId, user } = useBranchContext();
  const [receipts, setReceipts] = useState<StockReceiptDocument[]>([]);
  useEffect(() => {
    async function load() {
      if (!selectedBranchId) return;
      const db = getFirebaseServices().db;
      const branchQuery = getDocs(query(collection(db, "stockReceipts"), where("branchId", "==", selectedBranchId), orderBy("receivedAt", "desc"), limit(30)));
      const allocationQuery = isAdminRole(user.platformRole)
        ? getDocs(query(collection(db, "stockReceipts"), where("destinationType", "==", "allocation_pool"), limit(30)))
        : Promise.resolve(null);
      const [branchSnapshot, allocationSnapshot] = await Promise.all([branchQuery, allocationQuery]);
      setReceipts([
        ...(allocationSnapshot?.docs.map((item) => fromDoc<StockReceiptDocument>(item.id, item.data())) ?? []),
        ...branchSnapshot.docs.map((item) => fromDoc<StockReceiptDocument>(item.id, item.data())),
      ]);
    }
    void load();
  }, [selectedBranchId, user.platformRole]);
  return <Listing title="Stock receipts" newHref="/inventory/receipts/new" rows={receipts.map((r) => ({ id: r.id, title: r.receiptNumber, detail: `${r.destinationType === "allocation_pool" ? "Unallocated stock" : "Active branch"} · ${r.items.length} item lines · ${formatNairaFromKobo(r.totalValueKobo)}`, href: `/inventory/receipts/${r.id}`, status: "posted" }))} />;
}

export function StockReceiptFormClient() {
  return <BranchRequired><InventoryManagerOnly><StockReceiptForm /></InventoryManagerOnly></BranchRequired>;
}

function StockReceiptForm() {
  const { selectedBranch, selectedBranchId, user } = useBranchContext();
  const admin = isAdminRole(user.platformRole);
  const [destination, setDestination] = useState<"branch" | "allocation_pool">("branch");
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [result, setResult] = useState<{ receiptId: string; receiptNumber: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (admin && new URLSearchParams(window.location.search).get("destination") === "allocation") {
      setDestination("allocation_pool");
    }
  }, [admin]);
  useEffect(() => {
    setLines([]);
    setResult(null);
    setError(null);

    if (destination === "allocation_pool") {
      void loadCatalogProducts().then(setProducts).catch((err) => setError(err instanceof Error ? err.message : "Unable to load products."));
    } else if (selectedBranchId) {
      void loadBranchProducts(selectedBranchId).then(setProducts).catch((err) => setError(err instanceof Error ? err.message : "Unable to load products."));
    }
  }, [destination, selectedBranchId]);
  const total = lines.reduce((sum, line) => sum + line.quantity * parseNairaToKobo(line.unitCost), 0);
  async function submit() {
    if (!selectedBranchId || !window.confirm("Post this stock receipt? It cannot be edited.")) return;
    setError(null);
    try {
      const input = { supplierName, items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitCostKobo: parseNairaToKobo(line.unitCost) })), idempotencyKey: createIdempotencyKey("receipt") };
      let response: { receiptId: string; receiptNumber: string };

      if (destination === "allocation_pool") {
        response = await callFunction<
          Record<string, unknown>,
          { receiptId: string; receiptNumber: string }
        >("recordAllocationStockReceipt", input);
      } else {
        response = await callFunction<Record<string, unknown>, { receiptId: string; receiptNumber: string }>("recordStockReceipt", { ...input, branchId: selectedBranchId });
      }
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to post receipt.");
    }
  }
  return (
    <FormShell title="New stock receipt" backHref="/inventory/receipts">
      {error ? <OperationState detail={error} title="Receipt failed" /> : null}
      {result ? <OperationState detail={result.receiptNumber} title="Receipt posted" /> : null}
      {admin ? <Field label="Destination"><div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted p-1"><Button onClick={() => setDestination("branch")} type="button" variant={destination === "branch" ? "default" : "ghost"}>{selectedBranch?.name ?? "Active branch"}</Button><Button onClick={() => setDestination("allocation_pool")} type="button" variant={destination === "allocation_pool" ? "default" : "ghost"}>For allocation</Button></div></Field> : null}
      <Field label="Supplier name"><input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setSupplierName(event.target.value)} value={supplierName} /></Field>
      <LineEditor products={products} lines={lines} setLines={setLines} />
      <div className="flex items-center justify-between rounded-lg border bg-card p-4"><span>Total</span><strong>{formatNairaFromKobo(total)}</strong></div>
      <Button disabled={lines.length === 0 || lines.some((line) => !line.productId || !line.unitCost)} onClick={() => void submit()} type="button">Post receipt</Button>
    </FormShell>
  );
}

function LineEditor({ products, lines, setLines }: { products: ProductDocument[]; lines: ReceiptLine[]; setLines: (lines: ReceiptLine[]) => void }) {
  return (
    <div className="space-y-3">
      {lines.map((line, index) => (
        <div className="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-[1fr_120px_140px_auto]" key={index}>
          <select className="h-9 rounded-md border bg-background px-3" onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, productId: event.target.value } : item))} value={line.productId}>
            <option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
          </select>
          <input className="h-9 rounded-md border bg-background px-3" min={1} onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) || 1 } : item))} type="number" value={line.quantity} />
          <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, unitCost: event.target.value } : item))} placeholder="Unit cost" value={line.unitCost} />
          <Button onClick={() => setLines(lines.filter((_, i) => i !== index))} type="button" variant="ghost">Remove</Button>
        </div>
      ))}
      <Button onClick={() => setLines([...lines, { productId: "", quantity: 1, unitCost: "" }])} type="button" variant="outline">Add item</Button>
    </div>
  );
}

export function StockReceiptDetailClient({ receiptId }: { receiptId: string }) {
  return <BranchRequired><InventoryManagerOnly><StockReceiptDetail receiptId={receiptId} /></InventoryManagerOnly></BranchRequired>;
}

function StockReceiptDetail({ receiptId }: { receiptId: string }) {
  const { selectedBranchId } = useBranchContext();
  const [receipt, setReceipt] = useState<StockReceiptDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userName = useUserDisplayNames([receipt?.receivedBy], receipt?.branchId || selectedBranchId);

  useEffect(() => {
    void getDoc(doc(getFirebaseServices().db, "stockReceipts", receiptId))
      .then((snapshot) => {
        if (!snapshot.exists()) throw new Error("Stock receipt not found.");
        setReceipt(fromDoc<StockReceiptDocument>(snapshot.id, snapshot.data()));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load stock receipt."));
  }, [receiptId]);

  if (error) return <OperationState detail={error} title="Receipt unavailable" />;
  if (!receipt) return <OperationState title="Loading receipt" />;

  return (
    <FormShell title={receipt.receiptNumber} backHref="/inventory/receipts">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Destination" value={receipt.destinationType === "allocation_pool" ? "Allocation pool" : "Branch stock"} />
        <Metric label="Supplier" value={receipt.supplierName || "Not recorded"} />
        <Metric label="Received" value={timestampLabel(receipt.receivedAt)} />
        <Metric label="Total value" value={formatNairaFromKobo(receipt.totalValueKobo)} />
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Quantity</th>
              <th className="px-3 py-2">Unit cost</th>
              <th className="px-3 py-2">Line value</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {receipt.items.map((item) => (
              <tr key={item.productId}>
                <td className="px-3 py-2"><p className="font-medium">{item.productName}</p><p className="text-xs text-muted-foreground">{item.sku}</p></td>
                <td className="px-3 py-2">{formatQuantity(item.quantity)}</td>
                <td className="px-3 py-2">{formatNairaFromKobo(item.unitCostKobo)}</td>
                <td className="px-3 py-2 font-medium">{formatNairaFromKobo(item.lineValueKobo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2">
        <p><span className="text-muted-foreground">Supplier reference:</span> {receipt.supplierReference || "Not recorded"}</p>
        <p><span className="text-muted-foreground">Delivery reference:</span> {receipt.deliveryReference || "Not recorded"}</p>
        <p><span className="text-muted-foreground">Received by:</span> {userName(receipt.receivedBy)}</p>
        <p><span className="text-muted-foreground">Status:</span> {receipt.status}</p>
        {receipt.notes ? <p className="sm:col-span-2"><span className="text-muted-foreground">Notes:</span> {receipt.notes}</p> : null}
      </div>
    </FormShell>
  );
}

export function AdjustmentListClient() {
  return <BranchRequired><InventoryManagerOnly><AdjustmentList /></InventoryManagerOnly></BranchRequired>;
}

function AdjustmentList() {
  const { selectedBranchId } = useBranchContext();
  const [rows, setRows] = useState<InventoryAdjustmentRequestDocument[]>([]);
  useEffect(() => {
    async function load() {
      if (!selectedBranchId) return;
      const snapshot = await getDocs(query(collection(getFirebaseServices().db, "inventoryAdjustmentRequests"), where("branchId", "==", selectedBranchId), orderBy("requestedAt", "desc"), limit(30)));
      setRows(snapshot.docs.map((item) => fromDoc<InventoryAdjustmentRequestDocument>(item.id, item.data())));
    }
    void load();
  }, [selectedBranchId]);
  return <Listing title="Stock corrections" newHref="/inventory/adjustments/new" rows={rows.map((r) => ({ id: r.id, title: `${r.adjustmentType.replaceAll("_", " ")} · ${r.quantity}`, detail: r.reason, href: `/inventory/adjustments/${r.id}`, status: r.status }))} />;
}

export function AdjustmentFormClient() {
  return <BranchRequired><InventoryManagerOnly><AdjustmentForm /></InventoryManagerOnly></BranchRequired>;
}

function AdjustmentForm() {
  const { selectedBranchId } = useBranchContext();
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [productId, setProductId] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("increase");
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { if (selectedBranchId) void loadBranchProducts(selectedBranchId).then(setProducts); }, [selectedBranchId]);
  async function submit() {
    if (!selectedBranchId || !window.confirm("Submit this adjustment request?")) return;
    const response = await callFunction<Record<string, unknown>, { requestId: string }>("requestInventoryAdjustment", { branchId: selectedBranchId, productId, adjustmentType, quantity, reason, ...(adjustmentType === "increase" ? { unitCostKobo: parseNairaToKobo(unitCost) } : {}), idempotencyKey: createIdempotencyKey("adjustment") });
    setMessage(`Request ${response.requestId} submitted.`);
  }
  return <FormShell title="New stock correction" backHref="/inventory/adjustments">
    {message ? <OperationState detail={message} title="Submitted" /> : null}
    <Field label="Product"><select className="h-9 rounded-md border bg-background px-3" onChange={(e) => setProductId(e.target.value)} value={productId}><option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    <Field label="Correction"><select className="h-9 rounded-md border bg-background px-3" onChange={(e) => setAdjustmentType(e.target.value)} value={adjustmentType}><option value="increase">Quantity too low</option><option value="decrease">Quantity too high</option><option value="damage_write_off">Damage write-off</option></select></Field>
    <Field label="Quantity"><input className="h-9 rounded-md border bg-background px-3" min={1} onChange={(e) => setQuantity(Number(e.target.value) || 1)} type="number" value={quantity} /></Field>
    {adjustmentType === "increase" ? <Field label="Unit cost"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setUnitCost(e.target.value)} value={unitCost} /></Field> : null}
    <Field label="Reason"><textarea className="min-h-24 rounded-md border bg-background px-3 py-2" onChange={(e) => setReason(e.target.value)} value={reason} /></Field>
    <Button disabled={!productId || reason.trim().length < 5} onClick={() => void submit().catch((err) => setMessage(err instanceof Error ? err.message : "Request failed"))} type="button">Submit request</Button>
  </FormShell>;
}

export function AdjustmentDetailClient({ requestId }: { requestId: string }) {
  return <BranchRequired><InventoryManagerOnly><AdjustmentDetail requestId={requestId} /></InventoryManagerOnly></BranchRequired>;
}

function AdjustmentDetail({ requestId }: { requestId: string }) {
  const { selectedBranchId, user } = useBranchContext();
  const [row, setRow] = useState<InventoryAdjustmentRequestDocument | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const userName = useUserDisplayNames(
    [row?.requestedBy, row?.reviewedBy],
    row?.branchId || selectedBranchId,
  );
  async function load() {
    const snapshot = await getDoc(doc(getFirebaseServices().db, "inventoryAdjustmentRequests", requestId));
    if (snapshot.exists()) setRow(fromDoc<InventoryAdjustmentRequestDocument>(snapshot.id, snapshot.data()));
  }
  useEffect(() => { void load(); }, [requestId]);
  async function decide(fn: "approveInventoryAdjustment" | "rejectInventoryAdjustment") {
    const reason = window.prompt(fn.includes("reject") ? "Rejection reason" : "Approval note", fn.includes("reject") ? "" : "Approved");
    if (!reason) return;
    const result = await callFunction<Record<string, unknown>, { status: string }>(fn, { requestId, reason, idempotencyKey: createIdempotencyKey(fn) });
    setMessage(`Request ${result.status}.`);
    await load();
  }
  if (!row) return <OperationState title="Loading adjustment" />;
  const canApprove = canManageInventory(user.platformRole);
  return <FormShell title="Stock correction" backHref="/inventory/adjustments">
    {message ? <OperationState detail={message} title="Updated" /> : null}
    <div className="grid gap-2 rounded-lg border bg-card p-4 text-sm">
      <p className="font-medium">{row.adjustmentType.replaceAll("_", " ")} · {row.quantity}</p>
      <p className="text-muted-foreground">{row.reason}</p>
      <p>Requested by: {userName(row.requestedBy)} · {timestampLabel(row.requestedAt)}</p>
      <p>Status: {row.status}</p>
      {row.reviewedBy ? <p>Reviewed by: {userName(row.reviewedBy)} · {timestampLabel(row.reviewedAt)}</p> : null}
    </div>
    {canApprove && row.status === "pending" ? <div className="flex gap-2"><Button onClick={() => void decide("approveInventoryAdjustment")} type="button">Approve</Button><Button onClick={() => void decide("rejectInventoryAdjustment")} type="button" variant="destructive">Reject</Button></div> : null}
  </FormShell>;
}

export function StockCountListClient() {
  return <BranchRequired><InventoryManagerOnly><StockCountList /></InventoryManagerOnly></BranchRequired>;
}

function StockCountList() {
  const { selectedBranchId } = useBranchContext();
  const [rows, setRows] = useState<StockCountDocument[]>([]);
  useEffect(() => {
    async function load() {
      if (!selectedBranchId) return;
      const snapshot = await getDocs(query(collection(getFirebaseServices().db, "stockCounts"), where("branchId", "==", selectedBranchId), orderBy("createdAt", "desc"), limit(30)));
      setRows(snapshot.docs.map((item) => fromDoc<StockCountDocument>(item.id, item.data())));
    }
    void load();
  }, [selectedBranchId]);
  return <Listing title="Stock counts" newHref="/inventory/counts/new" rows={rows.map((r) => ({ id: r.id, title: r.stockCountNumber, detail: `${r.productIds.length} products`, href: `/inventory/counts/${r.id}`, status: r.status }))} />;
}

export function StockCountFormClient() {
  return <BranchRequired><InventoryManagerOnly><StockCountForm /></InventoryManagerOnly></BranchRequired>;
}

function StockCountForm() {
  const { selectedBranchId } = useBranchContext();
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { if (selectedBranchId) void loadBranchProducts(selectedBranchId).then(setProducts); }, [selectedBranchId]);
  async function submit() {
    if (!selectedBranchId || !window.confirm("Start this stock count?")) return;
    const result = await callFunction<Record<string, unknown>, { stockCountId: string; stockCountNumber: string }>("startStockCount", { branchId: selectedBranchId, productIds: selected, idempotencyKey: createIdempotencyKey("stock-count") });
    setMessage(`${result.stockCountNumber} started.`);
  }
  return <FormShell title="New stock count" backHref="/inventory/counts">
    {message ? <OperationState detail={message} title="Stock count started" /> : null}
    <div className="grid gap-2 rounded-lg border bg-card p-4 md:grid-cols-2">{products.map((p) => <label className="flex items-center gap-2 text-sm" key={p.id}><input checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id].slice(0, 100) : selected.filter((id) => id !== p.id))} type="checkbox" />{p.name} · {p.sku}</label>)}</div>
    <Button disabled={selected.length === 0} onClick={() => void submit().catch((err) => setMessage(err instanceof Error ? err.message : "Count failed"))} type="button">Start count</Button>
  </FormShell>;
}

export function StockCountDetailClient({ stockCountId }: { stockCountId: string }) {
  return <BranchRequired><InventoryManagerOnly><StockCountDetail stockCountId={stockCountId} /></InventoryManagerOnly></BranchRequired>;
}

function StockCountDetail({ stockCountId }: { stockCountId: string }) {
  const { selectedBranchId, user } = useBranchContext();
  const [count, setCount] = useState<StockCountDocument | null>(null);
  const [items, setItems] = useState<StockCountItemDocument[]>([]);
  const [inputs, setInputs] = useState<CountInput[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const userName = useUserDisplayNames(
    [count?.startedBy, count?.submittedBy, count?.reviewedBy],
    count?.branchId || selectedBranchId,
  );
  async function load() {
    const { db } = getFirebaseServices();
    const countSnapshot = await getDoc(doc(db, "stockCounts", stockCountId));
    if (countSnapshot.exists()) setCount(fromDoc<StockCountDocument>(countSnapshot.id, countSnapshot.data()));
    const itemSnapshot = await getDocs(collection(db, `stockCounts/${stockCountId}/items`));
    const next = itemSnapshot.docs.map((item) => fromDoc<StockCountItemDocument>(item.id, item.data()));
    setItems(next);
    setInputs(next.map((item) => ({ productId: item.productId, countedQty: item.countedQty?.toString() ?? "" })));
  }
  useEffect(() => { void load(); }, [stockCountId]);
  async function submit() {
    await callFunction("submitStockCount", { stockCountId, items: inputs.map((item) => ({ productId: item.productId, countedQty: Number(item.countedQty) })), idempotencyKey: createIdempotencyKey("submit-count") });
    setMessage("Count submitted for approval.");
    await load();
  }
  async function decide(fn: "approveStockCount" | "rejectStockCount") {
    const reason = window.prompt(fn.includes("reject") ? "Rejection reason" : "Approval note", fn.includes("reject") ? "" : "Approved");
    if (!reason) return;
    await callFunction(fn, { stockCountId, reason, idempotencyKey: createIdempotencyKey(fn) });
    setMessage(fn.includes("approve") ? "Count approved." : "Count rejected.");
    await load();
  }
  if (!count) return <OperationState title="Loading stock count" />;
  const canApprove = canManageInventory(user.platformRole);
  return <FormShell title={count.stockCountNumber} backHref="/inventory/counts">
    {message ? <OperationState detail={message} title="Updated" /> : null}
    <div className="grid gap-1 text-sm text-muted-foreground">
      <p>Status: {count.status}. Inventory changes only after approval.</p>
      <p>Started by: {userName(count.startedBy)} · {timestampLabel(count.startedAt)}</p>
      {count.submittedBy ? <p>Submitted by: {userName(count.submittedBy)} · {timestampLabel(count.submittedAt)}</p> : null}
      {count.reviewedBy ? <p>Reviewed by: {userName(count.reviewedBy)} · {timestampLabel(count.reviewedAt)}</p> : null}
    </div>
    <div className="space-y-2">{items.map((item) => <div className="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-[1fr_160px_160px]" key={item.id}><span>{item.productId}</span><span>Expected {item.expectedOnHandQtyAtStart}</span><input className="h-9 rounded-md border bg-background px-3" disabled={count.status !== "open"} onChange={(e) => setInputs(inputs.map((input) => input.productId === item.productId ? { ...input, countedQty: e.target.value } : input))} placeholder="Counted" value={inputs.find((input) => input.productId === item.productId)?.countedQty ?? ""} /></div>)}</div>
    {count.status === "open" ? <Button onClick={() => void submit().catch((err) => setMessage(err instanceof Error ? err.message : "Submit failed"))} type="button">Submit count</Button> : null}
    {canApprove && count.status === "submitted" ? <div className="flex gap-2"><Button onClick={() => void decide("approveStockCount").catch((err) => setMessage(err instanceof Error ? err.message : "Approval failed"))} type="button">Approve</Button><Button onClick={() => void decide("rejectStockCount")} type="button" variant="destructive">Reject</Button></div> : null}
  </FormShell>;
}

function Listing({ title, newHref, rows }: { title: string; newHref: string; rows: Array<{ id: string; title: string; detail: string; href: string; status: string }> }) {
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-normal">{title}</h1><Button asChild><Link href={newHref}><IconPlus />New</Link></Button></div><div className="grid gap-3">{rows.map((row) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4" key={row.id}><div><p className="font-medium">{row.title}</p><p className="text-sm text-muted-foreground">{row.detail}</p></div><div className="flex items-center gap-2"><span className="rounded-md bg-secondary px-2 py-1 text-xs">{row.status}</span><Button asChild variant="outline"><Link href={row.href}>Open</Link></Button></div></div>)}</div></div>;
}

function FormShell({ title, backHref, children }: { title: string; backHref: string; children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-normal">{title}</h1><Button asChild variant="outline"><Link href={backHref}>Back</Link></Button></div>{children}</div>;
}
