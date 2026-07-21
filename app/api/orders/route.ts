import { NextResponse } from "next/server";

import { orderStatuses, type OrderStatus } from "@/lib/domain/order-state";
import type { PlatformRole } from "@/lib/domain/roles";
import { canAccessBranch } from "@/lib/permissions/policy";
import { getCurrentUser } from "@/lib/server/auth/session";
import { loadUserDisplayNames } from "@/lib/server/display-names";
import { adminDb } from "@/lib/server/firebase-admin";

const orderRoles = new Set<PlatformRole>([
  "order_registrar",
  "branch_manager",
  "admin",
  "super_admin",
]);

const documentIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

function timestampMillis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value) {
    const candidate = value as { toMillis?: () => number };
    if (typeof candidate.toMillis === "function") {
      return candidate.toMillis();
    }
  }

  return 0;
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

function serializeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === "object") {
    const date = dateValue(value);
    if (date) return date;

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeValue(item)]),
    );
  }

  return value;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  if (!orderRoles.has(user.platformRole)) {
    return NextResponse.json(
      { ok: false, message: "Order access denied." },
      { status: 403 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const branchId = searchParams.get("branchId")?.trim() ?? "";
  const requestedStatus = searchParams.get("status")?.trim() ?? "all";

  if (!documentIdPattern.test(branchId)) {
    return NextResponse.json(
      { ok: false, message: "Select a valid branch before viewing orders." },
      { status: 400 },
    );
  }

  if (
    requestedStatus !== "all" &&
    !orderStatuses.includes(requestedStatus as OrderStatus)
  ) {
    return NextResponse.json(
      { ok: false, message: "The selected order status is invalid." },
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
    const collection = adminDb().collection("orders");
    const snapshot =
      requestedStatus === "all"
        ? await collection.where("branchId", "==", branchId).get()
        : await collection.where("status", "==", requestedStatus).get();
    const orders: Array<Record<string, unknown> & { id: string }> = snapshot.docs
      .filter((item) => item.data().branchId === branchId)
      .sort(
        (first, second) =>
          timestampMillis(second.data().createdAt) -
          timestampMillis(first.data().createdAt),
      )
      .slice(0, 30)
      .map((item) => {
        const data = serializeValue(item.data()) as Record<string, unknown>;
        return { id: item.id, ...data };
      });
    const names = await loadUserDisplayNames(
      orders.flatMap((order) => {
        const discountRequest =
          order.discountRequest && typeof order.discountRequest === "object"
            ? (order.discountRequest as Record<string, unknown>)
            : null;
        return [
          typeof order.createdBy === "string" ? order.createdBy : null,
          typeof order.paidBy === "string" ? order.paidBy : null,
          typeof order.releasedBy === "string" ? order.releasedBy : null,
          typeof discountRequest?.requestedBy === "string"
            ? discountRequest.requestedBy
            : null,
        ];
      }),
    );
    const namedOrders = orders.map((order) => {
      const discountRequest =
        order.discountRequest && typeof order.discountRequest === "object"
          ? (order.discountRequest as Record<string, unknown>)
          : null;
      const requestedBy =
        typeof discountRequest?.requestedBy === "string"
          ? discountRequest.requestedBy
          : null;

      return {
        ...order,
        createdByName:
          typeof order.createdBy === "string" ? names[order.createdBy] : undefined,
        paidByName:
          typeof order.paidBy === "string" ? names[order.paidBy] : undefined,
        releasedByName:
          typeof order.releasedBy === "string" ? names[order.releasedBy] : undefined,
        ...(discountRequest
          ? {
              discountRequest: {
                ...discountRequest,
                requestedByName: requestedBy ? names[requestedBy] : undefined,
              },
            }
          : {}),
      };
    });

    return NextResponse.json(
      { ok: true, orders: namedOrders },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Order list load failed", error);

    return NextResponse.json(
      { ok: false, message: "Unable to load orders for this branch." },
      { status: 500 },
    );
  }
}
