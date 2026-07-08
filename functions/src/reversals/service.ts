import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

import { requireActor } from "../shared/auth";
import { adminDb } from "../shared/firebase";
import { createOpaqueToken, hashValue } from "../shared/hash";
import { canAccessBranch, type ActorProfile } from "../shared/roles";
import type { OrderItem } from "../orders/types";
import {
  approveReversalRequestSchema,
  cancelReversalRequestSchema,
  completeApprovedReversalSchema,
  createReversalRequestSchema,
  getReversalPreviewSchema,
  rejectReversalRequestSchema,
  type ReversalItemInput,
  type ReversalType,
} from "./schemas";

type ReversalStatus = "requested" | "approved" | "rejected" | "completed" | "cancelled";
type ReversalItem = {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  originalSoldQuantity: number;
  previouslyReversedQuantity: number;
  requestedReversalQuantity: number;
  originalUnitPriceKobo: number;
  reversalLineTotalKobo: number;
  stockReturnedQuantity: number;
  stockNotReturnedQuantity: number;
  inventoryUnitCostKobo: number;
  inventoryValueImpactKobo: number;
};

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
  branchId: string,
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

function reversalNumber() {
  return `RV-${Date.now().toString(36).toUpperCase()}-${createOpaqueToken(4).slice(0, 6).toUpperCase()}`;
}

function isItemReversal(type: ReversalType) {
  return type.startsWith("full_reversal") || type.startsWith("partial_reversal");
}

function requiresStockReturn(type: ReversalType) {
  return type.endsWith("_with_stock_return");
}

function noStockReturn(type: ReversalType) {
  return type.endsWith("_without_stock_return");
}

function financialImpact(refundAmountKobo: number, creditReductionKobo: number, type: ReversalType) {
  if (creditReductionKobo > 0) return "credit_reduced";
  if (refundAmountKobo > 0) return "refund_recorded";
  if (type === "correction_note") return "correction_only";
  return "no_financial_refund";
}

async function previousReversalSnapshot(
  tx: FirebaseFirestore.Transaction,
  orderId: string,
  includeActive = true,
) {
  const snapshot = await tx.get(
    adminDb().collection("saleReversals").where("orderId", "==", orderId),
  );
  const quantityByProduct = new Map<string, number>();
  let refundAmountKobo = 0;
  let creditReductionKobo = 0;
  let completedQuantity = 0;
  const activeStatuses = includeActive ? ["requested", "approved", "completed"] : ["completed"];

  for (const doc of snapshot.docs) {
    const reversal = doc.data();
    if (!activeStatuses.includes(String(reversal.status))) continue;
    for (const item of reversal.items ?? []) {
      const productId = String(item.productId);
      const quantity = positiveInt(item.requestedReversalQuantity);
      quantityByProduct.set(productId, (quantityByProduct.get(productId) ?? 0) + quantity);
      if (reversal.status === "completed") completedQuantity += quantity;
    }
    if (reversal.status === "completed") {
      refundAmountKobo += positiveInt(reversal.refundAmountKobo);
      creditReductionKobo += positiveInt(reversal.creditReductionKobo);
    }
  }

  return { quantityByProduct, refundAmountKobo, creditReductionKobo, completedQuantity };
}

async function paymentCapacity(tx: FirebaseFirestore.Transaction, orderId: string) {
  const payments = await tx.get(adminDb().collection(`orders/${orderId}/payments`));
  let paidKobo = 0;
  let creditKobo = 0;
  for (const payment of payments.docs) {
    const data = payment.data();
    if (data.status !== "confirmed") continue;
    if (data.paymentMethod === "credit") creditKobo += positiveInt(data.amountKobo);
    else paidKobo += positiveInt(data.amountKobo);
  }
  return { paidKobo, creditKobo };
}

