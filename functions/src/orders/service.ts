import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

import { requireActor } from "../shared/auth";
import { adminDb, adminStorageBucket } from "../shared/firebase";
import { createOpaqueToken, hashValue } from "../shared/hash";
import { canAccessBranch, type ActorProfile } from "../shared/roles";
import {
  approveDiscountSchema,
  cancelOrderSchema,
  confirmPaymentSchema,
  createPaymentProofUploadIntentSchema,
  createOrderSchema,
  requestDiscountApprovalSchema,
  reissueOrderQrTokenSchema,
  updateUnpaidOrderSchema,
  validateReleaseQrSchema,
  verifyAndCompleteReleaseSchema,
  type CreateOrderInput,
  type OrderItemInput,
  type PaymentLineInput,
} from "./schemas";
import type { OrderDocument, OrderItem, OrderStatus, StockMovementType } from "./types";

type BranchSettings = {
  orderExpiryMinutes: number;
  registrarMaximumDiscountPercent: number;
  managerApprovalThresholdPercent: number;
  requireDiscountReason: boolean;
  requireTransferProof: boolean;
  allowCreditSales: boolean;
  allowSplitPayments: boolean;
};

const defaultBranchSettings: BranchSettings = {
  orderExpiryMinutes: 60,
  registrarMaximumDiscountPercent: 0,
  managerApprovalThresholdPercent: 0,
  requireDiscountReason: false,
  requireTransferProof: false,
  allowCreditSales: false,
  allowSplitPayments: true,
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

function getSettings(branchData: FirebaseFirestore.DocumentData | undefined) {
  return {
    ...defaultBranchSettings,
    ...(branchData?.settings ?? {}),
  } as BranchSettings;
}

function idemRef(actor: ActorProfile, operation: string, idempotencyKey: string) {
  const keyHash = hashValue(idempotencyKey);
  return {
    keyHash,
    ref: adminDb().doc(
      `idempotencyRecords/${actor.uid}_${operation}_${keyHash}`,
    ),
  };
}

function safeResponse(id: string, extra: Record<string, unknown> = {}) {
  return { id, ...extra };
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
  orderId,
  movementType,
  quantity,
  before,
  after,
  reason,
  actor,
  keyHash,
}: {
  branchId: string;
  productId: string;
  orderId: string;
  movementType:
    StockMovementType;
  quantity: number;
  before: { onHandQty: number; reservedQty: number };
  after: { onHandQty: number; reservedQty: number };
  reason: string;
  actor: ActorProfile;
  keyHash: string;
}) {
  return {
    branchId,
    productId,
    orderId,
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

function generateOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = createOpaqueToken(4).slice(0, 6).toUpperCase();
  return `YI-${stamp}-${suffix}`;
}

async function readCustomerSnapshot(
  tx: FirebaseFirestore.Transaction,
  branchId: string,
  input: CreateOrderInput,
) {
  if (input.customerType === "walk_in") {
    return {
      customerId: null,
      customerSnapshot: input.customerSnapshot ?? null,
    };
  }

  if (!input.customerId) {
    throw new HttpsError("invalid-argument", "Customer is required.");
  }

  const customerRef = adminDb().doc(`customers/${input.customerId}`);
  const customerSnapshot = await tx.get(customerRef);

  if (
    !customerSnapshot.exists ||
    customerSnapshot.data()?.branchId !== branchId ||
    customerSnapshot.data()?.isActive !== true
  ) {
    throw new HttpsError("invalid-argument", "Invalid customer.");
  }

  const data = customerSnapshot.data();
  const snapshot: { name?: string; phone?: string; address?: string } = {
    name: String(data?.name ?? ""),
    phone: String(data?.phone ?? ""),
  };

  if (data?.address) {
    snapshot.address = String(data.address);
  }

  return {
    customerId: input.customerId,
    customerSnapshot: snapshot,
  };
}

function maxDiscountPercent(items: OrderItemInput[]) {
  return Math.max(...items.map((item) => item.discountPercent ?? 0));
}

function approvalNeeded(items: OrderItemInput[], settings: BranchSettings) {
  return maxDiscountPercent(items) > settings.registrarMaximumDiscountPercent;
}

function validateDiscountReasons(items: OrderItemInput[], settings: BranchSettings) {
  if (!settings.requireDiscountReason) {
    return;
  }

  for (const item of items) {
    if ((item.discountPercent ?? 0) > 0 && !item.discountReason) {
      throw new HttpsError("invalid-argument", "Discount reason is required.");
    }
  }
}

async function buildOrderItems(
  tx: FirebaseFirestore.Transaction,
  branchId: string,
  actor: ActorProfile,
  inputs: OrderItemInput[],
  existingItems: OrderItem[] = [],
) {
  const existingByProduct = new Map(
    existingItems.map((item) => [item.productId, item]),
  );
  const items: OrderItem[] = [];
  const productRefs = inputs.map((item) =>
    adminDb().doc(`branches/${branchId}/products/${item.productId}`),
  );
  const productSnapshots = await Promise.all(productRefs.map((ref) => tx.get(ref)));

  for (const [index, input] of inputs.entries()) {
    const existing = existingByProduct.get(input.productId);
    const productSnapshot = productSnapshots[index];
    const product = productSnapshot.data();

    if (!existing && (!productSnapshot.exists || product?.isActive !== true)) {
      throw new HttpsError("invalid-argument", "Invalid product.");
    }

    const originalUnitPriceKobo = existing
      ? existing.originalUnitPriceKobo
      : positiveInt(product?.sellingPriceKobo, -1);
    const controlSnapshot = existing
      ? null
      : await tx.get(adminDb().doc(`branches/${branchId}/productControls/${input.productId}`));
    const minimumPriceKobo = existing
      ? 0
      : controlSnapshot?.exists
        ? positiveInt(controlSnapshot.data()?.minimumPriceKobo, 0)
        : positiveInt(product?.minimumPriceKobo, 0);

    if (originalUnitPriceKobo < 0) {
      throw new HttpsError("invalid-argument", "Invalid branch product price.");
    }

    const discountPercent = input.discountPercent ?? 0;
    const lineSubtotalKobo = originalUnitPriceKobo * input.quantity;
    const lineDiscountKobo = Math.floor(
      (lineSubtotalKobo * discountPercent) / 100,
    );
    const lineTotalKobo = lineSubtotalKobo - lineDiscountKobo;
    const finalUnitPriceKobo = Math.floor(lineTotalKobo / input.quantity);

    if (!existing && finalUnitPriceKobo < minimumPriceKobo) {
      throw new HttpsError("invalid-argument", "Discount is below minimum price.");
    }

    const orderItem: OrderItem = {
      productId: input.productId,
      sku: existing?.sku ?? String(product?.sku ?? ""),
      productName: existing?.productName ?? String(product?.name ?? ""),
      unit: existing?.unit ?? String(product?.unit ?? ""),
      quantity: input.quantity,
      originalUnitPriceKobo,
      finalUnitPriceKobo,
      lineSubtotalKobo,
      lineDiscountKobo,
      lineTotalKobo,
      discountPercent,
    };

    if (input.discountReason) {
      orderItem.discountReason = input.discountReason;
    }

    if (discountPercent > 0) {
      orderItem.discountAppliedBy = actor.uid;
    }

    items.push(orderItem);
  }

  const subtotalKobo = items.reduce((sum, item) => sum + item.lineSubtotalKobo, 0);
  const discountTotalKobo = items.reduce(
    (sum, item) => sum + item.lineDiscountKobo,
    0,
  );
  const grandTotalKobo = items.reduce((sum, item) => sum + item.lineTotalKobo, 0);

  return { items, subtotalKobo, discountTotalKobo, grandTotalKobo };
}

async function applyReservation(
  tx: FirebaseFirestore.Transaction,
  branchId: string,
  orderId: string,
  actor: ActorProfile,
  keyHash: string,
  beforeItems: OrderItem[],
  afterItems: OrderItem[],
  reason: string,
  movementType: "reservation_created" | "reservation_adjusted" | "reservation_released",
) {
  const quantities = new Map<string, { before: number; after: number }>();

  for (const item of beforeItems) {
    quantities.set(item.productId, {
      before: (quantities.get(item.productId)?.before ?? 0) + item.quantity,
      after: quantities.get(item.productId)?.after ?? 0,
    });
  }

  for (const item of afterItems) {
    quantities.set(item.productId, {
      before: quantities.get(item.productId)?.before ?? 0,
      after: (quantities.get(item.productId)?.after ?? 0) + item.quantity,
    });
  }

  const entries = [...quantities.entries()].filter(
    ([, qty]) => qty.before !== qty.after,
  );
  const refs = entries.map(([productId]) =>
    adminDb().doc(`branches/${branchId}/inventory/${productId}`),
  );
  const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));

  for (const [index, [productId, qty]] of entries.entries()) {
    const inventoryRef = refs[index];
    const snapshot = snapshots[index];

    if (!snapshot.exists) {
      throw new HttpsError("failed-precondition", "Inventory is missing.");
    }

    const data = snapshot.data();
    const before = {
      onHandQty: positiveInt(data?.onHandQty),
      reservedQty: positiveInt(data?.reservedQty),
    };
    const delta = qty.after - qty.before;
    const after = {
      onHandQty: before.onHandQty,
      reservedQty: before.reservedQty + delta,
    };

    if (
      after.reservedQty < 0 ||
      after.onHandQty < 0 ||
      after.onHandQty - after.reservedQty < 0
    ) {
      throw new HttpsError("failed-precondition", "Insufficient stock.");
    }

    tx.update(inventoryRef, {
      reservedQty: after.reservedQty,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    tx.set(
      adminDb().collection("stockMovements").doc(`${orderId}_${movementType}_${productId}_${keyHash}`),
      movementData({
        branchId,
        productId,
        orderId,
        movementType,
        quantity: Math.abs(delta),
        before,
        after,
        reason,
        actor,
        keyHash,
      }),
    );
  }
}

function editableBy(actor: ActorProfile, order: FirebaseFirestore.DocumentData) {
  if (["branch_manager", "admin", "super_admin"].includes(actor.platformRole)) {
    return true;
  }

  return order.createdBy === actor.uid;
}

function paymentProofPathMatches(path: string, branchId: string, orderId: string) {
  return new RegExp(
    `^payment-proofs/${branchId}/${orderId}/[^/]+/[^/]+$`,
  ).test(path);
}

function stockRemovalValue(
  quantityRemoved: number,
  previousOnHandQty: number,
  previousAverageUnitCostKobo: number,
  previousStockValueKobo: number,
) {
  if (quantityRemoved === previousOnHandQty) {
    return previousStockValueKobo;
  }

  return previousAverageUnitCostKobo * quantityRemoved;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 120);
}

