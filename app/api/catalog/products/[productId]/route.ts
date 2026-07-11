import { NextResponse } from "next/server";

import { isAdminRole } from "@/lib/domain/roles";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminDb } from "@/lib/server/firebase-admin";
import type { ProductDocument } from "@/lib/types/operational";

function toProduct(id: string, data: Record<string, unknown>): ProductDocument {
  return {
    id,
    sku: String(data.sku ?? ""),
    name: String(data.name ?? id),
    description: typeof data.description === "string" ? data.description : null,
    categoryId: typeof data.categoryId === "string" ? data.categoryId : null,
    unit: String(data.unit ?? ""),
    barcode: typeof data.barcode === "string" ? data.barcode : null,
    qrCodePayload: typeof data.qrCodePayload === "string" ? data.qrCodePayload : null,
    sellingPriceKobo:
      typeof data.sellingPriceKobo === "number" ? data.sellingPriceKobo : undefined,
    minimumPriceKobo:
      typeof data.minimumPriceKobo === "number" ? data.minimumPriceKobo : undefined,
    isActive: data.isActive === false ? false : true,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  if (!isAdminRole(user.platformRole)) {
    return NextResponse.json(
      { ok: false, message: "Product catalog requires admin access." },
      { status: 403 },
    );
  }

  try {
    const { productId } = await params;
    const snapshot = await adminDb().doc(`products/${productId}`).get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { ok: false, message: "Product not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { ok: true, product: toProduct(snapshot.id, snapshot.data() ?? {}) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Product detail load failed", error);

    return NextResponse.json(
      { ok: false, message: "Unable to load product." },
      { status: 500 },
    );
  }
}