async function stockOutCostBasis(tx: FirebaseFirestore.Transaction, orderId: string) {
  const movements = await tx.get(
    adminDb().collection("stockMovements").where("orderId", "==", orderId).where("movementType", "==", "stock_out"),
  );
  const basis = new Map<string, { quantity: number; value: number }>();
  for (const movement of movements.docs) {
    const data = movement.data();
    const productId = String(data.productId);
    const quantity = positiveInt(data.quantity);
    const value = positiveInt(data.inventoryValueImpactKobo, positiveInt(data.unitCostKobo) * quantity);
    const previous = basis.get(productId) ?? { quantity: 0, value: 0 };
    basis.set(productId, { quantity: previous.quantity + quantity, value: previous.value + value });
  }
  return basis;
}

function orderItemMap(order: FirebaseFirestore.DocumentData) {
  return new Map<string, OrderItem>((order.items ?? []).map((item: OrderItem) => [item.productId, item]));
}

function buildPreview(orderId: string, order: FirebaseFirestore.DocumentData, previous: Awaited<ReturnType<typeof previousReversalSnapshot>>, payments: Awaited<ReturnType<typeof paymentCapacity>>) {
  const items = (order.items ?? []).map((item: OrderItem) => {
    const previouslyReversedQuantity = previous.quantityByProduct.get(item.productId) ?? 0;
    return {
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      unit: item.unit,
      originalSoldQuantity: item.quantity,
      previouslyReversedQuantity,
      remainingReversibleQuantity: Math.max(0, item.quantity - previouslyReversedQuantity),
      originalUnitPriceKobo: item.finalUnitPriceKobo,
    };
  });
  return {
    orderId,
    orderNumber: order.orderNumber,
    branchId: order.branchId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    customerType: order.customerType,
    customerId: order.customerId ?? null,
    customerSnapshot: order.customerSnapshot ?? null,
    originalOrderTotalKobo: positiveInt(order.grandTotalKobo),
    previousReversalSummary: {
      refundAmountKobo: previous.refundAmountKobo,
      creditReductionKobo: previous.creditReductionKobo,
      reversedQuantity: [...previous.quantityByProduct.values()].reduce((sum, qty) => sum + qty, 0),
    },
    maximumRefundableAmountKobo: Math.max(0, payments.paidKobo - previous.refundAmountKobo),
    maximumCreditReductionKobo: Math.max(0, payments.creditKobo - previous.creditReductionKobo),
    stockReturnPossible: true,
    items,
  };
}

function calculateRequestedItems({
  order,
  previous,
  costBasis,
  type,
  inputItems,
}: {
  order: FirebaseFirestore.DocumentData;
  previous: Awaited<ReturnType<typeof previousReversalSnapshot>>;
  costBasis: Map<string, { quantity: number; value: number }>;
  type: ReversalType;
  inputItems: ReversalItemInput[];
}) {
  if (!isItemReversal(type)) {
    if (inputItems.length > 0) throw new HttpsError("invalid-argument", "Items are not allowed for this reversal type.");
    return [] as ReversalItem[];
  }

  const map = orderItemMap(order);
  const inputMap = new Map(inputItems.map((item) => [item.productId, item]));
  if (inputMap.size !== inputItems.length) throw new HttpsError("invalid-argument", "Duplicate reversal item.");
  const selected: ReversalItemInput[] = type.startsWith("full_reversal")
    ? (order.items ?? []).map((item: OrderItem) => ({ productId: item.productId, quantity: item.quantity - (previous.quantityByProduct.get(item.productId) ?? 0) }))
      .filter((item: ReversalItemInput) => item.quantity > 0)
    : inputItems;
  if (selected.length === 0) throw new HttpsError("invalid-argument", "At least one item is required.");

  const result = selected
    .map((input: ReversalItemInput) => {
      const item = map.get(input.productId);
      if (!item) throw new HttpsError("invalid-argument", "Invalid reversal item.");
      const previouslyReversedQuantity = previous.quantityByProduct.get(item.productId) ?? 0;
      const remaining = item.quantity - previouslyReversedQuantity;
      if (remaining <= 0 || input.quantity <= 0 || input.quantity > remaining) {
        throw new HttpsError("failed-precondition", "Reversal quantity exceeds remaining sold quantity.");
      }
      let stockReturnedQuantity = input.stockReturnedQuantity ?? (requiresStockReturn(type) ? input.quantity : 0);
      if (noStockReturn(type)) stockReturnedQuantity = 0;
      if (stockReturnedQuantity < 0 || stockReturnedQuantity > input.quantity) {
        throw new HttpsError("invalid-argument", "Invalid stock return quantity.");
      }
      const basis = costBasis.get(item.productId);
      const inventoryUnitCostKobo = basis && basis.quantity > 0 ? Math.floor(basis.value / basis.quantity) : 0;
      const inventoryValueImpactKobo = stockReturnedQuantity * inventoryUnitCostKobo;
      return {
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        unit: item.unit,
        originalSoldQuantity: item.quantity,
        previouslyReversedQuantity,
        requestedReversalQuantity: input.quantity,
        originalUnitPriceKobo: item.finalUnitPriceKobo,
        reversalLineTotalKobo: item.finalUnitPriceKobo * input.quantity,
        stockReturnedQuantity,
        stockNotReturnedQuantity: input.quantity - stockReturnedQuantity,
        inventoryUnitCostKobo,
        inventoryValueImpactKobo,
      };
    })
    .filter((item: ReversalItem) => item.requestedReversalQuantity > 0);
  if (result.length === 0) {
    throw new HttpsError("failed-precondition", "No remaining quantity can be reversed.");
  }

  if (type.startsWith("partial_reversal")) {
    const totalRemaining = (order.items ?? []).reduce((sum: number, item: OrderItem) => sum + item.quantity - (previous.quantityByProduct.get(item.productId) ?? 0), 0);
    const requested = result.reduce((sum: number, item: ReversalItem) => sum + item.requestedReversalQuantity, 0);
    if (requested >= totalRemaining) {
      throw new HttpsError("invalid-argument", "Use full reversal for all remaining quantities.");
    }
  }
  if (requiresStockReturn(type) && result.every((item: ReversalItem) => item.stockReturnedQuantity === 0)) {
    throw new HttpsError("invalid-argument", "At least one returned item is required.");
  }
  return result;
}

