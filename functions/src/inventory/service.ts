import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

import { requireActor } from "../shared/auth";
import { adminDb } from "../shared/firebase";
import { createOpaqueToken, hashValue } from "../shared/hash";
import { canAccessBranch, type ActorProfile } from "../shared/roles";
import type { StockMovementType } from "../orders/types";
import {
  addBranchProductSchema,
  archiveProductSchema,
  createProductSchema,
  recordStockReceiptSchema,
  rejectInventoryAdjustmentSchema,
  rejectStockCountSchema,
  requestInventoryAdjustmentSchema,
  reviewInventoryAdjustmentSchema,
  reviewStockCountSchema,
  startStockCountSchema,
  submitStockCountSchema,
  updateBranchProductPricingSchema,
  updateBranchProductSettingsSchema,
  updateProductSchema,
  type StockReceiptItemInput,
} from "./schemas";

function ensureRole(actor: ActorProfile, roles: string[]) {
  if (!roles.includes(actor.platformRole)) {
    throw new HttpsError("permission-denied", "Role is not allowed.");
  }
}

function ensureBranch(actor: ActorProfile, branchId: string) {
  if (!canAccessBranch(actor, branchId)) {
    throw new HttpsError("permission-denied", "Branch access denied.");
  }
}

function positiveInt(value: unknown, fallback = 0) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
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

function idemRef(actor: ActorProfile, operation: string, idempotencyKey: string) {
  const keyHash = hashValue(idempotencyKey);
  return {
    keyHash,
    ref: adminDb().doc(`idempotencyRecords/${actor.uid}_${operation}_${keyHash}`),
  };
}

function auditData(
  actor: ActorProfile,
  action: string,
  entityType: string,
  entityId: string,
  branchId: string | null,
  before: unknown,
  after: unknown,
  metadata: Record<string, unknown> = {},
) {
  return {
    actorId: actor.uid,
    actorRole: actor.platformRole,
    branchId,
    action,
    entityType,
    entityId,
    before: before ?? null,
    after: after ?? null,
    metadata,
    createdAt: FieldValue.serverTimestamp(),
  };
}

function movementData({
  branchId,
  productId,
  movementType,
  quantity,
  before,
  after,
  reason,
  actor,
  keyHash,
  orderId,
  stockReceiptId,
  adjustmentRequestId,
  stockCountId,
}: {
  branchId: string;
  productId: string;
  movementType: StockMovementType;
  quantity: number;
  before: { onHandQty: number; reservedQty: number };
  after: { onHandQty: number; reservedQty: number };
  reason: string;
  actor: ActorProfile;
  keyHash: string;
  orderId?: string;
  stockReceiptId?: string;
  adjustmentRequestId?: string;
  stockCountId?: string;
}) {
  return {
    branchId,
    productId,
    ...(orderId ? { orderId } : {}),
    ...(stockReceiptId ? { stockReceiptId } : {}),
    ...(adjustmentRequestId ? { adjustmentRequestId } : {}),
    ...(stockCountId ? { stockCountId } : {}),
    movementType,
    quantity,
    onHandBefore: before.onHandQty,
    onHandAfter: after.onHandQty,
    reservedBefore: before.reservedQty,
    reservedAfter: after.reservedQty,
    reason,
    performedBy: actor.uid,
    createdAt: FieldValue.serverTimestamp(),
    idempotencyKeyHash: keyHash,
  };
}

function lowStock(onHandQty: number, reservedQty: number, reorderLevel: number) {
  return onHandQty - reservedQty <= reorderLevel;
}

function stockRemovalValue(
  quantityRemoved: number,
  previousOnHandQty: number,
  previousAverageUnitCostKobo: number,
  previousStockValueKobo: number,
) {
  return quantityRemoved === previousOnHandQty
    ? previousStockValueKobo
    : previousAverageUnitCostKobo * quantityRemoved;
}

function receiptNumber() {
  return `SR-${Date.now().toString(36).toUpperCase()}-${createOpaqueToken(4).slice(0, 6).toUpperCase()}`;
}

function countNumber() {
  return `SC-${Date.now().toString(36).toUpperCase()}-${createOpaqueToken(4).slice(0, 6).toUpperCase()}`;
}

async function assertBranchActive(tx: FirebaseFirestore.Transaction, branchId: string) {
  const branchRef = adminDb().doc(`branches/${branchId}`);
  const branch = await tx.get(branchRef);
  if (!branch.exists || branch.data()?.isActive !== true) {
    throw new HttpsError("invalid-argument", "Invalid branch.");
  }
}

function productPatch(input: Record<string, unknown>) {
  return {
    ...(input.sku ? { sku: input.sku } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.unit ? { unit: input.unit } : {}),
    ...(input.description !== undefined ? { description: input.description || null } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId || null } : {}),
    ...(input.barcode !== undefined ? { barcode: input.barcode || null } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };
}

