import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  confirmPaymentAction,
  createOrderAction,
  verifyAndCompleteReleaseAction,
} from "../src/orders/service";
import {
  approveReversalRequestAction,
  cancelReversalRequestAction,
  completeApprovedReversalAction,
  createReversalRequestAction,
  getReversalPreviewAction,
  rejectReversalRequestAction,
} from "../src/reversals/service";

function init() {
  if (getApps().length === 0) initializeApp({ projectId: "yita-iceberg-dev" });
}

async function clearFirestore() {
  const db = getFirestore();
  const collections = await db.listCollections();
  await Promise.all(
    collections.map(async (collection) => {
      const snapshot = await collection.get();
      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    }),
  );
}

async function clearAuthUsers() {
  const users = await getAuth().listUsers(1000);
  await Promise.all(users.users.map((user) => getAuth().deleteUser(user.uid)));
}

async function seedUser(uid: string, role: string, branchIds: string[] = []) {
  await getAuth().createUser({
    uid,
    email: `${uid}@example.test`,
    displayName: uid,
    password: "ChangeMe123!",
  });
  await getFirestore().doc(`users/${uid}`).set({
    displayName: uid,
    email: `${uid}@example.test`,
    isActive: true,
    platformRole: role,
    assignedBranchIds: branchIds,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: "test",
    updatedBy: "test",
  });
}