async function readOrderForReversal(tx: FirebaseFirestore.Transaction, orderId: string, actor: ActorProfile) {
  const orderRef = adminDb().doc(`orders/${orderId}`);
  const orderSnapshot = await tx.get(orderRef);
  if (!orderSnapshot.exists) throw new HttpsError("not-found", "Order not found.");
  const order = orderSnapshot.data()!;
  ensureBranch(actor, order.branchId);
  if (!["completed", "partially_reversed"].includes(order.status)) {
    throw new HttpsError("failed-precondition", "Only completed sales can be reversed.");
  }
  return { orderRef, order };
}

function response(id: string, data: Record<string, unknown>) {
  return { id, ...data };
}

export async function getReversalPreviewAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  const data = getReversalPreviewSchema.parse(input);
  return adminDb().runTransaction(async (tx) => {
    const { order } = await readOrderForReversal(tx, data.orderId, actor);
    const [previous, payments] = await Promise.all([
      previousReversalSnapshot(tx, data.orderId),
      paymentCapacity(tx, data.orderId),
    ]);
    return buildPreview(data.orderId, order, previous, payments);
  });
}

export async function createReversalRequestAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["branch_manager", "admin", "super_admin"]);
  const data = createReversalRequestSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "createReversalRequest", data.idempotencyKey);
  const reversalRef = adminDb().collection("saleReversals").doc();

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const { order } = await readOrderForReversal(tx, data.orderId, actor);
    const [previous, payments, costBasis] = await Promise.all([
      previousReversalSnapshot(tx, data.orderId),
      paymentCapacity(tx, data.orderId),
      stockOutCostBasis(tx, data.orderId),
    ]);
    const items = calculateRequestedItems({ order, previous, costBasis, type: data.reversalType, inputItems: data.items });
    const reversalSubtotalKobo = items.reduce((sum, item) => sum + item.reversalLineTotalKobo, 0);
    if (data.refundAmountKobo > reversalSubtotalKobo && isItemReversal(data.reversalType)) {
      throw new HttpsError("invalid-argument", "Refund exceeds reversed item value.");
    }
    if (data.refundAmountKobo > Math.max(0, payments.paidKobo - previous.refundAmountKobo)) {
      throw new HttpsError("failed-precondition", "Refund exceeds remaining paid amount.");
    }
    if (data.creditReductionKobo > Math.max(0, payments.creditKobo - previous.creditReductionKobo)) {
      throw new HttpsError("failed-precondition", "Credit reduction exceeds remaining credit amount.");
    }
    if (data.reversalType === "refund_only" && data.refundAmountKobo <= 0) {
      throw new HttpsError("invalid-argument", "Refund amount is required.");
    }
    if (data.reversalType === "credit_correction" && data.creditReductionKobo <= 0) {
      throw new HttpsError("invalid-argument", "Credit reduction is required.");
    }

    const number = reversalNumber();
    const payload = {
      reversalNumber: number,
      orderId: data.orderId,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      reversalType: data.reversalType,
      status: "requested" satisfies ReversalStatus,
      reason: data.reason,
      internalNote: data.internalNote ?? null,
      requestedBy: actor.uid,
      requestedAt: FieldValue.serverTimestamp(),
      items,
      originalOrderTotalKobo: positiveInt(order.grandTotalKobo),
      reversalSubtotalKobo,
      refundAmountKobo: data.refundAmountKobo,
      refundMethod: data.refundMethod,
      creditReductionKobo: data.creditReductionKobo,
      stockReturnRequired: requiresStockReturn(data.reversalType),
      stockReturned: items.some((item: ReversalItem) => item.stockReturnedQuantity > 0),
      financialImpact: financialImpact(data.refundAmountKobo, data.creditReductionKobo, data.reversalType),
      idempotencyKeyHash: keyHash,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const safeResponse = response(reversalRef.id, { reversalId: reversalRef.id, reversalNumber: number, status: "requested" });
    tx.set(reversalRef, payload);
    tx.set(adminDb().collection("auditLogs").doc(`createReversalRequest_${reversalRef.id}_${keyHash}`), auditData(actor, "reversal.requested", "saleReversal", reversalRef.id, order.branchId, null, { ...safeResponse, refundAmountKobo: data.refundAmountKobo, creditReductionKobo: data.creditReductionKobo }));
    tx.set(ref, { actorId: actor.uid, operation: "createReversalRequest", keyHash, entityId: reversalRef.id, responseSnapshot: safeResponse, createdAt: FieldValue.serverTimestamp() });
    return safeResponse;
  });
}

