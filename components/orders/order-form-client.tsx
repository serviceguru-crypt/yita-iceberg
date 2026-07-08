"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { IconTrash } from "@tabler/icons-react";

import { BranchRequired } from "@/components/branch/branch-required";
import { useBranchContext } from "@/components/branch/branch-context";
import { Field } from "@/components/shared/field";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { callFunction } from "@/lib/firebase/callables";
import { getFirebaseServices } from "@/lib/firebase/client";
import { formatNairaFromKobo, formatQuantity } from "@/lib/format/number";
import { createIdempotencyKey } from "@/lib/idempotency";
import { storeOrderQrToken } from "@/lib/qr/volatile-token-store";
import type {
  CustomerDocument,
  InventoryDocument,
  OrderDocument,
  ProductDocument,
} from "@/lib/types/operational";

type CartLine = {
  productId: string;
  quantity: number;
  discountPercent: number;
  discountReason: string;
};

type CreateOrderResult = {
  orderId: string;
  orderNumber: string;
  qrToken: string;
  status: string;
};

function toProduct(id: string, data: Record<string, unknown>): ProductDocument {
  return {
    id,
    sku: String(data.sku ?? ""),
    name: String(data.name ?? id),
    unit: String(data.unit ?? ""),
    sellingPriceKobo: Number(data.sellingPriceKobo ?? 0),
    minimumPriceKobo: Number(data.minimumPriceKobo ?? 0),
    isActive: data.isActive === true,
  };
}

function toCustomer(id: string, data: Record<string, unknown>): CustomerDocument {
  return { id, ...(data as Omit<CustomerDocument, "id">) };
}

export function OrderFormClient({
  mode,
  orderId,
}: {
  mode: "create" | "edit";
  orderId?: string;
}) {
  return (
    <BranchRequired>
      <OrderFormContent mode={mode} orderId={orderId} />
    </BranchRequired>
  );
}

