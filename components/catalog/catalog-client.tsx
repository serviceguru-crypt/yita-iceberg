"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from "firebase/firestore";

import { BranchRequired } from "@/components/branch/branch-required";
import { useBranchContext } from "@/components/branch/branch-context";
import { Field } from "@/components/shared/field";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { isAdminRole } from "@/lib/domain/roles";
import { callFunction } from "@/lib/firebase/callables";
import { getFirebaseServices } from "@/lib/firebase/client";
import { parseNairaToKobo } from "@/lib/format/number";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { ProductDocument } from "@/lib/types/operational";

function fromDoc<T>(id: string, data: Record<string, unknown>) {
  return { id, ...data } as T;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useBranchContext();
  if (!isAdminRole(user.platformRole)) {
    return <OperationState title="Restricted" detail="Only admin and super-admin users can manage the product catalog." />;
  }
  return children;
}

export function ProductCatalogClient() {
  return (
    <AdminOnly>
      <ProductCatalog />
    </AdminOnly>
  );
}

function ProductCatalog() {
  const [products, setProducts] = useState<ProductDocument[]>([]);
  useEffect(() => {
    async function load() {
      const snapshot = await getDocs(query(collection(getFirebaseServices().db, "products"), orderBy("name"), limit(50)));
      setProducts(snapshot.docs.map((item) => fromDoc<ProductDocument>(item.id, item.data())));
    }
    void load();
  }, []);
  return <div className="space-y-5"><div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-normal">Product catalog</h1><div className="flex gap-2"><Button asChild variant="outline"><Link href="/catalog/branch-products">Branch products</Link></Button><Button asChild><Link href="/catalog/products/new">New product</Link></Button></div></div><div className="grid gap-3">{products.map((p) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4" key={p.id}><div><p className="font-medium">{p.name}</p><p className="text-sm text-muted-foreground">{p.sku} · {p.unit}</p></div><div className="flex items-center gap-2"><span className="rounded-md bg-secondary px-2 py-1 text-xs">{p.isActive === false ? "archived" : "active"}</span><Button asChild variant="outline"><Link href={`/catalog/products/${p.id}`}>Open</Link></Button></div></div>)}</div></div>;
}

export function ProductFormClient() {
  return (
    <AdminOnly>
      <ProductForm />
    </AdminOnly>
  );
}

function ProductForm() {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [barcode, setBarcode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  async function submit() {
    const result = await callFunction<Record<string, unknown>, { productId: string }>("createProduct", { sku, name, unit, ...(barcode.trim() ? { barcode } : {}), idempotencyKey: createIdempotencyKey("product") });
    setMessage(`Product ${result.productId} created.`);
  }
  return <FormShell title="New product" backHref="/catalog/products">{message ? <OperationState detail={message} title="Created" /> : null}<Field label="SKU"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setSku(e.target.value)} value={sku} /></Field><Field label="Name"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setName(e.target.value)} value={name} /></Field><Field label="Unit"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setUnit(e.target.value)} value={unit} /></Field><Field label="Barcode"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setBarcode(e.target.value)} value={barcode} /></Field><Button disabled={!sku || !name || !unit} onClick={() => void submit().catch((err) => setMessage(err instanceof Error ? err.message : "Create failed"))} type="button">Create product</Button></FormShell>;
}

export function ProductDetailClient({ productId }: { productId: string }) {
  return (
    <AdminOnly>
      <ProductDetail productId={productId} />
    </AdminOnly>
  );
}

function ProductDetail({ productId }: { productId: string }) {
  const [product, setProduct] = useState<ProductDocument | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void getDoc(doc(getFirebaseServices().db, "products", productId)).then((snapshot) => snapshot.exists() && setProduct(fromDoc<ProductDocument>(snapshot.id, snapshot.data())));
  }, [productId]);
  async function archive() {
    if (!window.confirm("Archive this product? It will be unavailable for new branch setup.")) return;
    await callFunction("archiveProduct", { productId, idempotencyKey: createIdempotencyKey("archive-product") });
    setMessage("Product archived.");
  }
  if (!product) return <OperationState title="Loading product" />;
  return <FormShell title={product.name} backHref="/catalog/products">{message ? <OperationState detail={message} title="Updated" /> : null}<div className="rounded-lg border bg-card p-4 text-sm"><p>{product.sku} · {product.unit}</p><p className="text-muted-foreground">Barcode: {product.barcode || "None"}</p><p>Status: {product.isActive === false ? "Archived" : "Active"}</p></div><Button disabled={product.isActive === false} onClick={() => void archive().catch((err) => setMessage(err instanceof Error ? err.message : "Archive failed"))} type="button" variant="destructive">Archive product</Button></FormShell>;
}

export function BranchProductsClient() {
  return (
    <BranchRequired>
      <AdminOnly>
        <BranchProducts />
      </AdminOnly>
    </BranchRequired>
  );
}

function BranchProducts() {
  const { selectedBranchId } = useBranchContext();
  const [catalog, setCatalog] = useState<ProductDocument[]>([]);
  const [productId, setProductId] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [defaultCost, setDefaultCost] = useState("");
  const [reorderLevel, setReorderLevel] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    async function load() {
      const snapshot = await getDocs(query(collection(getFirebaseServices().db, "products"), orderBy("name"), limit(100)));
      setCatalog(snapshot.docs.map((item) => fromDoc<ProductDocument>(item.id, item.data())));
    }
    void load();
  }, []);
  async function add() {
    if (!selectedBranchId || !window.confirm("Add this product to the active branch? Initial stock remains zero.")) return;
    await callFunction("addBranchProduct", { branchId: selectedBranchId, productId, sellingPriceKobo: parseNairaToKobo(sellingPrice), minimumPriceKobo: parseNairaToKobo(minimumPrice), defaultCostPriceKobo: parseNairaToKobo(defaultCost), reorderLevel, idempotencyKey: createIdempotencyKey("branch-product") });
    setMessage("Branch product added with zero initial stock.");
  }
  return <FormShell title="Branch product setup" backHref="/catalog/products">{message ? <OperationState detail={message} title="Saved" /> : null}<Field label="Product"><select className="h-9 rounded-md border bg-background px-3" onChange={(e) => setProductId(e.target.value)} value={productId}><option value="">Select product</option>{catalog.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></Field><Field label="Selling price"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setSellingPrice(e.target.value)} value={sellingPrice} /></Field><Field label="Protected minimum price"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setMinimumPrice(e.target.value)} value={minimumPrice} /></Field><Field label="Default cost control"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setDefaultCost(e.target.value)} value={defaultCost} /></Field><Field label="Reorder level"><input className="h-9 rounded-md border bg-background px-3" min={0} onChange={(e) => setReorderLevel(Number(e.target.value) || 0)} type="number" value={reorderLevel} /></Field><Button disabled={!productId || !sellingPrice || !minimumPrice} onClick={() => void add().catch((err) => setMessage(err instanceof Error ? err.message : "Save failed"))} type="button">Add to branch</Button></FormShell>;
}

function FormShell({ title, backHref, children }: { title: string; backHref: string; children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-normal">{title}</h1><Button asChild variant="outline"><Link href={backHref}>Back</Link></Button></div>{children}</div>;
}