async function readReversal(tx: FirebaseFirestore.Transaction, reversalId: string, actor: ActorProfile) {
  const reversalRef = adminDb().doc(`saleReversals/${reversalId}`);
  const snapshot = await tx.get(reversalRef);
  if (!snapshot.exists) throw new HttpsError("not-found", "Reversal not found.");
  const reversal = snapshot.data()!;
  ensureBranch(actor, reversal.branchId);
  return { reversalRef, reversal };
}

export async function approveReversalRequestAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["branch_manager", "admin", "super_admin"]);
  const data = approveReversalRequestSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "approveReversalRequest", data.idempotencyKey);
  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const { reversalRef, reversal } = await readReversal(tx, data.reversalId, actor);
    if (reversal.status !== "requested") throw new HttpsError("failed-precondition", "Reversal is not pending approval.");
    if (reversal.requestedBy === actor.uid && !["admin", "super_admin"].includes(actor.platformRole)) {
      throw new HttpsError("permission-denied", "Requester cannot approve own reversal.");
    }
    await readOrderForReversal(tx, reversal.orderId, actor);
    const safeResponse = response(data.reversalId, { reversalId: data.reversalId, status: "approved" });
    tx.update(reversalRef, { status: "approved", approvedBy: actor.uid, approvedAt: FieldValue.serverTimestamp(), approvalNote: data.approvalNote ?? null, selfApproved: reversal.requestedBy === actor.uid, updatedAt: FieldValue.serverTimestamp() });
    tx.set(adminDb().collection("auditLogs").doc(`approveReversalRequest_${data.reversalId}_${keyHash}`), auditData(actor, "reversal.approved", "saleReversal", data.reversalId, reversal.branchId, { status: reversal.status }, safeResponse, { selfApproved: reversal.requestedBy === actor.uid }));
    tx.set(ref, { actorId: actor.uid, operation: "approveReversalRequest", keyHash, entityId: data.reversalId, responseSnapshot: safeResponse, createdAt: FieldValue.serverTimestamp() });
    return safeResponse;
  });
}

