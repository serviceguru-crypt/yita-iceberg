import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { isAdminRole } from "@/lib/domain/roles";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminDb } from "@/lib/server/firebase-admin";
import type { ProductDocument } from "@/lib/types/operational";

const imageSchema = z.object({
  imageStoragePath: z.string().trim().min(1).max(500),
  imageContentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

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
    imageStoragePath: typeof data.imageStoragePath === "string" ? data.imageStoragePath : null,
    imageContentType: typeof data.imageContentType === "string" ? data.imageContentType : null,
    imageUpdatedAt: data.imageUpdatedAt ?? null,
    sellingPriceKobo:
      typeof data.sellingPriceKobo === "number" ? data.sellingPriceKobo : undefined,
    minimumPriceKobo:
      typeof data.minimumPriceKobo === "number" ? data.minimumPriceKobo : undefined,
    isActive: data.isActive === false ? false : true,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });
  }
  if (!isAdminRole(user.platformRole)) {
    return NextResponse.json({ ok: false, message: "Product catalog requires admin access." }, { status: 403 });
  }

  try {
    const { productId } = await params;
    const data = imageSchema.parse(await request.json());
    const expectedPath = `product-images/${productId}/primary`;
    if (data.imageStoragePath !== expectedPath) {
      return NextResponse.json({ ok: false, message: "Invalid product image path." }, { status: 400 });
    }

    const productRef = adminDb().doc(`products/${productId}`);
    const snapshot = await productRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false, message: "Product not found." }, { status: 404 });
    }

    const now = FieldValue.serverTimestamp();
    const batch = adminDb().batch();
    batch.update(productRef, {
      imageStoragePath: data.imageStoragePath,
      imageContentType: data.imageContentType,
      imageUpdatedAt: now,
      updatedAt: now,
      updatedBy: user.uid,
    });
    batch.set(adminDb().collection("auditLogs").doc(), {
      actorId: user.uid,
      actorRole: user.platformRole,
      action: "product.image_updated",
      entityType: "product",
      entityId: productId,
      branchId: null,
      before: { imageStoragePath: snapshot.data()?.imageStoragePath ?? null },
      after: {
        imageStoragePath: data.imageStoragePath,
        imageContentType: data.imageContentType,
      },
      metadata: {},
      createdAt: now,
    });
    await batch.commit();
    const updated = await productRef.get();
    return NextResponse.json({ ok: true, product: toProduct(updated.id, updated.data() ?? {}) });
  } catch (error) {
    console.error("Product image metadata update failed", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: "Invalid product image." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, message: "Unable to save product image." }, { status: 500 });
  }
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
