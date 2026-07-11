import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { isAdminRole } from "@/lib/domain/roles";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminDb } from "@/lib/server/firebase-admin";
import type { ProductDocument } from "@/lib/types/operational";

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(40),
  description: z.string().trim().max(500).optional(),
  categoryId: z.string().trim().max(120).optional(),
  barcode: z.string().trim().min(1).max(120).optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
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
    sellingPriceKobo:
      typeof data.sellingPriceKobo === "number" ? data.sellingPriceKobo : undefined,
    minimumPriceKobo:
      typeof data.minimumPriceKobo === "number" ? data.minimumPriceKobo : undefined,
    isActive: data.isActive === false ? false : true,
  };
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function formatGeneratedSku(sequence: number) {
  return `YI-${String(sequence).padStart(6, "0")}`;
}

function productQrPayload(productId: string, sku: string) {
  return `YITA-PRODUCT|${productId}|${sku}`;
}

export async function GET() {
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
    const snapshot = await adminDb().collection("products").limit(100).get();
    const products = snapshot.docs
      .map((product) => toProduct(product.id, product.data()))
      .sort((first, second) => first.name.localeCompare(second.name));

    return NextResponse.json(
      { ok: true, products },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Product catalog load failed", error);

    return NextResponse.json(
      { ok: false, message: "Unable to load product catalog." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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
    const data = createProductSchema.parse(await request.json());
    const keyHash = hashValue(data.idempotencyKey);
    const idempotencyRef = adminDb().doc(
      `idempotencyRecords/${user.uid}_createProduct_${keyHash}`,
    );
    const counterRef = adminDb().doc("counters/productSku");
    const productRef = adminDb().collection("products").doc();
    const barcodeKey = data.barcode ? normalize(data.barcode) : null;
    const barcodeRef = barcodeKey
      ? adminDb().doc(`productUniqueBarcodes/${barcodeKey}`)
      : null;

    const response = await adminDb().runTransaction(async (transaction) => {
      const idempotencySnapshot = await transaction.get(idempotencyRef);

      if (idempotencySnapshot.exists) {
        return idempotencySnapshot.data()?.responseSnapshot as {
          id: string;
          productId: string;
          sku: string;
        };
      }

      const [counterSnapshot, barcodeSnapshot] = await Promise.all([
        transaction.get(counterRef),
        barcodeRef ? transaction.get(barcodeRef) : Promise.resolve(null),
      ]);

      if (barcodeSnapshot?.exists) {
        throw new Error("Barcode already exists.");
      }

      const startingSequence =
        typeof counterSnapshot.data()?.nextSequence === "number"
          ? Number(counterSnapshot.data()?.nextSequence)
          : 1;
      const candidates = Array.from({ length: 20 }, (_, index) => {
        const sequence = startingSequence + index;

        return {
          sequence,
          sku: formatGeneratedSku(sequence),
        };
      });
      const uniqueSkuRefs = candidates.map((candidate) =>
        adminDb().doc(`productUniqueSkus/${normalize(candidate.sku)}`),
      );
      const uniqueSkuSnapshots = await Promise.all(
        uniqueSkuRefs.map((ref) => transaction.get(ref)),
      );
      const availableIndex = uniqueSkuSnapshots.findIndex(
        (snapshot) => !snapshot.exists,
      );

      if (availableIndex === -1) {
        throw new Error("Unable to reserve a product SKU. Try again.");
      }

      const chosen = candidates[availableIndex];
      const qrCodePayload = productQrPayload(productRef.id, chosen.sku);
      const now = FieldValue.serverTimestamp();
      const product = {
        sku: chosen.sku,
        name: data.name,
        unit: data.unit,
        description: data.description ?? null,
        categoryId: data.categoryId ?? null,
        barcode: data.barcode ?? null,
        qrCodePayload,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: user.uid,
        updatedBy: user.uid,
        idempotencyKeyHash: keyHash,
      };
      const nextResponse = {
        id: productRef.id,
        productId: productRef.id,
        sku: chosen.sku,
        qrCodePayload,
      };

      transaction.set(productRef, product);
      transaction.set(uniqueSkuRefs[availableIndex], {
        productId: productRef.id,
        sku: chosen.sku,
        updatedAt: now,
      });

      if (barcodeRef && data.barcode) {
        transaction.set(barcodeRef, {
          productId: productRef.id,
          barcode: data.barcode,
          updatedAt: now,
        });
      }

      transaction.set(counterRef, {
        nextSequence: chosen.sequence + 1,
        updatedAt: now,
      }, { merge: true });
      transaction.set(adminDb().collection("auditLogs").doc(
        `createProduct_${productRef.id}_${keyHash}`,
      ), {
        actorId: user.uid,
        actorRole: user.platformRole,
        action: "product.created",
        entityType: "product",
        entityId: productRef.id,
        branchId: null,
        before: null,
        after: product,
        metadata: { source: "next_api", skuGenerated: true },
        createdAt: now,
      });
      transaction.set(idempotencyRef, {
        actorId: user.uid,
        operation: "createProduct",
        keyHash,
        entityId: productRef.id,
        responseSnapshot: nextResponse,
        createdAt: now,
      });

      return nextResponse;
    });

    return NextResponse.json({ ok: true, ...response });
  } catch (error) {
    console.error("Product create failed", error);

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to create product.",
      },
      { status: 500 },
    );
  }
}