function OrderFormContent({
  mode,
  orderId,
}: {
  mode: "create" | "edit";
  orderId?: string;
}) {
  const { selectedBranch, selectedBranchId } = useBranchContext();
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [inventory, setInventory] = useState<Record<string, InventoryDocument>>({});
  const [customers, setCustomers] = useState<CustomerDocument[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerType, setCustomerType] = useState<"walk_in" | "registered">("walk_in");
  const [customerId, setCustomerId] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateOrderResult | null>(null);
  const requireDiscountReason = selectedBranch?.settings?.requireDiscountReason === true;

  async function loadData() {
    if (!selectedBranchId) return;
    setLoading(true);
    setError(null);

    try {
      const { db } = getFirebaseServices();
      const [productsSnapshot, inventorySnapshot, customersSnapshot] =
        await Promise.all([
          getDocs(query(collection(db, `branches/${selectedBranchId}/products`), where("isActive", "==", true), limit(50))),
          getDocs(query(collection(db, `branches/${selectedBranchId}/inventory`), limit(50))),
          getDocs(query(collection(db, "customers"), where("branchId", "==", selectedBranchId), where("isActive", "==", true), limit(25))),
        ]);

      setProducts(productsSnapshot.docs.map((item) => toProduct(item.id, item.data())));
      setInventory(Object.fromEntries(inventorySnapshot.docs.map((item) => [
        item.id,
        { id: item.id, ...(item.data() as Omit<InventoryDocument, "id">) },
      ])));
      setCustomers(customersSnapshot.docs.map((item) => toCustomer(item.id, item.data())));

      if (mode === "edit" && orderId) {
        const orderSnapshot = await getDoc(doc(db, "orders", orderId));
        if (!orderSnapshot.exists()) throw new Error("Order not found.");
        const order = { id: orderSnapshot.id, ...(orderSnapshot.data() as Omit<OrderDocument, "id">) };
        if (!["awaiting_payment", "awaiting_discount_approval"].includes(order.status)) {
          throw new Error("Only unpaid orders awaiting payment or discount approval can be edited.");
        }
        setCustomerType(order.customerType);
        setCustomerId(order.customerId ?? "");
        setWalkInName(order.customerSnapshot?.name ?? "");
        setWalkInPhone(order.customerSnapshot?.phone ?? "");
        setCart(order.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          discountPercent: item.discountPercent,
          discountReason: item.discountReason ?? "",
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load order form data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [selectedBranchId, mode, orderId]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (cart.length > 0 && !result) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [cart.length, result]);

  const productMap = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, product])),
    [products],
  );

  const informativeTotal = useMemo(
    () =>
      cart.reduce((sum, line) => {
        const product = productMap[line.productId];
        if (!product) return sum;
        const subtotal = (product.sellingPriceKobo ?? 0) * line.quantity;
        return sum + subtotal - Math.floor((subtotal * line.discountPercent) / 100);
      }, 0),
    [cart, productMap],
  );

  function setLine(productId: string, patch: Partial<CartLine>) {
    setCart((current) =>
      current.map((line) =>
        line.productId === productId ? { ...line, ...patch } : line,
      ),
    );
  }

  function addProduct(productId: string) {
    if (cart.some((line) => line.productId === productId)) return;
    setCart((current) => [
      ...current,
      { productId, quantity: 1, discountPercent: 0, discountReason: "" },
    ]);
  }

  async function quickCreateCustomer() {
    if (!selectedBranchId || !newCustomerName.trim() || !newCustomerPhone.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await callFunction<
        Record<string, unknown>,
        { customerId: string }
      >("createCustomer", {
        branchId: selectedBranchId,
        name: newCustomerName,
        phone: newCustomerPhone,
        idempotencyKey: createIdempotencyKey("customer"),
      });
      await loadData();
      setCustomerType("registered");
      setCustomerId(created.customerId);
      setNewCustomerName("");
      setNewCustomerPhone("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create customer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOrder() {
    if (!selectedBranchId || cart.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const items = cart.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        discountPercent: line.discountPercent,
        ...(line.discountReason.trim()
          ? { discountReason: line.discountReason.trim() }
          : {}),
      }));

      if (mode === "edit" && orderId) {
        await callFunction("updateUnpaidOrder", {
          orderId,
          items,
          idempotencyKey: createIdempotencyKey("update-order"),
        });
        setResult({
          orderId,
          orderNumber: "Updated order",
          qrToken: "",
          status: "updated",
        });
      } else {
        const created = await callFunction<
          Record<string, unknown>,
          CreateOrderResult
        >("createOrder", {
          branchId: selectedBranchId,
          customerType,
          ...(customerType === "registered"
            ? { customerId }
            : {
                customerSnapshot: {
                  ...(walkInName.trim() ? { name: walkInName.trim() } : {}),
                  ...(walkInPhone.trim() ? { phone: walkInPhone.trim() } : {}),
                },
              }),
          items,
          idempotencyKey: createIdempotencyKey("create-order"),
        });
        storeOrderQrToken(created.orderId, {
          orderNumber: created.orderNumber,
          qrToken: created.qrToken,
        });
        setResult(created);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save order.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOrder() {
    if (!orderId) return;
    const reason = window.prompt("Reason for cancelling this order");
    if (!reason) return;
    setSubmitting(true);
    try {
      await callFunction("cancelOrder", {
        orderId,
        reason,
        idempotencyKey: createIdempotencyKey("cancel-order"),
      });
      setResult({ orderId, orderNumber: "Cancelled order", qrToken: "", status: "cancelled" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel order.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <OperationState title="Loading order form" />;
  if (error && products.length === 0) {
    return <OperationState actionLabel="Retry" detail={error} onAction={() => void loadData()} title="Order form unavailable" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            {mode === "edit" ? "Edit unpaid order" : "Create order"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedBranch?.name}. Prices shown here are informative; server totals are final.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/orders">Back to orders</Link>
        </Button>
      </div>

      {error ? <OperationState detail={error} title="Action failed" /> : null}
      {result ? (
        <div className="rounded-lg border bg-card p-4">
          <p className="font-medium">{result.orderNumber}</p>
          <p className="text-sm text-muted-foreground">Server status: {result.status.replaceAll("_", " ")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {mode === "create" ? (
              <Button asChild>
                <Link href={`/orders/${result.orderId}/slip`}>Open order slip</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/orders/${result.orderId}`}>Open order</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Products</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {products.map((product) => {
              const available =
                (inventory[product.id]?.onHandQty ?? 0) -
                (inventory[product.id]?.reservedQty ?? 0);
              return (
                <div className="rounded-lg border bg-card p-4" key={product.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.sku} · {product.unit}</p>
                    </div>
                    <p className="text-sm font-medium">{formatNairaFromKobo(product.sellingPriceKobo)}</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Available {formatQuantity(available, product.unit)}
                  </p>
                  <Button className="mt-3 w-full" disabled={available <= 0} onClick={() => addProduct(product.id)} type="button" variant="outline">
                    Add
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-4 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Customer</h2>
          {mode === "create" ? (
            <div className="grid gap-3">
              <Field label="Customer type">
                <select className="h-9 rounded-md border bg-background px-3" onChange={(event) => setCustomerType(event.target.value as "walk_in" | "registered")} value={customerType}>
                  <option value="walk_in">Walk-in</option>
                  <option value="registered">Registered</option>
                </select>
              </Field>
              {customerType === "registered" ? (
                <>
                  <Field label="Customer">
                    <select className="h-9 rounded-md border bg-background px-3" onChange={(event) => setCustomerId(event.target.value)} value={customerId}>
                      <option value="">Select customer</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid gap-2 rounded-lg border p-3">
                    <Field label="New customer name">
                      <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setNewCustomerName(event.target.value)} value={newCustomerName} />
                    </Field>
                    <Field label="New customer phone">
                      <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setNewCustomerPhone(event.target.value)} value={newCustomerPhone} />
                    </Field>
                    <Button disabled={submitting} onClick={() => void quickCreateCustomer()} type="button" variant="outline">Create customer</Button>
                  </div>
                </>
              ) : (
                <div className="grid gap-2">
                  <Field label="Walk-in name">
                    <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setWalkInName(event.target.value)} value={walkInName} />
                  </Field>
                  <Field label="Walk-in phone">
                    <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setWalkInPhone(event.target.value)} value={walkInPhone} />
                  </Field>
                </div>
              )}
            </div>
          ) : null}

          <h2 className="pt-2 text-sm font-semibold uppercase text-muted-foreground">Cart</h2>
          <div className="space-y-3">
            {cart.map((line) => {
              const product = productMap[line.productId];
              if (!product) return null;
              return (
                <div className="rounded-lg border p-3" key={line.productId}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Locked price {formatNairaFromKobo(product.sellingPriceKobo)}
                      </p>
                    </div>
                    <Button onClick={() => setCart((current) => current.filter((item) => item.productId !== line.productId))} size="icon-sm" type="button" variant="ghost">
                      <IconTrash />
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Field label="Quantity">
                      <input className="h-9 rounded-md border bg-background px-3" min={1} onChange={(event) => setLine(line.productId, { quantity: Number(event.target.value) || 1 })} type="number" value={line.quantity} />
                    </Field>
                    <Field label="Discount %">
                      <input className="h-9 rounded-md border bg-background px-3" max={100} min={0} onChange={(event) => setLine(line.productId, { discountPercent: Number(event.target.value) || 0 })} type="number" value={line.discountPercent} />
                    </Field>
                  </div>
                  {line.discountPercent > 0 || requireDiscountReason ? (
                    <Field className="mt-2" label="Discount reason">
                      <input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setLine(line.productId, { discountReason: event.target.value })} value={line.discountReason} />
                    </Field>
                  ) : null}
                </div>
              );
            })}
            {cart.length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">Add products to begin.</p>
            ) : null}
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Informative total</span>
              <span className="font-semibold">{formatNairaFromKobo(informativeTotal)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={submitting || cart.length === 0 || (customerType === "registered" && !customerId)} onClick={() => void submitOrder()} type="button">
              {submitting ? "Saving..." : mode === "edit" ? "Update order" : "Create order"}
            </Button>
            {mode === "edit" ? (
              <Button disabled={submitting} onClick={() => void cancelOrder()} type="button" variant="destructive">
                Cancel order
              </Button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