async function seedBase() {
  const db = getFirestore();
  await Promise.all([
    db.doc("branches/branch-a").set({
      name: "Branch A",
      code: "A",
      isActive: true,
      settings: { orderExpiryMinutes: 60, registrarMaximumDiscountPercent: 10, requireDiscountReason: false, requireTransferProof: false, allowCreditSales: true, allowSplitPayments: true },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.doc("branches/branch-b").set({
      name: "Branch B",
      code: "B",
      isActive: true,
      settings: { orderExpiryMinutes: 60, registrarMaximumDiscountPercent: 10, requireDiscountReason: false, requireTransferProof: false, allowCreditSales: true, allowSplitPayments: true },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.doc("branches/branch-a/products/product-1").set({
      productId: "product-1",
      sku: "SKU-1",
      name: "Ice Block",
      unit: "bag",
      sellingPriceKobo: 100_000,
      minimumPriceKobo: 50_000,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.doc("branches/branch-a/productControls/product-1").set({
      productId: "product-1",
      minimumPriceKobo: 50_000,
      defaultCostPriceKobo: 40_000,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.doc("branches/branch-a/inventory/product-1").set({
      productId: "product-1",
      sku: "SKU-1",
      productName: "Ice Block",
      unit: "bag",
      onHandQty: 20,
      reservedQty: 0,
      soldQty: 0,
      reversedSoldQty: 0,
      returnedQty: 0,
      damagedQty: 0,
      reorderLevel: 2,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "seed",
    }),
    db.doc("branches/branch-a/inventoryFinancials/product-1").set({
      productId: "product-1",
      averageUnitCostKobo: 40_000,
      stockValueKobo: 800_000,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.doc("branches/branch-b/products/product-1").set({
      productId: "product-1",
      sku: "SKU-B",
      name: "Branch B Ice",
      unit: "bag",
      sellingPriceKobo: 100_000,
      minimumPriceKobo: 50_000,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.doc("branches/branch-b/inventory/product-1").set({
      productId: "product-1",
      onHandQty: 10,
      reservedQty: 0,
      soldQty: 0,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.doc("customers/customer-a").set({
      name: "Customer A",
      phone: "08000000000",
      branchId: "branch-a",
      creditLimitKobo: 1_000_000,
      outstandingBalanceKobo: 0,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: "seed",
      updatedBy: "seed",
    }),
  ]);
  await seedUser("registrar-a", "order_registrar", ["branch-a"]);
  await seedUser("manager-a", "branch_manager", ["branch-a"]);
  await seedUser("manager-b", "branch_manager", ["branch-b"]);
  await seedUser("cashier-a", "cashier", ["branch-a"]);
  await seedUser("release-a", "release_verifier", ["branch-a"]);
  await seedUser("admin", "admin");
}

async function completedCashOrder(quantity = 2, key = "cash") {
  const order = await createOrderAction("registrar-a", {
    branchId: "branch-a",
    customerType: "walk_in",
    items: [{ productId: "product-1", quantity, discountPercent: 0 }],
    idempotencyKey: `idem-order-${key}`,
  });
  await confirmPaymentAction("cashier-a", {
    orderId: order.orderId,
    paymentLines: [{ paymentMethod: "cash", amountKobo: quantity * 100_000 }],
    idempotencyKey: `idem-payment-${key}`,
  });
  await verifyAndCompleteReleaseAction("release-a", {
    orderId: order.orderId,
    verificationMethod: "qr",
    qrToken: order.qrToken,
    idempotencyKey: `idem-release-${key}`,
  });
  return order.orderId;
}

async function completedCreditOrder(quantity = 2) {
  const order = await createOrderAction("registrar-a", {
    branchId: "branch-a",
    customerType: "registered",
    customerId: "customer-a",
    items: [{ productId: "product-1", quantity, discountPercent: 0 }],
    idempotencyKey: "idem-order-credit",
  });
  await confirmPaymentAction("cashier-a", {
    orderId: order.orderId,
    paymentLines: [{ paymentMethod: "credit", amountKobo: quantity * 100_000 }],
    idempotencyKey: "idem-payment-credit",
  });
  await verifyAndCompleteReleaseAction("release-a", {
    orderId: order.orderId,
    verificationMethod: "qr",
    qrToken: order.qrToken,
    idempotencyKey: "idem-release-credit",
  });
  return order.orderId;
}

beforeAll(() => init());

beforeEach(async () => {
  await clearAuthUsers();
  await clearFirestore();
  await seedBase();
});

describe("reversal request workflow", () => {
  it("rejects non-completed orders, unauthorized staff, and cross-branch requests", async () => {
    const unpaid = await createOrderAction("registrar-a", {
      branchId: "branch-a",
      customerType: "walk_in",
      items: [{ productId: "product-1", quantity: 1, discountPercent: 0 }],
      idempotencyKey: "idem-unpaid-order",
    });
    await expect(getReversalPreviewAction("manager-a", { orderId: unpaid.orderId })).rejects.toMatchObject({ code: "failed-precondition" });
    const completed = await completedCashOrder(1, "unauthorized");
    await expect(createReversalRequestAction("cashier-a", {
      orderId: completed,
      reversalType: "full_reversal_with_stock_return",
      reason: "Customer returned goods",
      refundAmountKobo: 100_000,
      items: [],
      idempotencyKey: "idem-reversal-cashier-denied",
    })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(createReversalRequestAction("manager-b", {
      orderId: completed,
      reversalType: "full_reversal_with_stock_return",
      reason: "Cross branch attempt",
      refundAmountKobo: 100_000,
      items: [],
      idempotencyKey: "idem-reversal-cross-denied",
    })).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("calculates previews and blocks quantities above remaining sold amount", async () => {
    const orderId = await completedCashOrder(3, "preview");
    const preview = await getReversalPreviewAction("manager-a", { orderId });
    expect(preview.items[0].remainingReversibleQuantity).toBe(3);
    expect(preview.maximumRefundableAmountKobo).toBe(300_000);
    await expect(createReversalRequestAction("manager-a", {
      orderId,
      reversalType: "partial_reversal_with_stock_return",
      reason: "Too much quantity",
      items: [{ productId: "product-1", quantity: 4, stockReturnedQuantity: 4 }],
      refundAmountKobo: 100_000,
      idempotencyKey: "idem-reversal-too-much",
    })).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("creates a request without mutating stock or finance", async () => {
    const orderId = await completedCashOrder(2, "request-no-mutation");
    const beforeInventory = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    const beforeFinancial = await getFirestore().doc("branches/branch-a/inventoryFinancials/product-1").get();
    const request = await createReversalRequestAction("manager-a", {
      orderId,
      reversalType: "partial_reversal_with_stock_return",
      reason: "One bag returned",
      items: [{ productId: "product-1", quantity: 1, stockReturnedQuantity: 1 }],
      refundAmountKobo: 100_000,
      idempotencyKey: "idem-reversal-request",
    });
    const afterInventory = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    const afterFinancial = await getFirestore().doc("branches/branch-a/inventoryFinancials/product-1").get();
    expect(request.status).toBe("requested");
    expect(afterInventory.data()?.onHandQty).toBe(beforeInventory.data()?.onHandQty);
    expect(afterFinancial.data()?.stockValueKobo).toBe(beforeFinancial.data()?.stockValueKobo);
  });

  it("approves, rejects with reason, and cancels only requested reversals", async () => {
    const orderId = await completedCashOrder(1, "review");
    const request = await createReversalRequestAction("manager-a", {
      orderId,
      reversalType: "full_reversal_with_stock_return",
      reason: "Returned",
      refundAmountKobo: 100_000,
      idempotencyKey: "idem-review-request",
    }) as { reversalId: string };
    await expect(approveReversalRequestAction("manager-a", {
      reversalId: request.reversalId,
      idempotencyKey: "idem-review-self-approve",
    })).rejects.toMatchObject({ code: "permission-denied" });
    await approveReversalRequestAction("admin", {
      reversalId: request.reversalId,
      approvalNote: "Checked",
      idempotencyKey: "idem-review-approve",
    });
    await expect(cancelReversalRequestAction("manager-a", {
      reversalId: request.reversalId,
      cancellationReason: "Cancel late",
      idempotencyKey: "idem-review-cancel-approved",
    })).rejects.toMatchObject({ code: "failed-precondition" });

    const rejectOrder = await completedCashOrder(1, "reject");
    const rejectRequest = await createReversalRequestAction("manager-a", {
      orderId: rejectOrder,
      reversalType: "correction_note",
      reason: "Document issue",
      idempotencyKey: "idem-reject-request",
    }) as { reversalId: string };
    await rejectReversalRequestAction("admin", {
      reversalId: rejectRequest.reversalId,
      rejectionReason: "Insufficient evidence",
      idempotencyKey: "idem-reject-ok",
    });
    const rejected = await getFirestore().doc(`saleReversals/${rejectRequest.reversalId}`).get();
    expect(rejected.data()?.status).toBe("rejected");

    const cancelOrder = await completedCashOrder(1, "cancel-reversal");
    const cancelRequest = await createReversalRequestAction("manager-a", {
      orderId: cancelOrder,
      reversalType: "correction_note",
      reason: "Duplicate receipt note",
      idempotencyKey: "idem-cancel-request",
    }) as { reversalId: string };
    await cancelReversalRequestAction("manager-a", {
      reversalId: cancelRequest.reversalId,
      cancellationReason: "No longer needed",
      idempotencyKey: "idem-cancel-ok",
    });
    const cancelled = await getFirestore().doc(`saleReversals/${cancelRequest.reversalId}`).get();
    expect(cancelled.data()?.status).toBe("cancelled");
  });
});

describe("reversal completion workflow", () => {
  it("completes a partial return with stock and records valuation, refund, status, and audit", async () => {
    const orderId = await completedCashOrder(2, "partial-complete");
    const request = await createReversalRequestAction("manager-a", {
      orderId,
      reversalType: "partial_reversal_with_stock_return",
      reason: "One bag returned",
      items: [{ productId: "product-1", quantity: 1, stockReturnedQuantity: 1 }],
      refundAmountKobo: 100_000,
      idempotencyKey: "idem-partial-request",
    }) as { reversalId: string };
    await approveReversalRequestAction("admin", { reversalId: request.reversalId, idempotencyKey: "idem-partial-approve" });
    await completeApprovedReversalAction("admin", { reversalId: request.reversalId, idempotencyKey: "idem-partial-complete" });
    await completeApprovedReversalAction("admin", { reversalId: request.reversalId, idempotencyKey: "idem-partial-complete" });

    const order = await getFirestore().doc(`orders/${orderId}`).get();
    const inventory = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    const financial = await getFirestore().doc("branches/branch-a/inventoryFinancials/product-1").get();
    const refunds = await getFirestore().collection("financialTransactions").where("reversalId", "==", request.reversalId).get();
    const audit = await getFirestore().collection("auditLogs").where("entityId", "==", request.reversalId).get();

    expect(order.data()?.status).toBe("partially_reversed");
    expect(inventory.data()?.onHandQty).toBe(19);
    expect(inventory.data()?.returnedQty).toBe(1);
    expect(inventory.data()?.reversedSoldQty).toBe(1);
    expect(financial.data()?.stockValueKobo).toBe(760_000);
    expect(refunds.docs.some((doc) => doc.data().transactionType === "sale_refund")).toBe(true);
    expect(JSON.stringify(audit.docs.map((doc) => doc.data()))).not.toContain("qrToken");
  });

  it("completes a full reversal without stock return without creating stock or value", async () => {
    const orderId = await completedCashOrder(1, "no-stock");
    const request = await createReversalRequestAction("manager-a", {
      orderId,
      reversalType: "full_reversal_without_stock_return",
      reason: "Refunded but goods not returned",
      refundAmountKobo: 100_000,
      idempotencyKey: "idem-no-stock-request",
    }) as { reversalId: string };
    await approveReversalRequestAction("admin", { reversalId: request.reversalId, idempotencyKey: "idem-no-stock-approve" });
    await completeApprovedReversalAction("admin", { reversalId: request.reversalId, idempotencyKey: "idem-no-stock-complete" });
    const order = await getFirestore().doc(`orders/${orderId}`).get();
    const inventory = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    const movements = await getFirestore().collection("stockMovements").where("reversalId", "==", request.reversalId).get();
    expect(order.data()?.status).toBe("reversed");
    expect(inventory.data()?.onHandQty).toBe(19);
    expect(inventory.data()?.returnedQty).toBe(0);
    expect(movements.docs[0].data().movementType).toBe("sale_reversed_no_stock_return");
  });

  it("reduces customer outstanding balance for credit corrections atomically", async () => {
    const orderId = await completedCreditOrder(2);
    const request = await createReversalRequestAction("admin", {
      orderId,
      reversalType: "credit_correction",
      reason: "Credit memo for customer",
      creditReductionKobo: 50_000,
      idempotencyKey: "idem-credit-correction-request",
    }) as { reversalId: string };
    await approveReversalRequestAction("admin", { reversalId: request.reversalId, approvalNote: "Self approved by admin", idempotencyKey: "idem-credit-correction-approve" });
    await completeApprovedReversalAction("admin", { reversalId: request.reversalId, idempotencyKey: "idem-credit-correction-complete" });
    const customer = await getFirestore().doc("customers/customer-a").get();
    const txns = await getFirestore().collection("financialTransactions").where("reversalId", "==", request.reversalId).get();
    const order = await getFirestore().doc(`orders/${orderId}`).get();
    expect(customer.data()?.outstandingBalanceKobo).toBe(150_000);
    expect(order.data()?.status).toBe("completed");
    expect(txns.docs.some((doc) => doc.data().transactionType === "credit_reduction")).toBe(true);
  });

  it("preserves original order payments and blocks duplicate quantity after completion", async () => {
    const orderId = await completedCashOrder(1, "preserve");
    const request = await createReversalRequestAction("manager-a", {
      orderId,
      reversalType: "full_reversal_with_stock_return",
      reason: "Full return",
      refundAmountKobo: 100_000,
      idempotencyKey: "idem-preserve-request",
    }) as { reversalId: string };
    await approveReversalRequestAction("admin", { reversalId: request.reversalId, idempotencyKey: "idem-preserve-approve" });
    await completeApprovedReversalAction("admin", { reversalId: request.reversalId, idempotencyKey: "idem-preserve-complete" });

    const order = await getFirestore().doc(`orders/${orderId}`).get();
    const payments = await getFirestore().collection(`orders/${orderId}/payments`).get();
    expect(order.exists).toBe(true);
    expect(order.data()?.items[0].quantity).toBe(1);
    expect(payments.size).toBe(1);
    await expect(createReversalRequestAction("manager-a", {
      orderId,
      reversalType: "full_reversal_with_stock_return",
      reason: "Duplicate full return",
      refundAmountKobo: 100_000,
      idempotencyKey: "idem-preserve-duplicate-request",
    })).rejects.toMatchObject({ code: "failed-precondition" });
  });
});