export async function rejectReversalRequestAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["branch_manager", "admin", "super_admin"]);
  const data = rejectReversalRequestSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "rejectReversalRequest", data.idempotencyKey);
  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const { reversalRef, reversal } = await readReversal(tx, data.reversalId, actor);
    if (reversal.status !== "requested") throw new HttpsError("failed-precondition", "Only requested reversals can be rejected.");
    const safeResponse = response(data.reversalId, { reversalId: data.reversalId, status: "rejected" });
    tx.update(reversalRef, { status: "rejected", rejectedBy: actor.uid, rejectedAt: FieldValue.serverTimestamp(), rejectionReason: data.rejectionReason, updatedAt: FieldValue.serverTimestamp() });
    tx.set(adminDb().collection("auditLogs").doc(`rejectReversalRequest_${data.reversalId}_${keyHash}`), auditData(actor, "reversal.rejected", "saleReversal", data.reversalId, reversal.branchId, { status: reversal.status }, { rejectionReason: data.rejectionReason }));
    tx.set(ref, { actorId: actor.uid, operation: "rejectReversalRequest", keyHash, entityId: data.reversalId, responseSnapshot: safeResponse, createdAt: FieldValue.serverTimestamp() });
    return safeResponse;
  });
}

export async function cancelReversalRequestAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  const data = cancelReversalRequestSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "cancelReversalRequest", data.idempotencyKey);
  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const { reversalRef, reversal } = await readReversal(tx, data.reversalId, actor);
    const allowed = reversal.requestedBy === actor.uid || ["branch_manager", "admin", "super_admin"].includes(actor.platformRole);
    if (!allowed) throw new HttpsError("permission-denied", "Cannot cancel this reversal.");
    if (reversal.status !== "requested") throw new HttpsError("failed-precondition", "Only requested reversals can be cancelled.");
    const safeResponse = response(data.reversalId, { reversalId: data.reversalId, status: "cancelled" });
    tx.update(reversalRef, { status: "cancelled", cancelledBy: actor.uid, cancelledAt: FieldValue.serverTimestamp(), cancellationReason: data.cancellationReason, updatedAt: FieldValue.serverTimestamp() });
    tx.set(adminDb().collection("auditLogs").doc(`cancelReversalRequest_${data.reversalId}_${keyHash}`), auditData(actor, "reversal.cancelled", "saleReversal", data.reversalId, reversal.branchId, { status: reversal.status }, { cancellationReason: data.cancellationReason }));
    tx.set(ref, { actorId: actor.uid, operation: "cancelReversalRequest", keyHash, entityId: data.reversalId, responseSnapshot: safeResponse, createdAt: FieldValue.serverTimestamp() });
    return safeResponse;
  });
}