function extensionForContentType(contentType: string) {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

async function verifyPaymentProofFile(intent: FirebaseFirestore.DocumentData) {
  const [metadata] = await adminStorageBucket()
    .file(String(intent.storagePath))
    .getMetadata()
    .catch(() => {
      throw new HttpsError("failed-precondition", "Payment proof upload was not found.");
    });

  const size = Number(metadata.size ?? 0);
  if (metadata.contentType !== intent.contentType || size !== intent.sizeBytes) {
    throw new HttpsError("failed-precondition", "Payment proof upload does not match the issued intent.");
  }

  if (
    metadata.metadata?.paymentProofUploadIntentId !== intent.paymentId ||
    metadata.metadata?.orderId !== intent.orderId ||
    metadata.metadata?.branchId !== intent.branchId
  ) {
    throw new HttpsError("failed-precondition", "Payment proof metadata is invalid.");
  }
}

async function validateProofIntent(
  tx: FirebaseFirestore.Transaction,
  order: FirebaseFirestore.DocumentData,
  orderId: string,
  line: PaymentLineInput,
  actor: ActorProfile,
) {
  if (!line.proofUploadIntentId || !line.proofStoragePath) {
    throw new HttpsError("invalid-argument", "Transfer proof is required.");
  }

  const intentRef = adminDb().doc(
    `paymentProofUploadIntents/${line.proofUploadIntentId}`,
  );
  const intentSnapshot = await tx.get(intentRef);

  if (!intentSnapshot.exists) {
    throw new HttpsError("invalid-argument", "Payment proof intent is invalid.");
  }

  const intent = intentSnapshot.data()!;
  if (
    intent.consumed === true ||
    intent.branchId !== order.branchId ||
    intent.orderId !== orderId ||
    intent.storagePath !== line.proofStoragePath ||
    intent.createdBy !== actor.uid
  ) {
    throw new HttpsError("invalid-argument", "Payment proof intent is invalid.");
  }

  if (
    intent.expiresAt?.toMillis &&
    intent.expiresAt.toMillis() < Date.now()
  ) {
    throw new HttpsError("failed-precondition", "Payment proof upload intent has expired.");
  }

  await verifyPaymentProofFile(intent);
  tx.update(intentRef, {
    consumed: true,
    consumedAt: FieldValue.serverTimestamp(),
  });

  return String(intent.paymentId);
}

export async function createPaymentProofUploadIntentAction(
  actorUid: string | undefined,
  input: unknown,
) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["cashier", "branch_manager", "admin", "super_admin"]);
  const data = createPaymentProofUploadIntentSchema.parse(input);
  const { keyHash, ref } = idemRef(
    actor,
    "createPaymentProofUploadIntent",
    data.idempotencyKey,
  );
  const orderRef = adminDb().doc(`orders/${data.orderId}`);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;

    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnapshot.data()!;
    ensureBranch(actor, order.branchId);
    if (order.status !== "awaiting_payment" || order.paymentStatus !== "unpaid") {
      throw new HttpsError("failed-precondition", "Order cannot receive payment proof.");
    }

    const paymentId = createOpaqueToken(12);
    const safeName = sanitizeFileName(data.fileName) || `proof.${extensionForContentType(data.contentType)}`;
    const storagePath = `payment-proofs/${order.branchId}/${data.orderId}/${paymentId}/${safeName}`;
    const intentRef = adminDb().doc(`paymentProofUploadIntents/${paymentId}`);
    const response = safeResponse(paymentId, {
      paymentId,
      proofUploadIntentId: paymentId,
      storagePath,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      requiredMetadata: {
        paymentProofUploadIntentId: paymentId,
        branchId: order.branchId,
        orderId: data.orderId,
      },
    });

    tx.set(intentRef, {
      paymentId,
      branchId: order.branchId,
      orderId: data.orderId,
      storagePath,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      createdBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60_000),
      consumed: false,
      idempotencyKeyHash: keyHash,
    });
    tx.set(
      adminDb().collection("auditLogs").doc(`createPaymentProofUploadIntent_${paymentId}_${keyHash}`),
      auditData(actor, "payment_proof.intent_created", "order", data.orderId, order.branchId, null, {
        contentType: data.contentType,
        sizeBytes: data.sizeBytes,
      }),
    );
    tx.set(ref, {
      actorId: actor.uid,
      operation: "createPaymentProofUploadIntent",
      keyHash,
      entityId: data.orderId,
      responseSnapshot: response,
      createdAt: FieldValue.serverTimestamp(),
    });

    return response;
  });
}

