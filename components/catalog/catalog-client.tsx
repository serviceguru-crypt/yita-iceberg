"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BranchRequired } from "@/components/branch/branch-required";
import { useBranchContext } from "@/components/branch/branch-context";
import { QrCode } from "@/components/qr/qr-code";
import { QrPrintButton } from "@/components/qr/qr-print-button";
import { Field } from "@/components/shared/field";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { isAdminRole } from "@/lib/domain/roles";
import { callFunction } from "@/lib/firebase/callables";
import { parseNairaToKobo } from "@/lib/format/number";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { ProductDocument } from "@/lib/types/operational";

type ProductListResponse = {
  ok?: boolean;
  message?: string;
  products?: ProductDocument[];
};

type ProductDetailResponse = {
  ok?: boolean;
  message?: string;
  product?: ProductDocument;
};

type CreateProductResponse = {
  ok?: boolean;
  message?: string;
  productId?: string;
  sku?: string;
  qrCodePayload?: string;
};
type BranchProductResponse = {
  ok?: boolean;
  message?: string;
  productId?: string;
  branchId?: string;
};

async function fetchProducts() {
  const response = await fetch("/api/catalog/products", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = (await response.json()) as ProductListResponse;

  if (!response.ok || !result.ok || !Array.isArray(result.products)) {
    throw new Error(result.message || "Unable to load product catalog.");
  }

  return result.products;
}

async function fetchProduct(productId: string) {
  const response = await fetch(`/api/catalog/products/${productId}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = (await response.json()) as ProductDetailResponse;

  if (!response.ok || !result.ok || !result.product) {
    throw new Error(result.message || "Unable to load product.");
  }

  return result.product;
}

async function createProduct(input: {
  name: string;
  unit: string;
  barcode?: string;
  idempotencyKey: string;
}) {
  const response = await fetch("/api/catalog/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
  });
  const result = (await response.json()) as CreateProductResponse;

  if (
    !response.ok ||
    !result.ok ||
    !result.productId ||
    !result.sku ||
    !result.qrCodePayload
  ) {
    throw new Error(result.message || "Unable to create product.");
  }

  return result;
}

async function addBranchProduct(input: {
  branchId: string;
  productId: string;
  sellingPriceKobo: number;
  minimumPriceKobo: number;
  defaultCostPriceKobo: number;
  reorderLevel: number;
  idempotencyKey: string;
}) {
  const response = await fetch("/api/catalog/branch-products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
  });
  const result = (await response.json()) as BranchProductResponse;

  if (!response.ok || !result.ok || !result.productId) {
    throw new Error(result.message || "Unable to add product to branch.");
  }

  return result;
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
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setProducts(await fetchProducts());
        setMessage(null);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Unable to load product catalog.",
        );
      }
    }

    void load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-normal">Product catalog</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/catalog/branch-products">Branch products</Link>
          </Button>
          <Button asChild>
            <Link href="/catalog/products/new">New product</Link>
          </Button>
        </div>
      </div>
      {message ? (
        <OperationState detail={message} title="Catalog unavailable" />
      ) : null}
      {!message && products.length === 0 ? (
        <OperationState
          detail="Create the first product to begin setting up branch inventory."
          title="No products found"
        />
      ) : null}
      <div className="grid gap-3">
        {products.map((product) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
            key={product.id}
          >
            <div>
              <p className="font-medium">{product.name}</p>
              <p className="text-sm text-muted-foreground">
                {product.sku} · {product.unit}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-secondary px-2 py-1 text-xs">
                {product.isActive === false ? "archived" : "active"}
              </span>
              <Button asChild variant="outline">
                <Link href={`/catalog/products/${product.id}`}>Open</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductFormClient() {
  return (
    <AdminOnly>
      <ProductForm />
    </AdminOnly>
  );
}

function ProductForm() {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [barcode, setBarcode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [createdProduct, setCreatedProduct] = useState<CreateProductResponse | null>(null);

  async function submit() {
    const result = await createProduct({
      name,
      unit,
      ...(barcode.trim() ? { barcode } : {}),
      idempotencyKey: createIdempotencyKey("product"),
    });

    setCreatedProduct(result);
    setMessage(`Product ${result.sku} created with a scannable QR code.`);
    setName("");
    setUnit("");
    setBarcode("");
  }

  return <FormShell title="New product" backHref="/catalog/products">{message ? <OperationState detail={message} title="Created" /> : null}{createdProduct?.qrCodePayload ? <div className="print-surface app-surface flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center"><QrCode alt={`Product QR code for ${createdProduct.sku}`} payload={createdProduct.qrCodePayload} /><div className="space-y-3"><div><p className="text-sm font-semibold">Generated product label</p><p className="text-sm text-muted-foreground">SKU {createdProduct.sku}. Scan this QR to identify the product record.</p></div><QrPrintButton payload={createdProduct.qrCodePayload} /><Button asChild variant="outline"><Link href={`/catalog/products/${createdProduct.productId}`}>Open product</Link></Button></div></div> : null}<div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">SKU and QR code will be generated automatically when the product is created.</div><Field label="Name"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setName(e.target.value)} value={name} /></Field><Field label="Unit"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setUnit(e.target.value)} value={unit} /></Field><Field label="Barcode"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setBarcode(e.target.value)} value={barcode} /></Field><Button disabled={!name || !unit} onClick={() => void submit().catch((err) => setMessage(err instanceof Error ? err.message : "Create failed"))} type="button">Create product</Button></FormShell>;
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
    async function load() {
      try {
        setProduct(await fetchProduct(productId));
        setMessage(null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to load product.");
      }
    }

    void load();
  }, [productId]);

  async function archive() {
    if (!window.confirm("Archive this product? It will be unavailable for new branch setup.")) return;
    await callFunction("archiveProduct", { productId, idempotencyKey: createIdempotencyKey("archive-product") });
    setMessage("Product archived.");
  }

  if (!product && message) {
    return <OperationState detail={message} title="Product unavailable" />;
  }

  if (!product) return <OperationState title="Loading product" />;

  return <FormShell title={product.name} backHref="/catalog/products">{message ? <OperationState detail={message} title="Updated" /> : null}<div className="grid gap-4 md:grid-cols-[1fr_auto]"><div className="rounded-lg border bg-card p-4 text-sm"><p>{product.sku} · {product.unit}</p><p className="text-muted-foreground">Barcode: {product.barcode || "None"}</p><p>Status: {product.isActive === false ? "Archived" : "Active"}</p></div>{product.qrCodePayload ? <div className="print-surface app-surface rounded-xl border p-4"><QrCode alt={`Product QR code for ${product.sku}`} payload={product.qrCodePayload} /><div className="mt-3 flex justify-center"><QrPrintButton payload={product.qrCodePayload} /></div></div> : <OperationState detail="This product was created before QR payload generation was enabled." title="QR unavailable" />}</div><Button disabled={product.isActive === false} onClick={() => void archive().catch((err) => setMessage(err instanceof Error ? err.message : "Archive failed"))} type="button" variant="destructive">Archive product</Button></FormShell>;
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
      try {
        setCatalog(await fetchProducts());
        setMessage(null);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Unable to load product catalog.",
        );
      }
    }

    void load();
  }, []);

  async function add() {
    if (!selectedBranchId || !window.confirm("Add this product to the active branch? Initial stock remains zero.")) return;
    await addBranchProduct({ branchId: selectedBranchId, productId, sellingPriceKobo: parseNairaToKobo(sellingPrice), minimumPriceKobo: parseNairaToKobo(minimumPrice), defaultCostPriceKobo: parseNairaToKobo(defaultCost), reorderLevel, idempotencyKey: createIdempotencyKey("branch-product") });
    setMessage("Branch product added with zero initial stock.");
  }
  return <FormShell title="Branch product setup" backHref="/catalog/products">{message ? <OperationState detail={message} title="Saved" /> : null}<Field label="Product"><select className="h-9 rounded-md border bg-background px-3" onChange={(e) => setProductId(e.target.value)} value={productId}><option value="">Select product</option>{catalog.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></Field><Field label="Selling price"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setSellingPrice(e.target.value)} value={sellingPrice} /></Field><Field label="Protected minimum price"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setMinimumPrice(e.target.value)} value={minimumPrice} /></Field><Field label="Default cost control"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setDefaultCost(e.target.value)} value={defaultCost} /></Field><Field label="Reorder level"><input className="h-9 rounded-md border bg-background px-3" min={0} onChange={(e) => setReorderLevel(Number(e.target.value) || 0)} type="number" value={reorderLevel} /></Field><Button disabled={!productId || !sellingPrice || !minimumPrice} onClick={() => void add().catch((err) => setMessage(err instanceof Error ? err.message : "Save failed"))} type="button">Add to branch</Button></FormShell>;
}

function FormShell({ title, backHref, children }: { title: string; backHref: string; children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-normal">{title}</h1><Button asChild variant="outline"><Link href={backHref}>Back</Link></Button></div>{children}</div>;
}