export async function completeApprovedReversalAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["admin", "super_admin"]);
  const data = completeApprovedReversalSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "completeApprovedReversal", data.idempotencyKey);
  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const { reversalRef, reversal } = await readReversal(tx, data.reversalId, actor);
    if (reversal.status !== "approved") throw new HttpsError("failed-precondition", "Reversal is not approved.");
    const { orderRef, order } = await readOrderForReversal(tx, reversal.orderId, actor);
    const [previous, payments] = await Promise.all([
      previousReversalSnapshot(tx, reversal.orderId, false),
      paymentCapacity(tx, reversal.orderId),
    ]);
    const items = (reversal.items ?? []) as ReversalItem[];
    for (const item of items) {
      const soldItem = (order.items ?? []).find((orderItem: OrderItem) => orderItem.productId === item.productId);
      const previousCompleted = previous.quantityByProduct.get(item.productId) ?? 0;
      if (!soldItem || item.requestedReversalQuantity > soldItem.quantity - previousCompleted) {
        throw new HttpsError("failed-precondition", "Reversal quantity is no longer available.");
      }
    }
    if (positiveInt(reversal.refundAmountKobo) > Math.max(0, payments.paidKobo - previous.refundAmountKobo)) {
      throw new HttpsError("failed-precondition", "Refund exceeds remaining paid amount.");
    }
    if (positiveInt(reversal.creditReductionKobo) > Math.max(0, payments.creditKobo - previous.creditReductionKobo)) {
      throw new HttpsError("failed-precondition", "Credit reduction exceeds remaining credit amount.");
    }

    const inventoryRefs = items.map((item) => adminDb().doc(`branches/${reversal.branchId}/inventory/${item.productId}`));
    const financialRefs = items.map((item) => adminDb().doc(`branches/${reversal.branchId}/inventoryFinancials/${item.productId}`));
    const creditReductionKobo = positiveInt(reversal.creditReductionKobo);
    const customerRef = creditReductionKobo > 0 && order.customerId ? adminDb().doc(`customers/${order.customerId}`) : null;
    const [inventories, financials] = await Promise.all([
      Promise.all(inventoryRefs.map((item) => tx.get(item))),
      Promise.all(financialRefs.map((item) => tx.get(item))),
    ]);
    const customerSnapshot = customerRef ? await tx.get(customerRef) : null;
    if (creditReductionKobo > 0) {
      if (!customerRef || !customerSnapshot?.exists) {
        throw new HttpsError("failed-precondition", "Credit customer is missing.");
      }
      if (creditReductionKobo > positiveInt(customerSnapshot.data()?.outstandingBalanceKobo)) {
        throw new HttpsError("failed-precondition", "Credit reduction exceeds outstanding balance.");
      }
    }

    for (const [index, item] of items.entries()) {
      const inventory = inventories[index];
      if (!inventory.exists) throw new HttpsError("failed-precondition", "Inventory is missing.");
      const inv = inventory.data();
      const before = { onHandQty: positiveInt(inv?.onHandQty), reservedQty: positiveInt(inv?.reservedQty) };
      const after = { onHandQty: before.onHandQty + item.stockReturnedQuantity, reservedQty: before.reservedQty };
      tx.update(inventoryRefs[index], {
        onHandQty: after.onHandQty,
        returnedQty: positiveInt(inv?.returnedQty) + item.stockReturnedQuantity,
        reversedSoldQty: positiveInt(inv?.reversedSoldQty) + item.requestedReversalQuantity,
        isLowStock: after.onHandQty - after.reservedQty <= positiveInt(inv?.reorderLevel),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      if (item.stockReturnedQuantity > 0) {
        const financial = financials[index].data();
        const unitCostKobo = item.inventoryUnitCostKobo > 0 ? item.inventoryUnitCostKobo : positiveInt(financial?.averageUnitCostKobo);
        const inventoryValueImpactKobo = item.inventoryValueImpactKobo > 0
          ? item.inventoryValueImpactKobo
          : item.stockReturnedQuantity * unitCostKobo;
        const nextValue = positiveInt(financial?.stockValueKobo) + inventoryValueImpactKobo;
        tx.set(financialRefs[index], {
          productId: item.productId,
          stockValueKobo: nextValue,
          averageUnitCostKobo: after.onHandQty > 0 ? Math.floor(nextValue / after.onHandQty) : 0,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        }, { merge: true });
        tx.set(adminDb().collection("stockMovements").doc(`${data.reversalId}_sale_returned_${item.productId}_${keyHash}`), {
          branchId: reversal.branchId,
          productId: item.productId,
          orderId: reversal.orderId,
          reversalId: data.reversalId,
          movementType: "sale_returned",
          quantity: item.stockReturnedQuantity,
          onHandBefore: before.onHandQty,
          onHandAfter: after.onHandQty,
          reservedBefore: before.reservedQty,
          reservedAfter: after.reservedQty,
          reason: reversal.reason,
          performedBy: actor.uid,
          createdAt: FieldValue.serverTimestamp(),
          idempotencyKeyHash: keyHash,
          unitCostKobo,
          inventoryValueImpactKobo,
        });
      }
      if (item.stockNotReturnedQuantity > 0) {
        tx.set(adminDb().collection("stockMovements").doc(`${data.reversalId}_sale_reversed_no_stock_return_${item.productId}_${keyHash}`), {
          branchId: reversal.branchId,
          productId: item.productId,
          orderId: reversal.orderId,
          reversalId: data.reversalId,
          movementType: "sale_reversed_no_stock_return",
          quantity: item.stockNotReturnedQuantity,
          onHandBefore: before.onHandQty,
          onHandAfter: after.onHandQty,
          reservedBefore: before.reservedQty,
          reservedAfter: after.reservedQty,
          reason: reversal.reason,
          performedBy: actor.uid,
          createdAt: FieldValue.serverTimestamp(),
          idempotencyKeyHash: keyHash,
        });
      }
    }

    const refundAmountKobo = positiveInt(reversal.refundAmountKobo);
    if (refundAmountKobo > 0) {
      tx.set(adminDb().collection("financialTransactions").doc(`${data.reversalId}_refund_${keyHash}`), {
        branchId: reversal.branchId,
        orderId: reversal.orderId,
        reversalId: data.reversalId,
        transactionType: "sale_refund",
        refundMethod: reversal.refundMethod ?? "no_refund",
        amountKobo: refundAmountKobo,
        direction: "out",
        reference: reversal.reversalNumber,
        receivedBy: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
        idempotencyKeyHash: keyHash,
      });
    }
    if (creditReductionKobo > 0) {
      const outstandingBalanceKobo = positiveInt(customerSnapshot?.data()?.outstandingBalanceKobo);
      tx.update(customerRef as FirebaseFirestore.DocumentReference, { outstandingBalanceKobo: outstandingBalanceKobo - creditReductionKobo, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
      tx.set(adminDb().collection("financialTransactions").doc(`${data.reversalId}_credit_${keyHash}`), {
        branchId: reversal.branchId,
        orderId: reversal.orderId,
        reversalId: data.reversalId,
        transactionType: "credit_reduction",
        paymentMethod: "credit",
        amountKobo: creditReductionKobo,
        direction: "receivable_reduction",
        reference: reversal.reversalNumber,
        receivedBy: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
        idempotencyKeyHash: keyHash,
      });
    }
    if (refundAmountKobo === 0 && creditReductionKobo === 0 && items.length === 0) {
      tx.set(adminDb().collection("financialTransactions").doc(`${data.reversalId}_adjustment_${keyHash}`), {
        branchId: reversal.branchId,
        orderId: reversal.orderId,
        reversalId: data.reversalId,
        transactionType: "reversal_adjustment",
        amountKobo: 0,
        direction: "none",
        reference: reversal.reversalNumber,
        receivedBy: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
        idempotencyKeyHash: keyHash,
      });
    }

    const totalSoldQty = (order.items ?? []).reduce((sum: number, item: OrderItem) => sum + item.quantity, 0);
    const completedQty = previous.completedQuantity + items.reduce((sum, item) => sum + item.requestedReversalQuantity, 0);
    const nextStatus = completedQty === 0 ? order.status : completedQty >= totalSoldQty ? "reversed" : "partially_reversed";
    const safeResponse = response(data.reversalId, { reversalId: data.reversalId, status: "completed", orderStatus: nextStatus });
    tx.update(orderRef, { status: nextStatus, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    tx.update(reversalRef, { status: "completed", completedBy: actor.uid, completedAt: FieldValue.serverTimestamp(), completionNote: data.completionNote ?? null, stockReturned: items.some((item) => item.stockReturnedQuantity > 0), updatedAt: FieldValue.serverTimestamp() });
    tx.set(adminDb().collection("auditLogs").doc(`completeApprovedReversal_${data.reversalId}_${keyHash}`), auditData(actor, "reversal.completed", "saleReversal", data.reversalId, reversal.branchId, { status: reversal.status, orderStatus: order.status }, safeResponse, { refundAmountKobo, creditReductionKobo }));
    tx.set(ref, { actorId: actor.uid, operation: "completeApprovedReversal", keyHash, entityId: data.reversalId, responseSnapshot: safeResponse, createdAt: FieldValue.serverTimestamp() });
    return safeResponse;
  });
}