export async function reissueOrderQrTokenAction(
  actorUid: string | undefined,
  input: unknown,
) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["order_registrar", "branch_manager", "admin", "super_admin"]);
  const data = reissueOrderQrTokenSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "reissueOrderQrToken", data.idempotencyKey);
  const orderRef = adminDb().doc(`orders/${data.orderId}`);
  const qrToken = createOpaqueToken();

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnapshot.data()!;
    ensureBranch(actor, order.branchId);

    const elevated = ["branch_manager", "admin", "super_admin"].includes(actor.platformRole);
    if (!elevated && order.createdBy !== actor.uid) {
      throw new HttpsError("permission-denied", "Only the registrar or manager may reissue this QR token.");
    }
    if (order.paymentStatus !== "unpaid" || !["awaiting_payment", "awaiting_discount_approval"].includes(order.status)) {
      throw new HttpsError("failed-precondition", "QR token can only be reissued while the order is unpaid.");
    }

    const nextVersion = positiveInt(order.qrTokenVersion, 0) + 1;
    const response = safeResponse(data.orderId, {
      orderId: data.orderId,
      orderNumber: order.orderNumber,
      qrToken,
      qrTokenVersion: nextVersion,
      status: order.status,
    });

    tx.update(orderRef, {
      qrTokenHash: hashValue(qrToken),
      qrTokenVersion: nextVersion,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    tx.set(
      adminDb().collection("auditLogs").doc(`reissueOrderQrToken_${data.orderId}_${keyHash}`),
      auditData(actor, "order.qr_reissued", "order", data.orderId, order.branchId, {
        qrTokenVersion: order.qrTokenVersion ?? 1,
      }, {
        qrTokenVersion: nextVersion,
      }),
    );
    tx.set(ref, {
      actorId: actor.uid,
      operation: "reissueOrderQrToken",
      keyHash,
      entityId: data.orderId,
      responseSnapshot: response,
      createdAt: FieldValue.serverTimestamp(),
    });

    return response;
  });
}

