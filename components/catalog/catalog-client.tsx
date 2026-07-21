"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ref, uploadBytes } from "firebase/storage";

import { BranchRequired } from "@/components/branch/branch-required";
import { useBranchContext } from "@/components/branch/branch-context";
import { ProductImage } from "@/components/catalog/product-image";
import { QrCode } from "@/components/qr/qr-code";
import { QrPrintButton } from "@/components/qr/qr-print-button";
import { Field } from "@/components/shared/field";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { isAdminRole } from "@/lib/domain/roles";
import { callFunction } from "@/lib/firebase/callables";
import { getFirebaseServices } from "@/lib/firebase/client";
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
  allocatedQuantity?: number;
  remainingQuantity?: number;
};

type StockPool = {
  productId: string;
  totalQuantity: number;
  allocatedQuantity: number;
  remainingQuantity: number;
  averageUnitCostKobo: number;
  remainingStockValueKobo: number;
};

type StockPoolResponse = {
  ok?: boolean;
  message?: string;
  pool?: StockPool;
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

async function uploadProductImage(productId: string, file: File, uploadedBy: string) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(file.type)) {
    throw new Error("Use a JPEG, PNG, or WebP product image.");
  }
  if (file.size >= 5 * 1024 * 1024) {
    throw new Error("Product images must be smaller than 5 MB.");
  }

  const imageStoragePath = `product-images/${productId}/primary`;
  await uploadBytes(ref(getFirebaseServices().storage, imageStoragePath), file, {
    contentType: file.type,
    customMetadata: { productId, uploadedBy },
  });
  const response = await fetch(`/api/catalog/products/${productId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ imageStoragePath, imageContentType: file.type }),
  });
  const result = (await response.json()) as ProductDetailResponse;
  if (!response.ok || !result.ok || !result.product) {
    throw new Error(result.message || "Unable to attach the product image.");
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
  allocationQuantity: number;
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

async function fetchStockPool(productId: string) {
  const response = await fetch(
    `/api/catalog/stock-pools?productId=${encodeURIComponent(productId)}`,
    { cache: "no-store", credentials: "same-origin" },
  );
  const result = (await response.json()) as StockPoolResponse;

  if (!response.ok || !result.ok || !result.pool) {
    throw new Error(result.message || "Unable to load stock available for allocation.");
  }

  return result.pool;
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
            <div className="flex min-w-0 items-center gap-3">
              <ProductImage alt={product.name} className="size-16" path={product.imageStoragePath} version={product.imageUpdatedAt} />
              <div className="min-w-0">
                <p className="font-medium">{product.name}</p>
                <p className="text-sm text-muted-foreground">
                  {product.sku} · {product.unit}
                </p>
              </div>
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
  const { user } = useBranchContext();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [barcode, setBarcode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [createdProduct, setCreatedProduct] = useState<CreateProductResponse | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await createProduct({
        name,
        unit,
        ...(barcode.trim() ? { barcode } : {}),
        idempotencyKey: createIdempotencyKey("product"),
      });
      if (imageFile) await uploadProductImage(result.productId!, imageFile, user.uid);

      setCreatedProduct(result);
      setMessage(`Product ${result.sku} created with a scannable QR code${imageFile ? " and image" : ""}.`);
      setName("");
      setUnit("");
      setBarcode("");
      setImageFile(null);
    } finally {
      setSaving(false);
    }
  }

  return <FormShell title="New product" backHref="/catalog/products">{message ? <OperationState detail={message} title={createdProduct ? "Created" : "Product image"} /> : null}{createdProduct?.qrCodePayload ? <div className="print-surface app-surface flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center"><QrCode alt={`Product QR code for ${createdProduct.sku}`} payload={createdProduct.qrCodePayload} /><div className="space-y-3"><div><p className="text-sm font-semibold">Generated product label</p><p className="text-sm text-muted-foreground">SKU {createdProduct.sku}. Scan this QR to identify the product record.</p></div><QrPrintButton payload={createdProduct.qrCodePayload} /><Button asChild variant="outline"><Link href={`/catalog/products/${createdProduct.productId}`}>Open product</Link></Button></div></div> : null}<div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">SKU and QR code will be generated automatically when the product is created.</div><Field label="Name"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setName(e.target.value)} value={name} /></Field><Field label="Unit"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setUnit(e.target.value)} value={unit} /></Field><Field label="Barcode"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setBarcode(e.target.value)} value={barcode} /></Field><Field label="Product image"><input accept="image/jpeg,image/png,image/webp" className="block w-full rounded-md border bg-background p-2 text-sm" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} type="file" /></Field><Button disabled={saving || !name || !unit} onClick={() => void submit().catch((err) => setMessage(err instanceof Error ? err.message : "Create failed"))} type="button">{saving ? "Creating..." : "Create product"}</Button></FormShell>;
}

export function ProductDetailClient({ productId }: { productId: string }) {
  return (
    <AdminOnly>
      <ProductDetail productId={productId} />
    </AdminOnly>
  );
}

function ProductDetail({ productId }: { productId: string }) {
  const { user } = useBranchContext();
  const [product, setProduct] = useState<ProductDocument | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  function populateFields(next: ProductDocument) {
    setProduct(next);
    setName(next.name);
    setUnit(next.unit);
    setDescription(next.description ?? "");
    setCategoryId(next.categoryId ?? "");
    setBarcode(next.barcode ?? "");
  }

  async function load() {
    try {
      populateFields(await fetchProduct(productId));
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load product.");
    }
  }

  useEffect(() => {
    void load();
  }, [productId]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await callFunction("updateProduct", {
        productId,
        name,
        unit,
        description,
        categoryId,
        barcode,
        idempotencyKey: createIdempotencyKey("update-product"),
      });
      await load();
      setMessage("Product details updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update product.");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!window.confirm("Archive this product? It will be unavailable for new branch setup.")) return;
    await callFunction("archiveProduct", { productId, idempotencyKey: createIdempotencyKey("archive-product") });
    setMessage("Product archived.");
  }

  async function replaceImage() {
    if (!imageFile) return;
    setUploadingImage(true);
    setMessage(null);
    try {
      populateFields(await uploadProductImage(productId, imageFile, user.uid));
      setImageFile(null);
      setMessage("Product image updated.");
    } finally {
      setUploadingImage(false);
    }
  }

  if (!product && message) {
    return <OperationState detail={message} title="Product unavailable" />;
  }

  if (!product) return <OperationState title="Loading product" />;

  return (
    <FormShell title={product.name} backHref="/catalog/products">
      {message ? <OperationState detail={message} title="Product update" /> : null}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-3 rounded-lg border bg-card p-4">
          <div className="text-sm">
            <p className="font-medium">SKU {product.sku}</p>
            <p className="text-muted-foreground">Status: {product.isActive === false ? "Archived" : "Active"}</p>
          </div>
          <Field label="Name"><input className="h-9 rounded-md border bg-background px-3" disabled={product.isActive === false} onChange={(event) => setName(event.target.value)} value={name} /></Field>
          <Field label="Unit"><input className="h-9 rounded-md border bg-background px-3" disabled={product.isActive === false} onChange={(event) => setUnit(event.target.value)} value={unit} /></Field>
          <Field label="Category"><input className="h-9 rounded-md border bg-background px-3" disabled={product.isActive === false} onChange={(event) => setCategoryId(event.target.value)} value={categoryId} /></Field>
          <Field label="Barcode"><input className="h-9 rounded-md border bg-background px-3" disabled={product.isActive === false} onChange={(event) => setBarcode(event.target.value)} value={barcode} /></Field>
          <Field label="Description"><textarea className="min-h-24 rounded-md border bg-background px-3 py-2" disabled={product.isActive === false} onChange={(event) => setDescription(event.target.value)} value={description} /></Field>
          <Button disabled={saving || product.isActive === false || !name.trim() || !unit.trim()} onClick={() => void save()} type="button">
            {saving ? "Saving" : "Save changes"}
          </Button>
        </div>
        <div className="space-y-4">
          <div className="app-surface space-y-3 rounded-lg border p-4">
            <ProductImage alt={product.name} className="w-full max-w-64" path={product.imageStoragePath} version={product.imageUpdatedAt} />
            <Field label={product.imageStoragePath ? "Replace product image" : "Add product image"}><input accept="image/jpeg,image/png,image/webp" className="block w-full rounded-md border bg-background p-2 text-sm" disabled={product.isActive === false} onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} type="file" /></Field>
            <Button disabled={!imageFile || uploadingImage || product.isActive === false} onClick={() => void replaceImage().catch((error) => setMessage(error instanceof Error ? error.message : "Image upload failed"))} type="button" variant="outline">{uploadingImage ? "Uploading..." : "Save image"}</Button>
          </div>
          {product.qrCodePayload ? (
            <div className="print-surface app-surface h-fit rounded-xl border p-4">
              <QrCode alt={`Product QR code for ${product.sku}`} payload={product.qrCodePayload} />
              <div className="mt-3 flex justify-center"><QrPrintButton payload={product.qrCodePayload} /></div>
            </div>
          ) : <OperationState detail="This product was created before QR payload generation was enabled." title="QR unavailable" />}
        </div>
      </div>
      <Button disabled={product.isActive === false} onClick={() => void archive().catch((err) => setMessage(err instanceof Error ? err.message : "Archive failed"))} type="button" variant="destructive">
        Archive product
      </Button>
    </FormShell>
  );
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
  const { selectedBranch, selectedBranchId } = useBranchContext();
  const [catalog, setCatalog] = useState<ProductDocument[]>([]);
  const [productId, setProductId] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [defaultCost, setDefaultCost] = useState("");
  const [reorderLevel, setReorderLevel] = useState(0);
  const [allocationQuantity, setAllocationQuantity] = useState(0);
  const [stockPool, setStockPool] = useState<StockPool | null>(null);
  const [loadingPool, setLoadingPool] = useState(false);
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

  useEffect(() => {
    if (!productId) {
      setStockPool(null);
      return;
    }

    setLoadingPool(true);
    fetchStockPool(productId)
      .then((pool) => {
        setStockPool(pool);
        setAllocationQuantity(0);
        setMessage(null);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load stock available for allocation."))
      .finally(() => setLoadingPool(false));
  }, [productId]);

  async function add() {
    if (!selectedBranchId || !window.confirm(`Allocate ${allocationQuantity} unit(s) to ${selectedBranch?.name ?? "the active branch"}?`)) return;
    const result = await addBranchProduct({ branchId: selectedBranchId, productId, sellingPriceKobo: parseNairaToKobo(sellingPrice), minimumPriceKobo: parseNairaToKobo(minimumPrice), defaultCostPriceKobo: parseNairaToKobo(defaultCost), reorderLevel, allocationQuantity, idempotencyKey: createIdempotencyKey("branch-product") });
    setStockPool((current) => current ? {
      ...current,
      allocatedQuantity: current.allocatedQuantity + allocationQuantity,
      remainingQuantity: result.remainingQuantity ?? current.remainingQuantity - allocationQuantity,
    } : current);
    setMessage(`${allocationQuantity} unit(s) allocated to ${selectedBranch?.name ?? "the active branch"}.`);
    setAllocationQuantity(0);
  }
  return <FormShell title="Branch product setup" backHref="/catalog/products">
    {message ? <OperationState detail={message} title="Stock updated" /> : null}
    <div className="app-surface rounded-lg border p-4">
      <p className="text-sm font-semibold">Active branch</p>
      <p className="text-sm text-muted-foreground">{selectedBranch?.name ?? "Select a branch from the navigation first."}</p>
    </div>
    <Field label="Product"><select className="h-9 rounded-md border bg-background px-3" onChange={(e) => setProductId(e.target.value)} value={productId}><option value="">Select product</option>{catalog.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></Field>
    {loadingPool ? <OperationState title="Loading allocation stock" /> : null}
    {stockPool ? <>
      <div className="grid grid-cols-3 gap-2">
        <StockMetric label="Total received" value={stockPool.totalQuantity} />
        <StockMetric label="Allocated to branches" value={stockPool.allocatedQuantity} />
        <StockMetric label="Available to allocate" value={stockPool.remainingQuantity} />
      </div>
      {stockPool.remainingQuantity === 0 ? <Button asChild variant="outline"><Link href="/inventory/receipts/new?destination=allocation">Receive stock for allocation</Link></Button> : null}
      <Field label={`Quantity for ${selectedBranch?.name ?? "active branch"}`}><input className="h-9 rounded-md border bg-background px-3" max={stockPool.remainingQuantity} min={1} onChange={(e) => setAllocationQuantity(Number(e.target.value) || 0)} type="number" value={allocationQuantity || ""} /></Field>
    </> : null}
    <Field label="Selling price"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setSellingPrice(e.target.value)} value={sellingPrice} /></Field>
    <Field label="Protected minimum price"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setMinimumPrice(e.target.value)} value={minimumPrice} /></Field>
    <Field label="Default unit cost"><input className="h-9 rounded-md border bg-background px-3" onChange={(e) => setDefaultCost(e.target.value)} value={defaultCost} /></Field>
    <Field label="Reorder level"><input className="h-9 rounded-md border bg-background px-3" min={0} onChange={(e) => setReorderLevel(Number(e.target.value) || 0)} type="number" value={reorderLevel} /></Field>
    <Button disabled={!productId || !sellingPrice || !minimumPrice || allocationQuantity <= 0 || allocationQuantity > (stockPool?.remainingQuantity ?? 0)} onClick={() => void add().catch((err) => setMessage(err instanceof Error ? err.message : "Save failed"))} type="button">Allocate to branch</Button>
  </FormShell>;
}

function StockMetric({ label, value }: { label: string; value: number }) {
  return <div className="app-surface min-w-0 rounded-lg border p-3 text-center"><p className="text-xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}

function FormShell({ title, backHref, children }: { title: string; backHref: string; children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-normal">{title}</h1><Button asChild variant="outline"><Link href={backHref}>Back</Link></Button></div>{children}</div>;
}
