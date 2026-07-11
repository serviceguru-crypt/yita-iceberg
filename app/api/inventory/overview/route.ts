import { NextResponse } from "next/server";

import { canAccessBranch } from "@/lib/permissions/policy";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminDb } from "@/lib/server/firebase-admin";
import type { InventoryDocument } from "@/lib/types/operational";

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function toInventory(id: string, data: Record<string, unknown>): InventoryDocument {
  return {
    id,
    productId: typeof data.productId === "string" ? data.productId : id,
    sku: typeof data.sku === "string" ? data.sku : undefined,
    productName:
      typeof data.productName === "string" ? data.productName : "Unnamed product",
    unit: typeof data.unit === "string" ? data.unit : undefined,
    onHandQty: numberValue(data.onHandQty),
    reservedQty: numberValue(data.reservedQty),
    soldQty: numberValue(data.soldQty),
    damagedQty: numberValue(data.damagedQty),
    returnedQty: numberValue(data.returnedQty),
    reorderLevel: numberValue(data.reorderLevel),
    isLowStock: data.isLowStock === true,
    isActive: data.isActive === false ? false : true,
    updatedAt: dateValue(data.updatedAt),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : undefined,
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

  const branchId = new URL(request.url).searchParams.get("branchId")?.trim();

  if (!branchId) {
    return NextResponse.json(
      { ok: false, message: "Select a branch before viewing inventory." },
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
    const snapshot = await adminDb()
      .collection(`branches/${branchId}/inventory`)
      .limit(500)
      .get();
    const items = snapshot.docs
      .map((item) => toInventory(item.id, item.data()))
      .sort((first, second) =>
        String(first.productName ?? "").localeCompare(
          String(second.productName ?? ""),
        ),
      );

    return NextResponse.json(
      { ok: true, items },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Inventory overview load failed", error);

    return NextResponse.json(
      { ok: false, message: "Unable to load branch inventory." },
      { status: 500 },
    );
  }
}