export async function validateReleaseQrAction(
  actorUid: string | undefined,
  input: unknown,
) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["release_verifier", "branch_manager", "admin", "super_admin"]);
  const data = validateReleaseQrSchema.parse(input);

  return adminDb().runTransaction(async (tx) => {
    const orderRef = await findOrderByNumber(tx, data.orderNumber);
    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnapshot.data()!;
    ensureBranch(actor, order.branchId);
    if (hashValue(data.qrToken) !== order.qrTokenHash) {
      throw new HttpsError("permission-denied", "QR token is invalid.");
    }
    if (order.status !== "awaiting_release" || !["paid", "credit"].includes(order.paymentStatus)) {
      throw new HttpsError("failed-precondition", "Order is not ready for release.");
    }

    return safeResponse(orderRef.id, {
      orderId: orderRef.id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      customerType: order.customerType,
      customerSnapshot: order.customerSnapshot ?? null,
      items: (order.items ?? []).map((item: OrderItem) => ({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        unit: item.unit,
        quantity: item.quantity,
      })),
    });
  });
}

export async function createOrderAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["order_registrar", "branch_manager", "admin", "super_admin"]);
  const data = createOrderSchema.parse(input);
  ensureBranch(actor, data.branchId);

  const { keyHash, ref } = idemRef(actor, "createOrder", data.idempotencyKey);
  const orderRef = adminDb().collection("orders").doc();
  const qrToken = createOpaqueToken();
  const orderNumber = generateOrderNumber();

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      return existing.data()?.responseSnapshot;
    }

    const branchSnapshot = await tx.get(adminDb().doc(`branches/${data.branchId}`));
    if (!branchSnapshot.exists || branchSnapshot.data()?.isActive !== true) {
      throw new HttpsError("invalid-argument", "Invalid branch.");
    }

    const settings = getSettings(branchSnapshot.data());
    validateDiscountReasons(data.items, settings);
    const customer = await readCustomerSnapshot(tx, data.branchId, data);
    const calculated = await buildOrderItems(tx, data.branchId, actor, data.items);
    const needsApproval = approvalNeeded(data.items, settings);
    const status: OrderStatus = needsApproval
      ? "awaiting_discount_approval"
      : "awaiting_payment";
    const now = FieldValue.serverTimestamp();
    const response = safeResponse(orderRef.id, {
      orderId: orderRef.id,
      orderNumber,
      qrToken,
      status,
    });

    if (!needsApproval) {
      await applyReservation(
        tx,
        data.branchId,
        orderRef.id,
        actor,
        keyHash,
        [],
        calculated.items,
        "order_created",
        "reservation_created",
      );
    }

    tx.set(orderRef, {
      orderNumber,
      branchId: data.branchId,
      customerType: data.customerType,
      ...customer,
      status,
      paymentStatus: "unpaid",
      items: calculated.items,
      subtotalKobo: calculated.subtotalKobo,
      discountTotalKobo: calculated.discountTotalKobo,
      grandTotalKobo: calculated.grandTotalKobo,
      discountApprovalStatus: needsApproval ? "pending" : "not_required",
      discountRequest: needsApproval
        ? {
            requestedBy: actor.uid,
            requestedAt: now,
            maxDiscountPercent: maxDiscountPercent(data.items),
          }
        : null,
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.uid,
      expiresAt: needsApproval
        ? null
        : Timestamp.fromMillis(Date.now() + settings.orderExpiryMinutes * 60_000),
      qrTokenHash: hashValue(qrToken),
      qrTokenVersion: 1,
      idempotencyKeyHash: keyHash,
    } satisfies OrderDocument & Record<string, unknown>);
    tx.set(
      adminDb().collection("auditLogs").doc(`createOrder_${orderRef.id}_${keyHash}`),
      auditData(actor, "order.created", "order", orderRef.id, data.branchId, null, {
        status,
        grandTotalKobo: calculated.grandTotalKobo,
      }),
    );
    tx.set(ref, {
      actorId: actor.uid,
      operation: "createOrder",
      keyHash,
      entityId: orderRef.id,
      responseSnapshot: response,
      createdAt: now,
    });

    return response;
  });
}

