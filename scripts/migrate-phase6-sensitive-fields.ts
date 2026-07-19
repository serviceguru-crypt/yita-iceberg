import { readFileSync } from "node:fs";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type WriteBatch } from "firebase-admin/firestore";
import { z } from "zod";

import { assertProductionGuardFromEnv } from "./shared/confirm-production";

const envSchema = z.object({
  PHASE6_MIGRATION_CONFIRM: z.literal("true"),
  PHASE6_ALLOW_PRODUCTION: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_FILE: z.string().optional(),
  PHASE6_MIGRATION_DRY_RUN: z.string().optional(),
});

function initializeAdmin() {
  if (getApps().length > 0) return;

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "yita-iceberg";

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)), projectId });
    return;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_FILE) {
    initializeApp({
      credential: cert(JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, "utf8"))),
      projectId,
    });
    return;
  }

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
      projectId,
    });
    return;
  }

  initializeApp({ credential: applicationDefault(), projectId });
}

function numberOr(value: unknown, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function commit(batch: WriteBatch, writes: number) {
  if (writes > 0) await batch.commit();
}

async function main() {
  const env = envSchema.parse(process.env);
  const dryRun = env.PHASE6_MIGRATION_DRY_RUN === "true" || process.argv.includes("--dry-run");
  if (!env.FIRESTORE_EMULATOR_HOST && env.PHASE6_ALLOW_PRODUCTION !== "true") {
    throw new Error("Refusing to migrate production without PHASE6_ALLOW_PRODUCTION=true.");
  }
  assertProductionGuardFromEnv({
    confirmationEnv: "PHASE6_PRODUCTION_CONFIRMATION",
    allowEnv: "PHASE6_ALLOW_PRODUCTION",
    requiredConfirmation: "RUN_PHASE6_MIGRATION_IN_PRODUCTION",
  });

  initializeAdmin();
  const db = getFirestore();
  const branches = await db.collection("branches").get();
  let batch = db.batch();
  let writes = 0;
  let migrated = 0;

  for (const branch of branches.docs) {
    const branchId = branch.id;
    const products = await branch.ref.collection("products").get();

    for (const product of products.docs) {
      const productId = product.id;
      const data = product.data();
      const inventoryRef = db.doc(`branches/${branchId}/inventory/${productId}`);
      const controlsRef = db.doc(`branches/${branchId}/productControls/${productId}`);
      const financialsRef = db.doc(`branches/${branchId}/inventoryFinancials/${productId}`);
      const inventory = await inventoryRef.get();
      const inv = inventory.data() ?? {};
      const onHandQty = numberOr(inv.onHandQty);
      const reservedQty = numberOr(inv.reservedQty);
      const reorderLevel = numberOr(inv.reorderLevel);
      const averageUnitCostKobo = numberOr(
        inv.averageUnitCostKobo ?? data.defaultCostPriceKobo ?? data.costPriceKobo,
      );
      const stockValueKobo = numberOr(inv.stockValueKobo, averageUnitCostKobo * onHandQty);
      const sku = stringOrNull(data.sku) ?? stringOrNull(inv.sku) ?? productId;
      const productName = stringOrNull(data.name) ?? stringOrNull(inv.productName) ?? productId;
      const unit = stringOrNull(data.unit) ?? stringOrNull(inv.unit) ?? "unit";

      batch.set(controlsRef, {
        productId,
        minimumPriceKobo: numberOr(data.minimumPriceKobo),
        defaultCostPriceKobo: data.defaultCostPriceKobo ?? data.costPriceKobo ?? null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "phase6-migration",
      }, { merge: true });
      batch.set(financialsRef, {
        productId,
        averageUnitCostKobo,
        stockValueKobo,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "phase6-migration",
      }, { merge: true });
      batch.set(inventoryRef, {
        productId,
        sku,
        productName,
        unit,
        onHandQty,
        reservedQty,
        soldQty: numberOr(inv.soldQty),
        damagedQty: numberOr(inv.damagedQty),
        returnedQty: numberOr(inv.returnedQty),
        reorderLevel,
        isLowStock: onHandQty - reservedQty <= reorderLevel,
        isActive: inv.isActive ?? data.isActive ?? true,
        averageUnitCostKobo: FieldValue.delete(),
        stockValueKobo: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "phase6-migration",
      }, { merge: true });
      batch.set(product.ref, {
        minimumPriceKobo: FieldValue.delete(),
        defaultCostPriceKobo: FieldValue.delete(),
        costPriceKobo: FieldValue.delete(),
        averageUnitCostKobo: FieldValue.delete(),
        stockValueKobo: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "phase6-migration",
      }, { merge: true });

      writes += 4;
      migrated += 1;
      if (writes >= 400) {
        if (!dryRun) await commit(batch, writes);
        batch = db.batch();
        writes = 0;
      }
    }
  }

  if (!dryRun) await commit(batch, writes);
  console.log(`Phase 6 migration ${dryRun ? "dry run" : "complete"}. Planned ${migrated} branch products.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Phase 6 migration failed.");
  process.exit(1);
});
