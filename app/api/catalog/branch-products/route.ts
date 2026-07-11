import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { isAdminRole } from "@/lib/domain/roles";
import { canAccessBranch } from "@/lib/permissions/policy";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminDb } from "@/lib/server/firebase-admin";

const addBranchProductSchema = z.object({
  branchId: z.string().trim().min(1),
  productId: z.string().trim().min(1),
  sellingPriceKobo: z.number().int().min(0),
  minimumPriceKobo: z.number().int().min(0),
  defaultCostPriceKobo: z.number().int().min(0).optional(),
  reorderLevel: z.number().int().min(0).default(0),
  idempotencyKey: z.string().trim().min(8).max(200),
});

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function lowStock(onHandQty: number, reservedQty: number, reorderLevel: number) {
  return onHandQty - reservedQty <= reorderLevel;
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
      { ok: false, message: "Branch product setup requires admin access." },
      { status: 403 },
    );
  }

  try {
    const data = addBranchProductSchema.parse(await request.json());

    if (!canAccessBranch(user, data.branchId)) {
      return NextResponse.json(
        { ok: false, message: "Branch access denied." },
        { status: 403 },
      );
    }

    if (data.sellingPriceKobo < data.minimumPriceKobo) {
      return NextResponse.json(
        { ok: false, message: "Selling price is below minimum price." },
        { status: 400 },
      );
    }

    const keyHash = hashValue(data.idempotencyKey);
    const idempotencyRef = adminDb().doc(
      `idempotencyRecords/${user.uid}_addBranchProduct_${keyHash}`,
    );

    const response = await adminDb().runTransaction(async (transaction) => {
      const existing = await transaction.get(idempotencyRef);

      if (existing.exists) {
        return existing.data()?.responseSnapshot as {
          id: string;
          productId: string;
          branchId: string;
        };
      }

      const branchRef = adminDb().doc(`branches/${data.branchId}`);
      const productRef = adminDb().doc(`products/${data.productId}`);
      const branchProductRef = adminDb().doc(
        `branches/${data.branchId}/products/${data.productId}`,
      );
      const inventoryRef = adminDb().doc(
        `branches/${data.branchId}/inventory/${data.productId}`,
      );
      const [branch, product, existingBranchProduct] = await Promise.all([
        transaction.get(branchRef),
        transaction.get(productRef),
        transaction.get(branchProductRef),
      ]);

      if (!branch.exists || branch.data()?.isActive !== true) {
        throw new Error("Invalid branch.");
      }

      if (!product.exists || product.data()?.isActive !== true) {
        throw new Error("Invalid product.");
      }

      if (existingBranchProduct.exists) {
        throw new Error("Product is already added to this branch.");
      }

      const productData = product.data() ?? {};
      const now = FieldValue.serverTimestamp();
      const nextResponse = {
        id: data.productId,
        productId: data.productId,
        branchId: data.branchId,
      };

      transaction.set(branchProductRef, {
        productId: data.productId,
        sku: productData.sku,
        name: productData.name,
        description: productData.description ?? null,
        categoryId: productData.categoryId ?? null,
        unit: productData.unit,
        barcode: productData.barcode ?? null,
        sellingPriceKobo: data.sellingPriceKobo,
        isActive: true,
        updatedAt: now,
        updatedBy: user.uid,
      });
      transaction.set(
        adminDb().doc(`branches/${data.branchId}/productControls/${data.productId}`),
        {
          productId: data.productId,
          minimumPriceKobo: data.minimumPriceKobo,
          defaultCostPriceKobo: data.defaultCostPriceKobo ?? null,
          updatedAt: now,
          updatedBy: user.uid,
        },
      );
      transaction.set(inventoryRef, {
        productId: data.productId,
        sku: productData.sku,
        productName: productData.name,
        unit: productData.unit,
        onHandQty: 0,
        reservedQty: 0,
        soldQty: 0,
        damagedQty: 0,
        returnedQty: 0,
        reorderLevel: data.reorderLevel,
        isLowStock: lowStock(0, 0, data.reorderLevel),
        isActive: true,
        updatedAt: now,
        updatedBy: user.uid,
      });
      transaction.set(
        adminDb().doc(`branches/${data.branchId}/inventoryFinancials/${data.productId}`),
        {
          productId: data.productId,
          averageUnitCostKobo: data.defaultCostPriceKobo ?? 0,
          stockValueKobo: 0,
          updatedAt: now,
          updatedBy: user.uid,
        },
      );
      transaction.set(
        adminDb()
          .collection("auditLogs")
          .doc(`addBranchProduct_${data.branchId}_${data.productId}_${keyHash}`),
        {
          actorId: user.uid,
          actorRole: user.platformRole,
          action: "branch_product.added",
          entityType: "product",
          entityId: data.productId,
          branchId: data.branchId,
          before: null,
          after: nextResponse,
          metadata: { source: "next_api" },
          createdAt: now,
        },
      );
      transaction.set(idempotencyRef, {
        actorId: user.uid,
        operation: "addBranchProduct",
        keyHash,
        entityId: data.productId,
        responseSnapshot: nextResponse,
        createdAt: now,
      });

      return nextResponse;
    });

    return NextResponse.json({ ok: true, ...response });
  } catch (error) {
    console.error("Branch product setup failed", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to add product to branch.",
      },
      { status: 500 },
    );
  }
}
