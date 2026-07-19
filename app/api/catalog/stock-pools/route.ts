import { NextResponse } from "next/server";

import { isAdminRole } from "@/lib/domain/roles";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminDb } from "@/lib/server/firebase-admin";

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function poolResponse(productId: string, data: Record<string, unknown> = {}) {
  return {
    productId,
    totalQuantity: numberValue(data.totalQuantity),
    allocatedQuantity: numberValue(data.allocatedQuantity),
    remainingQuantity: numberValue(data.remainingQuantity),
    averageUnitCostKobo: numberValue(data.averageUnitCostKobo),
    remainingStockValueKobo: numberValue(data.remainingStockValueKobo),
  };
}

async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user) {
    return { error: NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 }) };
  }

  if (!isAdminRole(user.platformRole)) {
    return { error: NextResponse.json({ ok: false, message: "Stock allocation requires admin access." }, { status: 403 }) };
  }

  return { user };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const productId = new URL(request.url).searchParams.get("productId")?.trim();
  if (!productId) {
    return NextResponse.json({ ok: false, message: "Select a product first." }, { status: 400 });
  }

  try {
    const [product, pool] = await Promise.all([
      adminDb().doc(`products/${productId}`).get(),
      adminDb().doc(`productStockPools/${productId}`).get(),
    ]);

    if (!product.exists) {
      return NextResponse.json({ ok: false, message: "Product not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      pool: poolResponse(productId, pool.data()),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Central stock load failed", error);
    return NextResponse.json({ ok: false, message: "Unable to load stock available for allocation." }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message: "Post an allocation stock receipt from Inventory instead.",
    },
    { status: 405, headers: { allow: "GET" } },
  );
}