async function ensureUniqueProductFields(
  tx: FirebaseFirestore.Transaction,
  productId: string,
  sku: string,
  barcode: string | null | undefined,
  previous?: FirebaseFirestore.DocumentData,
) {
  const skuKey = normalize(sku);
  const skuRef = adminDb().doc(`productUniqueSkus/${skuKey}`);
  const barcodeKey = barcode ? normalize(barcode) : null;
  const barcodeRef = barcodeKey ? adminDb().doc(`productUniqueBarcodes/${barcodeKey}`) : null;
  const [skuSnapshot, barcodeSnapshot] = await Promise.all([
    tx.get(skuRef),
    barcodeRef ? tx.get(barcodeRef) : Promise.resolve(null),
  ]);

  if (skuSnapshot.exists && skuSnapshot.data()?.productId !== productId) {
    throw new HttpsError("already-exists", "SKU already exists.");
  }

  const oldSku = previous?.sku ? normalize(String(previous.sku)) : null;
  const oldBarcode = previous?.barcode ? normalize(String(previous.barcode)) : null;

  if (barcodeSnapshot?.exists && barcodeSnapshot.data()?.productId !== productId) {
    throw new HttpsError("already-exists", "Barcode already exists.");
  }

  tx.set(skuRef, { productId, sku, updatedAt: FieldValue.serverTimestamp() });
  if (oldSku && oldSku !== skuKey) {
    tx.delete(adminDb().doc(`productUniqueSkus/${oldSku}`));
  }

  if (barcode && barcodeRef && barcodeKey) {
    tx.set(barcodeRef, { productId, barcode, updatedAt: FieldValue.serverTimestamp() });
    if (oldBarcode && oldBarcode !== barcodeKey) {
      tx.delete(adminDb().doc(`productUniqueBarcodes/${oldBarcode}`));
    }
  } else if (oldBarcode) {
    tx.delete(adminDb().doc(`productUniqueBarcodes/${oldBarcode}`));
  }
}

async function generateAvailableSku(tx: FirebaseFirestore.Transaction) {
  const counterRef = adminDb().doc("counters/productSku");
  const counterSnapshot = await tx.get(counterRef);
  const startingSequence =
    typeof counterSnapshot.data()?.nextSequence === "number"
      ? Number(counterSnapshot.data()?.nextSequence)
      : 1;
  const candidates = Array.from({ length: 20 }, (_, index) => {
    const sequence = startingSequence + index;

    return {
      sequence,
      sku: formatGeneratedSku(sequence),
      uniqueRef: adminDb().doc(`productUniqueSkus/${normalize(formatGeneratedSku(sequence))}`),
    };
  });
  const snapshots = await Promise.all(
    candidates.map((candidate) => tx.get(candidate.uniqueRef)),
  );
  const availableIndex = snapshots.findIndex((snapshot) => !snapshot.exists);

  if (availableIndex === -1) {
    throw new HttpsError("resource-exhausted", "Unable to reserve a product SKU.");
  }

  const chosen = candidates[availableIndex];

  return {
    sku: chosen.sku,
    nextSequence: chosen.sequence + 1,
    counterRef,
  };
}

