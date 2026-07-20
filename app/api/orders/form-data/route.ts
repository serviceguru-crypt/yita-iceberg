import { NextResponse } from "next/server";

import type { PlatformRole } from "@/lib/domain/roles";
import { canAccessBranch } from "@/lib/permissions/policy";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminDb } from "@/lib/server/firebase-admin";

const orderFormRoles = new Set<PlatformRole>([
  "order_registrar",
  "branch_manager",
  "admin",
  "super_admin",
]);

const documentIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toProduct(id: string, data: Record<string, unknown>) {
  return {
    id,
    sku: stringValue(data.sku),
    name: stringValue(data.name) || "Unnamed product",
    unit: stringValue(data.unit),
    sellingPriceKobo: numberValue(data.sellingPriceKobo),
    isActive: data.isActive === true,
  };
}

function toInventory(id: string, data: Record<string, unknown>) {
  return {
    id,
    productId: stringValue(data.productId) || id,
    sku: stringValue(data.sku) || undefined,
    productName: stringValue(data.productName) || undefined,
    unit: stringValue(data.unit) || undefined,
    onHandQty: numberValue(data.onHandQty),
    reservedQty: numberValue(data.reservedQty),
    soldQty: numberValue(data.soldQty),
    damagedQty: numberValue(data.damagedQty),
    returnedQty: numberValue(data.returnedQty),
    reorderLevel: numberValue(data.reorderLevel),
    isLowStock: data.isLowStock === true,
    isActive: data.isActive !== false,
  };
}

function toCustomer(id: string, data: Record<string, unknown>) {
  return {
    id,
    name: stringValue(data.name) || "Unnamed customer",
    phone: stringValue(data.phone),
    address: nullableString(data.address),
    branchId: stringValue(data.branchId),
    isActive: data.isActive === true,
  };
}

function toEditableOrder(id: string, data: Record<string, unknown>) {
  const customerSnapshot =
    data.customerSnapshot && typeof data.customerSnapshot === "object"
      ? (data.customerSnapshot as Record<string, unknown>)
      : null;
  const items = Array.isArray(data.items) ? data.items : [];

  return {
    id,
    branchId: stringValue(data.branchId),
    status: stringValue(data.status),
    customerType: data.customerType === "registered" ? "registered" : "walk_in",
    customerId: nullableString(data.customerId),
    customerSnapshot: customerSnapshot
      ? {
          name: nullableString(customerSnapshot.name),
          phone: nullableString(customerSnapshot.phone),
        }
      : null,
    items: items.map((item) => {
      const line = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        productId: stringValue(line.productId),
        quantity: numberValue(line.quantity),
        discountPercent: numberValue(line.discountPercent),
        discountReason: nullableString(line.discountReason),
      };
    }),
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  if (!orderFormRoles.has(user.platformRole)) {
    return NextResponse.json(
      { ok: false, message: "Order registration access denied." },
      { status: 403 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const branchId = searchParams.get("branchId")?.trim() ?? "";
  const orderId = searchParams.get("orderId")?.trim() ?? "";

  if (!documentIdPattern.test(branchId)) {
    return NextResponse.json(
      { ok: false, message: "Select a valid branch before creating an order." },
      { status: 400 },
    );
  }

  if (orderId && !documentIdPattern.test(orderId)) {
    return NextResponse.json(
      { ok: false, message: "The selected order is invalid." },
      { status: 400 },
    );
  }

  if (!canAccessBranch(user, branchId)) {
    return NextResponse.json(
      { ok: false, message: "Branch access denied." },
      { status: 403 },
    );
  }

  try {
    const db = adminDb();
    const [productsSnapshot, inventorySnapshot, customersSnapshot, orderSnapshot] =
      await Promise.all([
        db
          .collection(`branches/${branchId}/products`)
          .where("isActive", "==", true)
          .limit(50)
          .get(),
        db.collection(`branches/${branchId}/inventory`).limit(50).get(),
        db.collection("customers").where("branchId", "==", branchId).limit(100).get(),
        orderId ? db.doc(`orders/${orderId}`).get() : Promise.resolve(null),
      ]);

    const products = productsSnapshot.docs
      .map((item) => toProduct(item.id, item.data()))
      .sort((first, second) => first.name.localeCompare(second.name));
    const inventory = inventorySnapshot.docs.map((item) =>
      toInventory(item.id, item.data()),
    );
    const customers = customersSnapshot.docs
      .map((item) => toCustomer(item.id, item.data()))
      .filter((customer) => customer.isActive)
      .sort((first, second) => first.name.localeCompare(second.name))
      .slice(0, 25);

    let order = null;

    if (orderSnapshot) {
      if (!orderSnapshot.exists) {
        return NextResponse.json(
          { ok: false, message: "Order not found." },
          { status: 404 },
        );
      }

      order = toEditableOrder(orderSnapshot.id, orderSnapshot.data() ?? {});

      if (order.branchId !== branchId) {
        return NextResponse.json(
          { ok: false, message: "The order does not belong to the selected branch." },
          { status: 403 },
        );
      }
    }

    return NextResponse.json(
      { ok: true, products, inventory, customers, order },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Order form data load failed", error);

    return NextResponse.json(
      { ok: false, message: "Unable to load order form data." },
      { status: 500 },
    );
  }
}