export async function updateUnpaidOrderAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["order_registrar", "branch_manager", "admin", "super_admin"]);
  const data = updateUnpaidOrderSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "updateUnpaidOrder", data.idempotencyKey);
  const orderRef = adminDb().doc(`orders/${data.orderId}`);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;

    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnapshot.data()!;
    ensureBranch(actor, order.branchId);
    if (!["awaiting_payment", "awaiting_discount_approval"].includes(order.status)) {
      throw new HttpsError("failed-precondition", "Order cannot be edited.");
    }
    if (order.paymentStatus !== "unpaid") {
      throw new HttpsError("failed-precondition", "Paid order cannot be edited.");
    }
    if (!editableBy(actor, order)) {
      throw new HttpsError("permission-denied", "Cannot edit this order.");
    }

    const branchSnapshot = await tx.get(adminDb().doc(`branches/${order.branchId}`));
    const settings = getSettings(branchSnapshot.data());
    validateDiscountReasons(data.items, settings);
    const calculated = await buildOrderItems(
      tx,
      order.branchId,
      actor,
      data.items,
      order.items ?? [],
    );
    const needsApproval = approvalNeeded(data.items, settings);
    const nextStatus: OrderStatus = needsApproval
      ? "awaiting_discount_approval"
      : "awaiting_payment";
    const beforeItems: OrderItem[] =
      order.status === "awaiting_payment" ? order.items ?? [] : [];
    const afterItems: OrderItem[] = nextStatus === "awaiting_payment" ? calculated.items : [];

    await applyReservation(
      tx,
      order.branchId,
      data.orderId,
      actor,
      keyHash,
      beforeItems,
      afterItems,
      "order_updated",
      "reservation_adjusted",
    );

    const response = safeResponse(data.orderId, {
      orderId: data.orderId,
      status: nextStatus,
    });
    tx.update(orderRef, {
      status: nextStatus,
      items: calculated.items,
      subtotalKobo: calculated.subtotalKobo,
      discountTotalKobo: calculated.discountTotalKobo,
      grandTotalKobo: calculated.grandTotalKobo,
      discountApprovalStatus: needsApproval ? "pending" : "not_required",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
      expiresAt:
        nextStatus === "awaiting_payment"
          ? Timestamp.fromMillis(Date.now() + settings.orderExpiryMinutes * 60_000)
          : null,
    });
    tx.set(
      adminDb().collection("auditLogs").doc(`updateUnpaidOrder_${data.orderId}_${keyHash}`),
      auditData(actor, "order.updated", "order", data.orderId, order.branchId, {
        status: order.status,
        items: order.items,
      }, {
        status: nextStatus,
        items: calculated.items,
      }),
    );
    tx.set(ref, {
      actorId: actor.uid,
      operation: "updateUnpaidOrder",
      keyHash,
      entityId: data.orderId,
      responseSnapshot: response,
      createdAt: FieldValue.serverTimestamp(),
    });
    return response;
  });
}

export async function cancelOrderAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["order_registrar", "branch_manager", "admin", "super_admin"]);
  const data = cancelOrderSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "cancelOrder", data.idempotencyKey);
  const orderRef = adminDb().doc(`orders/${data.orderId}`);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnapshot.data()!;
    ensureBranch(actor, order.branchId);
    if (!["awaiting_payment", "awaiting_discount_approval"].includes(order.status)) {
      throw new HttpsError("failed-precondition", "Order cannot be cancelled.");
    }
    if (order.paymentStatus !== "unpaid") {
      throw new HttpsError("failed-precondition", "Paid order cannot be cancelled.");
    }
    if (!editableBy(actor, order)) {
      throw new HttpsError("permission-denied", "Cannot cancel this order.");
    }

    if (order.status === "awaiting_payment") {
      await applyReservation(
        tx,
        order.branchId,
        data.orderId,
        actor,
        keyHash,
        order.items ?? [],
        [],
        "order_cancelled",
        "reservation_released",
      );
    }
    const response = safeResponse(data.orderId, { orderId: data.orderId, status: "cancelled" });
    tx.update(orderRef, {
      status: "cancelled",
      cancellationReason: data.reason,
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    tx.set(
      adminDb().collection("auditLogs").doc(`cancelOrder_${data.orderId}_${keyHash}`),
      auditData(actor, "order.cancelled", "order", data.orderId, order.branchId, {
        status: order.status,
      }, {
        status: "cancelled",
        reason: data.reason,
      }),
    );
    tx.set(ref, {
      actorId: actor.uid,
      operation: "cancelOrder",
      keyHash,
      entityId: data.orderId,
      responseSnapshot: response,
      createdAt: FieldValue.serverTimestamp(),
    });
    return response;
  });
}

