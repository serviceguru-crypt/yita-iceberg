import { NextResponse } from "next/server";

import type { PlatformRole } from "@/lib/domain/roles";
import { canAccessBranch } from "@/lib/permissions/policy";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminDb } from "@/lib/server/firebase-admin";

const cashierRoles = new Set<PlatformRole>([
  "cashier",
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

function dateValue(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value) {
    const candidate = value as { toDate?: () => Date };
    if (typeof candidate.toDate === "function") {
      return candidate.toDate().toISOString();
    }
  }

  return null;
}

function toOrder(id: string, data: Record<string, unknown>) {
  const customerSnapshot =
    data.customerSnapshot && typeof data.customerSnapshot === "object"
      ? (data.customerSnapshot as Record<string, unknown>)
      : null;
  const items = Array.isArray(data.items) ? data.items : [];

  return {
    id,
    orderNumber: stringValue(data.orderNumber),
    branchId: stringValue(data.branchId),
    customerType: data.customerType === "registered" ? "registered" : "walk_in",
    customerId: nullableString(data.customerId),
    customerSnapshot: customerSnapshot
      ? {
          name: nullableString(customerSnapshot.name),
          phone: nullableString(customerSnapshot.phone),
          address: nullableString(customerSnapshot.address),
        }
      : null,
    status: stringValue(data.status),
    paymentStatus: stringValue(data.paymentStatus),
    items: items.map((item) => {
      const line = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        productId: stringValue(line.productId),
        sku: stringValue(line.sku),
        productName: stringValue(line.productName),
        unit: stringValue(line.unit),
        quantity: numberValue(line.quantity),
        originalUnitPriceKobo: numberValue(line.originalUnitPriceKobo),
        finalUnitPriceKobo: numberValue(line.finalUnitPriceKobo),
        lineSubtotalKobo: numberValue(line.lineSubtotalKobo),
        lineDiscountKobo: numberValue(line.lineDiscountKobo),
        lineTotalKobo: numberValue(line.lineTotalKobo),
        discountPercent: numberValue(line.discountPercent),
        discountReason: nullableString(line.discountReason) ?? undefined,
      };
    }),
    subtotalKobo: numberValue(data.subtotalKobo),
    discountTotalKobo: numberValue(data.discountTotalKobo),
    grandTotalKobo: numberValue(data.grandTotalKobo),
    createdBy: stringValue(data.createdBy),
    createdAt: dateValue(data.createdAt),
    updatedAt: dateValue(data.updatedAt),
  };
}

function toPayment(id: string, data: Record<string, unknown>) {
  return {
    id,
    paymentMethod: stringValue(data.paymentMethod),
    amountKobo: numberValue(data.amountKobo),
    reference: nullableString(data.reference),
    receivedBy: stringValue(data.receivedBy) || undefined,
    receivedAt: dateValue(data.receivedAt),
    status: stringValue(data.status) || undefined,
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

  if (!cashierRoles.has(user.platformRole)) {
    return NextResponse.json(
      { ok: false, message: "Cashier access denied." },
      { status: 403 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const branchId = searchParams.get("branchId")?.trim() ?? "";
  const orderId = searchParams.get("orderId")?.trim() ?? "";

  if (!documentIdPattern.test(branchId)) {
    return NextResponse.json(
      { ok: false, message: "Select a valid branch before viewing payments." },
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
    if (orderId) {
      const snapshot = await adminDb().doc(`orders/${orderId}`).get();

      if (!snapshot.exists) {
        return NextResponse.json(
          { ok: false, message: "Order not found." },
          { status: 404 },
        );
      }

      const order = toOrder(snapshot.id, snapshot.data() ?? {});

      if (order.branchId !== branchId) {
        return NextResponse.json(
          { ok: false, message: "The order does not belong to the active branch." },
          { status: 403 },
        );
      }

      const paymentsSnapshot = await adminDb()
        .collection(`orders/${orderId}/payments`)
        .get();
      const payments = paymentsSnapshot.docs.map((item) =>
        toPayment(item.id, item.data()),
      );

      return NextResponse.json(
        { ok: true, order, payments },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const snapshot = await adminDb()
      .collection("orders")
      .where("branchId", "==", branchId)
      .where("status", "==", "awaiting_payment")
      .orderBy("createdAt", "desc")
      .limit(25)
      .get();
    const orders = snapshot.docs.map((item) => toOrder(item.id, item.data()));

    return NextResponse.json(
      { ok: true, orders },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Cashier order load failed", error);

    return NextResponse.json(
      { ok: false, message: "Unable to load the payment queue." },
      { status: 500 },
    );
  }
}