export async function createProductAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["admin", "super_admin"]);
  const data = createProductSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "createProduct", data.idempotencyKey);
  const productRef = adminDb().collection("products").doc();

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;

    const generated = data.sku ? null : await generateAvailableSku(tx);
    const sku = data.sku ?? generated?.sku;

    if (!sku) {
      throw new HttpsError("internal", "Unable to generate product SKU.");
    }

    await ensureUniqueProductFields(tx, productRef.id, sku, data.barcode);
    const qrCodePayload = productQrPayload(productRef.id, sku);
    const product = {
      sku,
      name: data.name,
      unit: data.unit,
      description: data.description ?? null,
      categoryId: data.categoryId ?? null,
      barcode: data.barcode ?? null,
      qrCodePayload,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid,
      updatedBy: actor.uid,
      idempotencyKeyHash: keyHash,
    };
    const response = { id: productRef.id, productId: productRef.id, sku, qrCodePayload };

    tx.set(productRef, product);
    if (generated) {
      tx.set(generated.counterRef, {
        nextSequence: generated.nextSequence,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    tx.set(adminDb().collection("auditLogs").doc(`createProduct_${productRef.id}_${keyHash}`), auditData(actor, "product.created", "product", productRef.id, null, null, product));
    tx.set(ref, { actorId: actor.uid, operation: "createProduct", keyHash, entityId: productRef.id, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function updateProductAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["admin", "super_admin"]);
  const data = updateProductSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "updateProduct", data.idempotencyKey);
  const productRef = adminDb().doc(`products/${data.productId}`);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const productSnapshot = await tx.get(productRef);
    if (!productSnapshot.exists) throw new HttpsError("not-found", "Product not found.");
    const before = productSnapshot.data()!;
    const nextSku = data.sku ?? String(before.sku);
    const nextBarcode = data.barcode !== undefined ? data.barcode || null : before.barcode ?? null;
    await ensureUniqueProductFields(tx, data.productId, nextSku, nextBarcode, before);
    const patch = { ...productPatch(data), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid };
    const response = { id: data.productId, productId: data.productId };

    tx.update(productRef, patch);
    tx.set(adminDb().collection("auditLogs").doc(`updateProduct_${data.productId}_${keyHash}`), auditData(actor, "product.updated", "product", data.productId, null, before, patch));
    tx.set(ref, { actorId: actor.uid, operation: "updateProduct", keyHash, entityId: data.productId, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function archiveProductAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["admin", "super_admin"]);
  const data = archiveProductSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "archiveProduct", data.idempotencyKey);
  const productRef = adminDb().doc(`products/${data.productId}`);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const productSnapshot = await tx.get(productRef);
    if (!productSnapshot.exists) throw new HttpsError("not-found", "Product not found.");
    const before = productSnapshot.data()!;
    const patch = {
      isActive: false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    };
    const response = { id: data.productId, productId: data.productId };

    tx.update(productRef, patch);
    tx.set(adminDb().collection("auditLogs").doc(`archiveProduct_${data.productId}_${keyHash}`), auditData(actor, "product.archived", "product", data.productId, null, before, patch));
    tx.set(ref, { actorId: actor.uid, operation: "archiveProduct", keyHash, entityId: data.productId, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function addBranchProductAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["admin", "super_admin"]);
  const data = addBranchProductSchema.parse(input);
  ensureBranch(actor, data.branchId);
  const { keyHash, ref } = idemRef(actor, "addBranchProduct", data.idempotencyKey);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    await assertBranchActive(tx, data.branchId);
    const productRef = adminDb().doc(`products/${data.productId}`);
    const product = await tx.get(productRef);
    if (!product.exists || product.data()?.isActive !== true) {
      throw new HttpsError("invalid-argument", "Invalid product.");
    }
    if (data.sellingPriceKobo < data.minimumPriceKobo) {
      throw new HttpsError("invalid-argument", "Selling price is below minimum price.");
    }
    const p = product.data()!;
    const branchProductRef = adminDb().doc(`branches/${data.branchId}/products/${data.productId}`);
    const inventoryRef = adminDb().doc(`branches/${data.branchId}/inventory/${data.productId}`);
    const response = { id: data.productId, productId: data.productId, branchId: data.branchId };

    tx.set(branchProductRef, {
      productId: data.productId,
      sku: p.sku,
      name: p.name,
      description: p.description ?? null,
      categoryId: p.categoryId ?? null,
      unit: p.unit,
      barcode: p.barcode ?? null,
      sellingPriceKobo: data.sellingPriceKobo,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    tx.set(adminDb().doc(`branches/${data.branchId}/productControls/${data.productId}`), {
      productId: data.productId,
      minimumPriceKobo: data.minimumPriceKobo,
      defaultCostPriceKobo: data.defaultCostPriceKobo ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    tx.set(inventoryRef, {
      productId: data.productId,
      sku: p.sku,
      productName: p.name,
      unit: p.unit,
      onHandQty: 0,
      reservedQty: 0,
      soldQty: 0,
      damagedQty: 0,
      returnedQty: 0,
      reorderLevel: data.reorderLevel,
      isLowStock: lowStock(0, 0, data.reorderLevel),
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    tx.set(adminDb().doc(`branches/${data.branchId}/inventoryFinancials/${data.productId}`), {
      productId: data.productId,
      averageUnitCostKobo: data.defaultCostPriceKobo ?? 0,
      stockValueKobo: 0,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    tx.set(adminDb().collection("auditLogs").doc(`addBranchProduct_${data.branchId}_${data.productId}_${keyHash}`), auditData(actor, "branch_product.added", "product", data.productId, data.branchId, null, response));
    tx.set(ref, { actorId: actor.uid, operation: "addBranchProduct", keyHash, entityId: data.productId, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function updateBranchProductSettingsAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["branch_manager", "admin", "super_admin"]);
  const data = updateBranchProductSettingsSchema.parse(input);
  ensureBranch(actor, data.branchId);
  const { keyHash, ref } = idemRef(actor, "updateBranchProductSettings", data.idempotencyKey);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const inventoryRef = adminDb().doc(`branches/${data.branchId}/inventory/${data.productId}`);
    const productRef = adminDb().doc(`branches/${data.branchId}/products/${data.productId}`);
    const inventory = await tx.get(inventoryRef);
    if (!inventory.exists) throw new HttpsError("not-found", "Branch product not found.");
    const before = inventory.data()!;
    const nextReorder = data.reorderLevel ?? positiveInt(before.reorderLevel);
    const patch = {
      ...(data.reorderLevel !== undefined ? { reorderLevel: data.reorderLevel } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      isLowStock: lowStock(positiveInt(before.onHandQty), positiveInt(before.reservedQty), nextReorder),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    };
    const response = { id: data.productId, productId: data.productId, branchId: data.branchId };
    tx.update(inventoryRef, patch);
    tx.update(productRef, { ...(data.isActive !== undefined ? { isActive: data.isActive } : {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    tx.set(adminDb().collection("auditLogs").doc(`updateBranchProductSettings_${data.branchId}_${data.productId}_${keyHash}`), auditData(actor, "branch_product.settings_updated", "product", data.productId, data.branchId, before, patch));
    tx.set(ref, { actorId: actor.uid, operation: "updateBranchProductSettings", keyHash, entityId: data.productId, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function updateBranchProductPricingAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["branch_manager", "admin", "super_admin"]);
  const data = updateBranchProductPricingSchema.parse(input);
  ensureBranch(actor, data.branchId);
  const { keyHash, ref } = idemRef(actor, "updateBranchProductPricing", data.idempotencyKey);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const productRef = adminDb().doc(`branches/${data.branchId}/products/${data.productId}`);
    const controlRef = adminDb().doc(`branches/${data.branchId}/productControls/${data.productId}`);
    const [product, control] = await Promise.all([tx.get(productRef), tx.get(controlRef)]);
    if (!product.exists || !control.exists) throw new HttpsError("not-found", "Branch product not found.");
    const protectedUpdate = data.minimumPriceKobo !== undefined || data.defaultCostPriceKobo !== undefined;
    if (protectedUpdate && actor.platformRole === "branch_manager") {
      throw new HttpsError("permission-denied", "Protected price controls are restricted.");
    }
    const min = data.minimumPriceKobo ?? positiveInt(control.data()?.minimumPriceKobo);
    if (data.sellingPriceKobo < min) {
      throw new HttpsError("failed-precondition", "Selling price is below the protected minimum.");
    }
    const response = { id: data.productId, productId: data.productId, branchId: data.branchId };
    tx.update(productRef, { sellingPriceKobo: data.sellingPriceKobo, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    if (protectedUpdate) {
      tx.update(controlRef, {
        ...(data.minimumPriceKobo !== undefined ? { minimumPriceKobo: data.minimumPriceKobo } : {}),
        ...(data.defaultCostPriceKobo !== undefined ? { defaultCostPriceKobo: data.defaultCostPriceKobo } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
    }
    tx.set(adminDb().collection("auditLogs").doc(`updateBranchProductPricing_${data.branchId}_${data.productId}_${keyHash}`), auditData(actor, "branch_product.price_updated", "product", data.productId, data.branchId, { sellingPriceKobo: product.data()?.sellingPriceKobo }, { sellingPriceKobo: data.sellingPriceKobo, protectedControlsChanged: protectedUpdate }));
    tx.set(ref, { actorId: actor.uid, operation: "updateBranchProductPricing", keyHash, entityId: data.productId, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

async function readReceiptItems(tx: FirebaseFirestore.Transaction, branchId: string, items: StockReceiptItemInput[]) {
  const productIds = items.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new HttpsError("invalid-argument", "Duplicate receipt item.");
  }

  const productRefs = productIds.map((id) => adminDb().doc(`branches/${branchId}/products/${id}`));
  const productSnapshots = await Promise.all(productRefs.map((ref) => tx.get(ref)));
  return items.map((item, index) => {
    const product = productSnapshots[index];
    if (!product.exists || product.data()?.isActive !== true) {
      throw new HttpsError("failed-precondition", "Product is inactive or unavailable.");
    }
    return {
      ...item,
      sku: String(product.data()?.sku ?? ""),
      productName: String(product.data()?.name ?? ""),
      lineValueKobo: item.quantity * item.unitCostKobo,
    };
  });
}

export async function recordStockReceiptAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["branch_manager", "admin", "super_admin"]);
  const data = recordStockReceiptSchema.parse(input);
  ensureBranch(actor, data.branchId);
  const { keyHash, ref } = idemRef(actor, "recordStockReceipt", data.idempotencyKey);
  const receiptRef = adminDb().collection("stockReceipts").doc();

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    await assertBranchActive(tx, data.branchId);
    const receiptItems = await readReceiptItems(tx, data.branchId, data.items);
    const inventoryRefs = receiptItems.map((item) => adminDb().doc(`branches/${data.branchId}/inventory/${item.productId}`));
    const financialRefs = receiptItems.map((item) => adminDb().doc(`branches/${data.branchId}/inventoryFinancials/${item.productId}`));
    const inventories = await Promise.all(inventoryRefs.map((item) => tx.get(item)));
    const financials = await Promise.all(financialRefs.map((item) => tx.get(item)));
    const number = receiptNumber();
    const totalValueKobo = receiptItems.reduce((sum, item) => sum + item.lineValueKobo, 0);
    const response = { id: receiptRef.id, receiptId: receiptRef.id, receiptNumber: number, totalValueKobo };

    for (const [index, item] of receiptItems.entries()) {
      const inv = inventories[index].data();
      const before = { onHandQty: positiveInt(inv?.onHandQty), reservedQty: positiveInt(inv?.reservedQty) };
      const after = { onHandQty: before.onHandQty + item.quantity, reservedQty: before.reservedQty };
      const fin = financials[index].data();
      const previousStockValueKobo = positiveInt(fin?.stockValueKobo);
      const nextStockValueKobo = previousStockValueKobo + item.lineValueKobo;
      tx.update(inventoryRefs[index], {
        onHandQty: after.onHandQty,
        isLowStock: lowStock(after.onHandQty, after.reservedQty, positiveInt(inv?.reorderLevel)),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      tx.set(financialRefs[index], {
        productId: item.productId,
        averageUnitCostKobo: Math.floor(nextStockValueKobo / after.onHandQty),
        stockValueKobo: nextStockValueKobo,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      }, { merge: true });
      tx.set(adminDb().collection("stockMovements").doc(`${receiptRef.id}_stock_received_${item.productId}_${keyHash}`), movementData({
        branchId: data.branchId,
        productId: item.productId,
        stockReceiptId: receiptRef.id,
        movementType: "stock_received",
        quantity: item.quantity,
        before,
        after,
        reason: "stock_receipt",
        actor,
        keyHash,
      }));
    }
    tx.set(receiptRef, {
      receiptNumber: number,
      branchId: data.branchId,
      supplierName: data.supplierName ?? null,
      supplierReference: data.supplierReference ?? null,
      deliveryReference: data.deliveryReference ?? null,
      notes: data.notes ?? null,
      items: receiptItems,
      totalValueKobo,
      status: "posted",
      receivedBy: actor.uid,
      receivedAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      idempotencyKeyHash: keyHash,
    });
    tx.set(adminDb().collection("auditLogs").doc(`recordStockReceipt_${receiptRef.id}_${keyHash}`), auditData(actor, "stock_receipt.posted", "stockReceipt", receiptRef.id, data.branchId, null, { totalValueKobo }));
    tx.set(ref, { actorId: actor.uid, operation: "recordStockReceipt", keyHash, entityId: receiptRef.id, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function requestInventoryAdjustmentAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["branch_manager", "admin", "super_admin"]);
  const data = requestInventoryAdjustmentSchema.parse(input);
  ensureBranch(actor, data.branchId);
  if (data.adjustmentType === "increase" && !data.unitCostKobo) {
    throw new HttpsError("invalid-argument", "Unit cost is required for stock increases.");
  }
  const { keyHash, ref } = idemRef(actor, "requestInventoryAdjustment", data.idempotencyKey);
  const requestRef = adminDb().collection("inventoryAdjustmentRequests").doc();
  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const product = await tx.get(adminDb().doc(`branches/${data.branchId}/products/${data.productId}`));
    if (!product.exists || product.data()?.isActive !== true) throw new HttpsError("invalid-argument", "Invalid product.");
    const response = { id: requestRef.id, requestId: requestRef.id, status: "pending" };
    tx.set(requestRef, {
      branchId: data.branchId,
      productId: data.productId,
      adjustmentType: data.adjustmentType,
      quantity: data.quantity,
      unitCostKobo: data.unitCostKobo ?? null,
      reason: data.reason,
      supportingReference: data.supportingReference ?? null,
      status: "pending",
      requestedBy: actor.uid,
      requestedAt: FieldValue.serverTimestamp(),
      idempotencyKeyHash: keyHash,
    });
    tx.set(adminDb().collection("auditLogs").doc(`requestInventoryAdjustment_${requestRef.id}_${keyHash}`), auditData(actor, "inventory_adjustment.requested", "inventoryAdjustmentRequest", requestRef.id, data.branchId, null, { productId: data.productId, adjustmentType: data.adjustmentType, quantity: data.quantity }));
    tx.set(ref, { actorId: actor.uid, operation: "requestInventoryAdjustment", keyHash, entityId: requestRef.id, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function approveInventoryAdjustmentAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["admin", "super_admin"]);
  const data = reviewInventoryAdjustmentSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "approveInventoryAdjustment", data.idempotencyKey);
  const requestRef = adminDb().doc(`inventoryAdjustmentRequests/${data.requestId}`);
  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const reqSnapshot = await tx.get(requestRef);
    if (!reqSnapshot.exists) throw new HttpsError("not-found", "Adjustment request not found.");
    const req = reqSnapshot.data()!;
    ensureBranch(actor, req.branchId);
    if (req.status !== "pending") throw new HttpsError("failed-precondition", "Adjustment already resolved.");
    if (req.requestedBy === actor.uid) throw new HttpsError("permission-denied", "Requester cannot approve own adjustment.");
    const inventoryRef = adminDb().doc(`branches/${req.branchId}/inventory/${req.productId}`);
    const financialRef = adminDb().doc(`branches/${req.branchId}/inventoryFinancials/${req.productId}`);
    const [inventory, financial] = await Promise.all([tx.get(inventoryRef), tx.get(financialRef)]);
    if (!inventory.exists) throw new HttpsError("failed-precondition", "Inventory is missing.");
    const inv = inventory.data();
    const fin = financial.data();
    const before = { onHandQty: positiveInt(inv?.onHandQty), reservedQty: positiveInt(inv?.reservedQty) };
    const damagedBefore = positiveInt(inv?.damagedQty);
    const avg = positiveInt(fin?.averageUnitCostKobo);
    const value = positiveInt(fin?.stockValueKobo);
    let after = before;
    let nextStockValueKobo = value;
    let nextAverageUnitCostKobo = avg;
    let movementType: StockMovementType = "inventory_increase_adjustment";
    const qty = positiveInt(req.quantity);

    if (req.adjustmentType === "increase") {
      after = { ...before, onHandQty: before.onHandQty + qty };
      nextStockValueKobo = value + qty * positiveInt(req.unitCostKobo);
      nextAverageUnitCostKobo = Math.floor(nextStockValueKobo / after.onHandQty);
    } else {
      if (before.onHandQty - qty < before.reservedQty) {
        throw new HttpsError("failed-precondition", "Adjustment would break reservations.");
      }
      after = { ...before, onHandQty: before.onHandQty - qty };
      const removedValueKobo = stockRemovalValue(qty, before.onHandQty, avg, value);
      nextStockValueKobo = value - removedValueKobo;
      if (nextStockValueKobo < 0) throw new HttpsError("failed-precondition", "Inventory value cannot become negative.");
      nextAverageUnitCostKobo = after.onHandQty > 0 ? Math.floor(nextStockValueKobo / after.onHandQty) : 0;
      movementType = req.adjustmentType === "damage_write_off" ? "damage_write_off" : "inventory_decrease_adjustment";
    }
    tx.update(inventoryRef, {
      onHandQty: after.onHandQty,
      ...(req.adjustmentType === "damage_write_off" ? { damagedQty: damagedBefore + qty } : {}),
      isLowStock: lowStock(after.onHandQty, after.reservedQty, positiveInt(inv?.reorderLevel)),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    tx.set(financialRef, { productId: req.productId, averageUnitCostKobo: nextAverageUnitCostKobo, stockValueKobo: nextStockValueKobo, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
    const movementId = `${data.requestId}_${movementType}_${req.productId}_${keyHash}`;
    tx.set(adminDb().collection("stockMovements").doc(movementId), movementData({ branchId: req.branchId, productId: req.productId, adjustmentRequestId: data.requestId, movementType, quantity: qty, before, after, reason: req.reason, actor, keyHash }));
    tx.update(requestRef, { status: "approved", reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp(), reviewReason: data.reason ?? null, postedAt: FieldValue.serverTimestamp(), postedMovementId: movementId });
    const response = { id: data.requestId, requestId: data.requestId, status: "approved", postedMovementId: movementId };
    tx.set(adminDb().collection("auditLogs").doc(`approveInventoryAdjustment_${data.requestId}_${keyHash}`), auditData(actor, "inventory_adjustment.approved", "inventoryAdjustmentRequest", data.requestId, req.branchId, { status: req.status }, response));
    tx.set(ref, { actorId: actor.uid, operation: "approveInventoryAdjustment", keyHash, entityId: data.requestId, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function rejectInventoryAdjustmentAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["admin", "super_admin"]);
  const data = rejectInventoryAdjustmentSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "rejectInventoryAdjustment", data.idempotencyKey);
  const requestRef = adminDb().doc(`inventoryAdjustmentRequests/${data.requestId}`);
  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const reqSnapshot = await tx.get(requestRef);
    if (!reqSnapshot.exists) throw new HttpsError("not-found", "Adjustment request not found.");
    const req = reqSnapshot.data()!;
    ensureBranch(actor, req.branchId);
    if (req.status !== "pending") throw new HttpsError("failed-precondition", "Adjustment already resolved.");
    const response = { id: data.requestId, requestId: data.requestId, status: "rejected" };
    tx.update(requestRef, { status: "rejected", reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp(), reviewReason: data.reason });
    tx.set(adminDb().collection("auditLogs").doc(`rejectInventoryAdjustment_${data.requestId}_${keyHash}`), auditData(actor, "inventory_adjustment.rejected", "inventoryAdjustmentRequest", data.requestId, req.branchId, { status: req.status }, { reason: data.reason }));
    tx.set(ref, { actorId: actor.uid, operation: "rejectInventoryAdjustment", keyHash, entityId: data.requestId, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function startStockCountAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["branch_manager", "admin", "super_admin"]);
  const data = startStockCountSchema.parse(input);
  ensureBranch(actor, data.branchId);
  const uniqueProductIds = [...new Set(data.productIds)];
  if (uniqueProductIds.length !== data.productIds.length) throw new HttpsError("invalid-argument", "Duplicate product selected.");
  const { keyHash, ref } = idemRef(actor, "startStockCount", data.idempotencyKey);
  const countRef = adminDb().collection("stockCounts").doc();

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    await assertBranchActive(tx, data.branchId);
    const inventoryRefs = uniqueProductIds.map((id) => adminDb().doc(`branches/${data.branchId}/inventory/${id}`));
    const inventories = await Promise.all(inventoryRefs.map((item) => tx.get(item)));
    const number = countNumber();
    const response = { id: countRef.id, stockCountId: countRef.id, stockCountNumber: number, status: "open" };
    tx.set(countRef, { stockCountNumber: number, branchId: data.branchId, status: "open", productIds: uniqueProductIds, startedBy: actor.uid, startedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), idempotencyKeyHash: keyHash });
    for (const [index, productIdValue] of uniqueProductIds.entries()) {
      const inventory = inventories[index];
      if (!inventory.exists) throw new HttpsError("invalid-argument", "Invalid inventory item.");
      tx.set(countRef.collection("items").doc(productIdValue), { productId: productIdValue, expectedOnHandQtyAtStart: positiveInt(inventory.data()?.onHandQty), status: "pending" });
    }
    tx.set(adminDb().collection("auditLogs").doc(`startStockCount_${countRef.id}_${keyHash}`), auditData(actor, "stock_count.started", "stockCount", countRef.id, data.branchId, null, { productIds: uniqueProductIds }));
    tx.set(ref, { actorId: actor.uid, operation: "startStockCount", keyHash, entityId: countRef.id, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function submitStockCountAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["branch_manager", "admin", "super_admin"]);
  const data = submitStockCountSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "submitStockCount", data.idempotencyKey);
  const countRef = adminDb().doc(`stockCounts/${data.stockCountId}`);
  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const countSnapshot = await tx.get(countRef);
    if (!countSnapshot.exists) throw new HttpsError("not-found", "Stock count not found.");
    const count = countSnapshot.data()!;
    ensureBranch(actor, count.branchId);
    if (count.status !== "open") throw new HttpsError("failed-precondition", "Stock count is not open.");
    const expectedProductIds = count.productIds as string[];
    if (data.items.length !== expectedProductIds.length) throw new HttpsError("invalid-argument", "All count items are required.");
    const inputMap = new Map(data.items.map((item) => [item.productId, item.countedQty]));
    if (!expectedProductIds.every((id) => inputMap.has(id))) throw new HttpsError("invalid-argument", "Invalid count items.");
    const itemRefs = expectedProductIds.map((id) => countRef.collection("items").doc(id));
    const itemSnapshots = await Promise.all(itemRefs.map((item) => tx.get(item)));
    for (const [index, itemSnapshot] of itemSnapshots.entries()) {
      const productIdValue = expectedProductIds[index];
      const countedQty = inputMap.get(productIdValue) as number;
      const expected = positiveInt(itemSnapshot.data()?.expectedOnHandQtyAtStart);
      tx.update(itemRefs[index], { countedQty, differenceQty: countedQty - expected, status: "counted", countedBy: actor.uid, countedAt: FieldValue.serverTimestamp() });
    }
    const response = { id: data.stockCountId, stockCountId: data.stockCountId, status: "submitted" };
    tx.update(countRef, { status: "submitted", submittedBy: actor.uid, submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.set(adminDb().collection("auditLogs").doc(`submitStockCount_${data.stockCountId}_${keyHash}`), auditData(actor, "stock_count.submitted", "stockCount", data.stockCountId, count.branchId, { status: count.status }, response));
    tx.set(ref, { actorId: actor.uid, operation: "submitStockCount", keyHash, entityId: data.stockCountId, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function approveStockCountAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["admin", "super_admin"]);
  const data = reviewStockCountSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "approveStockCount", data.idempotencyKey);
  const countRef = adminDb().doc(`stockCounts/${data.stockCountId}`);
  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const countSnapshot = await tx.get(countRef);
    if (!countSnapshot.exists) throw new HttpsError("not-found", "Stock count not found.");
    const count = countSnapshot.data()!;
    ensureBranch(actor, count.branchId);
    if (count.status !== "submitted") throw new HttpsError("failed-precondition", "Stock count is not submitted.");
    if (count.startedBy === actor.uid) throw new HttpsError("permission-denied", "Requester cannot approve own stock count.");
    const productIds = count.productIds as string[];
    const itemRefs = productIds.map((id) => countRef.collection("items").doc(id));
    const inventoryRefs = productIds.map((id) => adminDb().doc(`branches/${count.branchId}/inventory/${id}`));
    const financialRefs = productIds.map((id) => adminDb().doc(`branches/${count.branchId}/inventoryFinancials/${id}`));
    const [items, inventories, financials] = await Promise.all([
      Promise.all(itemRefs.map((item) => tx.get(item))),
      Promise.all(inventoryRefs.map((item) => tx.get(item))),
      Promise.all(financialRefs.map((item) => tx.get(item))),
    ]);
    for (const [index, productIdValue] of productIds.entries()) {
      const item = items[index].data();
      const inv = inventories[index].data();
      if (!item || !inv) throw new HttpsError("failed-precondition", "Stock count item is missing.");
      const before = { onHandQty: positiveInt(inv.onHandQty), reservedQty: positiveInt(inv.reservedQty) };
      const expected = positiveInt(item.expectedOnHandQtyAtStart);
      if (before.onHandQty !== expected) {
        throw new HttpsError("failed-precondition", "Stock changed after count started. Restart count.");
      }
      const countedQty = positiveInt(item.countedQty);
      const diff = countedQty - expected;
      if (diff === 0) continue;
      if (diff < 0 && countedQty < before.reservedQty) throw new HttpsError("failed-precondition", "Reconciliation would break reservations.");
      const fin = financials[index].data();
      const avg = positiveInt(fin?.averageUnitCostKobo);
      const value = positiveInt(fin?.stockValueKobo);
      const after = { onHandQty: countedQty, reservedQty: before.reservedQty };
      const nextStockValueKobo = diff > 0
        ? value + diff * avg
        : value - stockRemovalValue(Math.abs(diff), before.onHandQty, avg, value);
      if (nextStockValueKobo < 0) throw new HttpsError("failed-precondition", "Inventory value cannot become negative.");
      tx.update(inventoryRefs[index], { onHandQty: after.onHandQty, isLowStock: lowStock(after.onHandQty, after.reservedQty, positiveInt(inv.reorderLevel)), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
      tx.set(financialRefs[index], { productId: productIdValue, averageUnitCostKobo: after.onHandQty > 0 ? Math.floor(nextStockValueKobo / after.onHandQty) : 0, stockValueKobo: nextStockValueKobo, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
      tx.set(adminDb().collection("stockMovements").doc(`${data.stockCountId}_stock_count_reconciliation_${productIdValue}_${keyHash}`), movementData({ branchId: count.branchId, productId: productIdValue, stockCountId: data.stockCountId, movementType: "stock_count_reconciliation", quantity: Math.abs(diff), before, after, reason: "stock_count_reconciliation", actor, keyHash }));
    }
    const response = { id: data.stockCountId, stockCountId: data.stockCountId, status: "approved" };
    tx.update(countRef, { status: "approved", reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp(), reviewReason: data.reason ?? null, updatedAt: FieldValue.serverTimestamp() });
    tx.set(adminDb().collection("auditLogs").doc(`approveStockCount_${data.stockCountId}_${keyHash}`), auditData(actor, "stock_count.approved", "stockCount", data.stockCountId, count.branchId, { status: count.status }, response));
    tx.set(ref, { actorId: actor.uid, operation: "approveStockCount", keyHash, entityId: data.stockCountId, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}

export async function rejectStockCountAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["admin", "super_admin"]);
  const data = rejectStockCountSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "rejectStockCount", data.idempotencyKey);
  const countRef = adminDb().doc(`stockCounts/${data.stockCountId}`);
  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const countSnapshot = await tx.get(countRef);
    if (!countSnapshot.exists) throw new HttpsError("not-found", "Stock count not found.");
    const count = countSnapshot.data()!;
    ensureBranch(actor, count.branchId);
    if (!["open", "submitted"].includes(count.status)) throw new HttpsError("failed-precondition", "Stock count already resolved.");
    const response = { id: data.stockCountId, stockCountId: data.stockCountId, status: "rejected" };
    tx.update(countRef, { status: "rejected", reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp(), reviewReason: data.reason, updatedAt: FieldValue.serverTimestamp() });
    tx.set(adminDb().collection("auditLogs").doc(`rejectStockCount_${data.stockCountId}_${keyHash}`), auditData(actor, "stock_count.rejected", "stockCount", data.stockCountId, count.branchId, { status: count.status }, { reason: data.reason }));
    tx.set(ref, { actorId: actor.uid, operation: "rejectStockCount", keyHash, entityId: data.stockCountId, responseSnapshot: response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
}