export async function requestDiscountApprovalAction(
  actorUid: string | undefined,
  input: unknown,
) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["order_registrar", "branch_manager", "admin", "super_admin"]);
  const data = requestDiscountApprovalSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "requestDiscountApproval", data.idempotencyKey);
  const orderRef = adminDb().doc(`orders/${data.orderId}`);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnapshot.data()!;
    ensureBranch(actor, order.branchId);
    if (order.status !== "awaiting_discount_approval") {
      throw new HttpsError("failed-precondition", "Order is not pending approval.");
    }
    const response = safeResponse(data.orderId, { orderId: data.orderId });
    tx.update(orderRef, {
      discountRequest: {
        ...(order.discountRequest ?? {}),
        requestedBy: actor.uid,
        requestedAt: FieldValue.serverTimestamp(),
        reason: data.reason ?? null,
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    tx.set(
      adminDb().collection("auditLogs").doc(`requestDiscountApproval_${data.orderId}_${keyHash}`),
      auditData(actor, "discount.requested", "order", data.orderId, order.branchId, null, {
        reason: data.reason ?? null,
      }),
    );
    tx.set(ref, {
      actorId: actor.uid,
      operation: "requestDiscountApproval",
      keyHash,
      entityId: data.orderId,
      responseSnapshot: response,
      createdAt: FieldValue.serverTimestamp(),
    });
    return response;
  });
}

export async function approveDiscountAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["branch_manager", "admin", "super_admin"]);
  const data = approveDiscountSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "approveDiscount", data.idempotencyKey);
  const orderRef = adminDb().doc(`orders/${data.orderId}`);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnapshot.data()!;
    ensureBranch(actor, order.branchId);
    if (order.status !== "awaiting_discount_approval") {
      throw new HttpsError("failed-precondition", "Order is not pending approval.");
    }

    const response = safeResponse(data.orderId, {
      orderId: data.orderId,
      status: data.decision === "approved" ? "awaiting_payment" : "cancelled",
    });
    if (data.decision === "approved") {
      const branchSnapshot = await tx.get(adminDb().doc(`branches/${order.branchId}`));
      const settings = getSettings(branchSnapshot.data());
      await applyReservation(
        tx,
        order.branchId,
        data.orderId,
        actor,
        keyHash,
        [],
        order.items ?? [],
        "discount_approved",
        "reservation_created",
      );
      tx.update(orderRef, {
        status: "awaiting_payment",
        discountApprovalStatus: "approved",
        items: (order.items ?? []).map((item: OrderItem) => ({
          ...item,
          discountApprovedBy: actor.uid,
          discountApprovedAt: Timestamp.now(),
        })),
        expiresAt: Timestamp.fromMillis(
          Date.now() + settings.orderExpiryMinutes * 60_000,
        ),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
    } else {
      tx.update(orderRef, {
        status: "cancelled",
        discountApprovalStatus: "rejected",
        cancellationReason: data.reason ?? "Discount rejected",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
    }
    tx.set(
      adminDb().collection("auditLogs").doc(`approveDiscount_${data.orderId}_${keyHash}`),
      auditData(actor, `discount.${data.decision}`, "order", data.orderId, order.branchId, {
        status: order.status,
      }, {
        decision: data.decision,
        reason: data.reason ?? null,
      }),
    );
    tx.set(ref, {
      actorId: actor.uid,
      operation: "approveDiscount",
      keyHash,
      entityId: data.orderId,
      responseSnapshot: response,
      createdAt: FieldValue.serverTimestamp(),
    });
    return response;
  });
}

export async function confirmPaymentAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["cashier", "branch_manager", "admin", "super_admin"]);
  const data = confirmPaymentSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "confirmPayment", data.idempotencyKey);
  const orderRef = adminDb().doc(`orders/${data.orderId}`);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnapshot.data()!;
    ensureBranch(actor, order.branchId);
    if (order.status !== "awaiting_payment" || order.paymentStatus !== "unpaid") {
      throw new HttpsError("failed-precondition", "Order cannot be paid.");
    }

    const branchSnapshot = await tx.get(adminDb().doc(`branches/${order.branchId}`));
    const settings = getSettings(branchSnapshot.data());
    if (data.paymentLines.length > 1 && !settings.allowSplitPayments) {
      throw new HttpsError("failed-precondition", "Split payments are disabled.");
    }

    const total = data.paymentLines.reduce((sum, line) => sum + line.amountKobo, 0);
    if (total !== order.grandTotalKobo) {
      throw new HttpsError("invalid-argument", "Payment total must match order total.");
    }

    const hasCredit = data.paymentLines.some((line) => line.paymentMethod === "credit");
    if (hasCredit) {
      if (!settings.allowCreditSales || order.customerType !== "registered" || !order.customerId) {
        throw new HttpsError("failed-precondition", "Credit sale is not allowed.");
      }
      const customerRef = adminDb().doc(`customers/${order.customerId}`);
      const customerSnapshot = await tx.get(customerRef);
      if (!customerSnapshot.exists) {
        throw new HttpsError("failed-precondition", "Customer is missing.");
      }
      const customer = customerSnapshot.data();
      const creditLimitKobo = positiveInt(customer?.creditLimitKobo);
      const outstandingBalanceKobo = positiveInt(customer?.outstandingBalanceKobo);
      const creditAmount = data.paymentLines
        .filter((line) => line.paymentMethod === "credit")
        .reduce((sum, line) => sum + line.amountKobo, 0);
      if (outstandingBalanceKobo + creditAmount > creditLimitKobo) {
        throw new HttpsError("failed-precondition", "Insufficient customer credit.");
      }
      tx.update(customerRef, {
        outstandingBalanceKobo: outstandingBalanceKobo + creditAmount,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
    }

    const paymentIds: string[] = [];
    for (const [index, line] of data.paymentLines.entries()) {
      const proofRequired =
        line.paymentMethod === "bank_transfer" && settings.requireTransferProof;
      let confirmedProofPath: string | null = null;
      let paymentId = `${keyHash}_${index}`;

      if (line.proofStoragePath && !paymentProofPathMatches(line.proofStoragePath, order.branchId, data.orderId)) {
        throw new HttpsError("invalid-argument", "Invalid payment proof path.");
      }

      if (proofRequired || line.proofUploadIntentId || line.proofStoragePath) {
        paymentId = await validateProofIntent(tx, order, data.orderId, line, actor);
        confirmedProofPath = line.proofStoragePath as string;
      }

      paymentIds.push(paymentId);
      tx.set(orderRef.collection("payments").doc(paymentId), {
        branchId: order.branchId,
        orderId: data.orderId,
        paymentMethod: line.paymentMethod,
        amountKobo: line.amountKobo,
        reference: line.reference ?? null,
        proofStoragePath: confirmedProofPath,
        proofRequired,
        receivedBy: actor.uid,
        receivedAt: FieldValue.serverTimestamp(),
        status: "confirmed",
        idempotencyKeyHash: keyHash,
      });
      tx.set(adminDb().collection("financialTransactions").doc(`${data.orderId}_${paymentId}`), {
        branchId: order.branchId,
        orderId: data.orderId,
        paymentId,
        transactionType: line.paymentMethod === "credit" ? "credit_sale" : "sale_payment",
        paymentMethod: line.paymentMethod,
        amountKobo: line.amountKobo,
        direction: line.paymentMethod === "credit" ? "receivable" : "in",
        reference: line.reference ?? null,
        receivedBy: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
        idempotencyKeyHash: keyHash,
      });
    }

    const paymentStatus = hasCredit ? "credit" : "paid";
    const response = safeResponse(data.orderId, {
      orderId: data.orderId,
      paymentIds,
      status: "awaiting_release",
      paymentStatus,
    });
    tx.update(orderRef, {
      status: "awaiting_release",
      paymentStatus,
      paidAt: FieldValue.serverTimestamp(),
      paidBy: actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    tx.set(
      adminDb().collection("auditLogs").doc(`confirmPayment_${data.orderId}_${keyHash}`),
      auditData(actor, "payment.confirmed", "order", data.orderId, order.branchId, {
        status: order.status,
        paymentStatus: order.paymentStatus,
      }, {
        status: "awaiting_release",
        paymentStatus,
        totalKobo: total,
      }),
    );
    tx.set(ref, {
      actorId: actor.uid,
      operation: "confirmPayment",
      keyHash,
      entityId: data.orderId,
      responseSnapshot: response,
      createdAt: FieldValue.serverTimestamp(),
    });
    return response;
  });
}

async function findOrderByNumber(tx: FirebaseFirestore.Transaction, orderNumber: string) {
  const snapshot = await tx.get(
    adminDb().collection("orders").where("orderNumber", "==", orderNumber).limit(1),
  );

  if (snapshot.empty) {
    throw new HttpsError("not-found", "Order not found.");
  }

  return snapshot.docs[0].ref;
}

export async function verifyAndCompleteReleaseAction(
  actorUid: string | undefined,
  input: unknown,
) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, ["release_verifier", "branch_manager", "admin", "super_admin"]);
  const data = verifyAndCompleteReleaseSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "verifyAndCompleteRelease", data.idempotencyKey);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const orderRef = data.orderId
      ? adminDb().doc(`orders/${data.orderId}`)
      : await findOrderByNumber(tx, data.orderNumber as string);
    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnapshot.data()!;
    ensureBranch(actor, order.branchId);
    if (order.status !== "awaiting_release" || !["paid", "credit"].includes(order.paymentStatus)) {
      throw new HttpsError("failed-precondition", "Order is not ready for release.");
    }
    if (data.verificationMethod === "qr" && hashValue(data.qrToken as string) !== order.qrTokenHash) {
      throw new HttpsError("permission-denied", "QR token is invalid.");
    }

    const inventoryRefs: FirebaseFirestore.DocumentReference[] = (order.items ?? []).map((item: OrderItem) =>
      adminDb().doc(`branches/${order.branchId}/inventory/${item.productId}`),
    );
    const inventorySnapshots = await Promise.all(inventoryRefs.map((invRef) => tx.get(invRef)));
    const financialRefs: FirebaseFirestore.DocumentReference[] = (order.items ?? []).map((item: OrderItem) =>
      adminDb().doc(`branches/${order.branchId}/inventoryFinancials/${item.productId}`),
    );
    const financialSnapshots = await Promise.all(financialRefs.map((finRef) => tx.get(finRef)));

    for (const [index, item] of (order.items ?? []).entries()) {
      const invRef = inventoryRefs[index];
      const invSnapshot = inventorySnapshots[index];
      const financialRef = financialRefs[index];
      const financialSnapshot = financialSnapshots[index];
      if (!invSnapshot.exists) {
        throw new HttpsError("failed-precondition", "Inventory is missing.");
      }
      const inv = invSnapshot.data();
      const before = {
        onHandQty: positiveInt(inv?.onHandQty),
        reservedQty: positiveInt(inv?.reservedQty),
      };
      if (before.reservedQty < item.quantity || before.onHandQty < item.quantity) {
        throw new HttpsError("failed-precondition", "Inventory reservation is invalid.");
      }
      const after = {
        onHandQty: before.onHandQty - item.quantity,
        reservedQty: before.reservedQty - item.quantity,
      };
      if (after.onHandQty < 0 || after.reservedQty < 0 || after.onHandQty - after.reservedQty < 0) {
        throw new HttpsError("failed-precondition", "Inventory invariant failed.");
      }
      tx.update(invRef, {
        onHandQty: after.onHandQty,
        reservedQty: after.reservedQty,
        soldQty: positiveInt(inv?.soldQty) + item.quantity,
        isLowStock: after.onHandQty - after.reservedQty <= positiveInt(inv?.reorderLevel),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      const financial = financialSnapshot.data();
      const previousAverageUnitCostKobo = positiveInt(financial?.averageUnitCostKobo);
      const previousStockValueKobo = positiveInt(financial?.stockValueKobo);
      const removedValueKobo = stockRemovalValue(
        item.quantity,
        before.onHandQty,
        previousAverageUnitCostKobo,
        previousStockValueKobo,
      );
      const nextStockValueKobo = Math.max(0, previousStockValueKobo - removedValueKobo);

      tx.set(financialRef, {
        productId: item.productId,
        averageUnitCostKobo:
          after.onHandQty > 0 ? Math.floor(nextStockValueKobo / after.onHandQty) : 0,
        stockValueKobo: nextStockValueKobo,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      }, { merge: true });
      tx.set(
        adminDb().collection("stockMovements").doc(`${orderRef.id}_stock_out_${item.productId}_${keyHash}`),
        {
          ...movementData({
          branchId: order.branchId,
          productId: item.productId,
          orderId: orderRef.id,
          movementType: "stock_out",
          quantity: item.quantity,
          before,
          after,
          reason: "release_completed",
          actor,
          keyHash,
          }),
          unitCostKobo: item.quantity > 0 ? Math.floor(removedValueKobo / item.quantity) : 0,
          inventoryValueImpactKobo: removedValueKobo,
        },
      );
    }
    const response = safeResponse(orderRef.id, {
      orderId: orderRef.id,
      status: "completed",
    });
    tx.update(orderRef, {
      status: "completed",
      releasedAt: FieldValue.serverTimestamp(),
      releasedBy: actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
      verificationMethod: data.verificationMethod,
      manualVerificationReason: data.manualReason ?? null,
    });
    tx.set(
      adminDb().collection("auditLogs").doc(`verifyAndCompleteRelease_${orderRef.id}_${keyHash}`),
      auditData(actor, "release.completed", "order", orderRef.id, order.branchId, {
        status: order.status,
      }, {
        status: "completed",
        verificationMethod: data.verificationMethod,
      }),
    );
    tx.set(ref, {
      actorId: actor.uid,
      operation: "verifyAndCompleteRelease",
      keyHash,
      entityId: orderRef.id,
      responseSnapshot: response,
      createdAt: FieldValue.serverTimestamp(),
    });
    return response;
  });
}

export async function expireStaleOrdersAction(limit = 50) {
  const now = Timestamp.now();
  const snapshot = await adminDb()
    .collection("orders")
    .where("status", "==", "awaiting_payment")
    .where("expiresAt", "<=", now)
    .limit(limit)
    .get();
  let expiredCount = 0;

  for (const orderDoc of snapshot.docs) {
    const actor: ActorProfile = {
      uid: "system",
      displayName: "System",
      email: "system@yita.local",
      isActive: true,
      platformRole: "super_admin",
      assignedBranchIds: [],
    };
    const keyHash = hashValue(`expire:${orderDoc.id}:${orderDoc.updateTime.toMillis()}`);
    await adminDb().runTransaction(async (tx) => {
      const fresh = await tx.get(orderDoc.ref);
      if (!fresh.exists || fresh.data()?.status !== "awaiting_payment") return;
      const order = fresh.data()!;
      if (!order.expiresAt || order.expiresAt.toMillis() > Date.now()) return;
      await applyReservation(
        tx,
        order.branchId,
        orderDoc.id,
        actor,
        keyHash,
        order.items ?? [],
        [],
        "order_expired",
        "reservation_released",
      );
      tx.update(orderDoc.ref, {
        status: "expired",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "system",
      });
      tx.set(
        adminDb().collection("auditLogs").doc(`expireStaleOrders_${orderDoc.id}_${keyHash}`),
        auditData(actor, "order.expired", "order", orderDoc.id, order.branchId, {
          status: order.status,
        }, {
          status: "expired",
        }),
      );
      expiredCount += 1;
    });
  }

  return { expiredCount };
}
