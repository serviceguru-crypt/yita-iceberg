import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  administerSaleAction,
  approveDiscountAction,
  cancelOrderAction,
  confirmPaymentAction,
  createPaymentProofUploadIntentAction,
  createOrderAction,
  expireStaleOrdersAction,
  reissueOrderQrTokenAction,
  updateUnpaidOrderAction,
  validateReleaseQrAction,
  verifyAndCompleteReleaseAction,
} from "../src/orders/service";
import { adminStorageBucket } from "../src/shared/firebase";

function init() {
  if (getApps().length === 0) {
    initializeApp({ projectId: "yita-iceberg" });
  }
}

async function clearFirestore() {
  const db = getFirestore();
  const collections = await db.listCollections();
  await Promise.all(collections.map((collection) => db.recursiveDelete(collection)));
}

async function clearAuthUsers() {
  const auth = getAuth();
  const users = await auth.listUsers(1000);
  await Promise.all(users.users.map((user) => auth.deleteUser(user.uid)));
}

async function seedUser({
  uid,
  role,
  branchIds = [],
  isActive = true,
}: {
  uid: string;
  role: string;
  branchIds?: string[];
  isActive?: boolean;
}) {
  await getAuth().createUser({
    uid,
    email: `${uid}@example.test`,
    displayName: uid,
    password: "ChangeMe123!",
  });
  await getAuth().setCustomUserClaims(uid, { platformRole: role, isActive });
  await getFirestore().doc(`users/${uid}`).set({
    displayName: uid,
    email: `${uid}@example.test`,
    phone: null,
    isActive,
    platformRole: role,
    assignedBranchIds: branchIds,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: "test",
    updatedBy: "test",
  });
}

async function seedBaseData(options: { stock?: number; settings?: Record<string, unknown> } = {}) {
  const db = getFirestore();
  const stock = options.stock ?? 20;

  await Promise.all([
    db.doc("branches/branch-a").set({
      name: "Branch A",
      code: "A",
      isActive: true,
      settings: {
        orderExpiryMinutes: 60,
        registrarMaximumDiscountPercent: 10,
        managerApprovalThresholdPercent: 25,
        requireDiscountReason: true,
        requireTransferProof: false,
        allowCreditSales: true,
        allowSplitPayments: true,
        ...(options.settings ?? {}),
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.doc("branches/branch-b").set({
      name: "Branch B",
      code: "B",
      isActive: true,
      settings: {
        orderExpiryMinutes: 60,
        registrarMaximumDiscountPercent: 10,
        requireDiscountReason: false,
        requireTransferProof: false,
        allowCreditSales: false,
        allowSplitPayments: true,
      },
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
    db.doc("branches/branch-a/products/product-2").set({
      productId: "product-2",
      sku: "SKU-2",
      name: "Dry Ice",
      unit: "kg",
      sellingPriceKobo: 200_000,
      minimumPriceKobo: 100_000,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.doc("branches/branch-b/products/product-1").set({
      productId: "product-1",
      sku: "SKU-1B",
      name: "Branch B Ice",
      unit: "bag",
      sellingPriceKobo: 100_000,
      minimumPriceKobo: 50_000,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.doc("branches/branch-a/inventory/product-1").set({
      productId: "product-1",
      onHandQty: stock,
      reservedQty: 0,
      soldQty: 0,
      damagedQty: 0,
      returnedQty: 0,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "seed",
    }),
    db.doc("branches/branch-a/inventory/product-2").set({
      productId: "product-2",
      onHandQty: stock,
      reservedQty: 0,
      soldQty: 0,
      damagedQty: 0,
      returnedQty: 0,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "seed",
    }),
    db.doc("branches/branch-b/inventory/product-1").set({
      productId: "product-1",
      onHandQty: stock,
      reservedQty: 0,
      soldQty: 0,
      damagedQty: 0,
      returnedQty: 0,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "seed",
    }),
    db.doc("customers/customer-a").set({
      name: "Customer A",
      phone: "08000000000",
      address: "A Street",
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

  await seedUser({ uid: "registrar-a", role: "order_registrar", branchIds: ["branch-a"] });
  await seedUser({ uid: "registrar-b", role: "order_registrar", branchIds: ["branch-b"] });
  await seedUser({ uid: "cashier-a", role: "cashier", branchIds: ["branch-a"] });
  await seedUser({ uid: "release-a", role: "release_verifier", branchIds: ["branch-a"] });
  await seedUser({ uid: "manager-a", role: "branch_manager", branchIds: ["branch-a"] });
  await seedUser({ uid: "admin", role: "admin" });
  await seedUser({ uid: "inactive", role: "order_registrar", branchIds: ["branch-a"], isActive: false });
}

function orderInput(idempotencyKey = "idem-create-1", quantity = 2) {
  return {
    branchId: "branch-a",
    customerType: "walk_in",
    items: [
      {
        productId: "product-1",
        quantity,
        discountPercent: 0,
      },
    ],
    idempotencyKey,
  };
}

async function uploadPaymentProof(intent: {
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  requiredMetadata: Record<string, string>;
}) {
  await adminStorageBucket()
    .file(intent.storagePath)
    .save(Buffer.alloc(intent.sizeBytes, "p"), {
      metadata: {
        contentType: intent.contentType,
        metadata: intent.requiredMetadata,
      },
    });
}

beforeAll(() => {
  init();
});

beforeEach(async () => {
  await clearAuthUsers();
  await clearFirestore();
  await seedBaseData();
});

describe("order reservation workflow", () => {
  it("creates a valid branch order and reserves stock", async () => {
    const result = await createOrderAction("registrar-a", orderInput());
    const db = getFirestore();
    const order = await db.doc(`orders/${result.orderId}`).get();
    const inventory = await db.doc("branches/branch-a/inventory/product-1").get();

    expect(order.data()?.status).toBe("awaiting_payment");
    expect(order.data()?.grandTotalKobo).toBe(200_000);
    expect(order.data()?.items[0].originalUnitPriceKobo).toBe(100_000);
    expect(inventory.data()?.reservedQty).toBe(2);
    expect(result.qrToken).toBeTruthy();
    expect(order.data()?.qrTokenHash).not.toBe(result.qrToken);
  });

  it("rejects insufficient stock and concurrent over-reservation", async () => {
    await clearAuthUsers();
    await clearFirestore();
    await seedBaseData({ stock: 5 });

    await expect(createOrderAction("registrar-a", orderInput("idem-big-stock", 6))).rejects.toMatchObject({
      code: "failed-precondition",
    });

    const results = await Promise.allSettled([
      createOrderAction("registrar-a", orderInput("idem-concurrent-1", 3)),
      createOrderAction("registrar-a", orderInput("idem-concurrent-2", 3)),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const inventory = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    expect(inventory.data()?.reservedQty).toBe(3);
  });

  it("ignores tampered client price and enforces branch and active-user access", async () => {
    const result = await createOrderAction("registrar-a", {
      ...orderInput("idem-tamper-1"),
      items: [{ productId: "product-1", quantity: 1, discountPercent: 0, sellingPriceKobo: 1 }],
    });
    const order = await getFirestore().doc(`orders/${result.orderId}`).get();
    expect(order.data()?.grandTotalKobo).toBe(100_000);

    await expect(
      createOrderAction("registrar-b", orderInput("idem-cross-branch")),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      createOrderAction("inactive", orderInput("idem-inactive")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("does not reserve stock for large pending discounts and reserves after approval", async () => {
    const result = await createOrderAction("registrar-a", {
      ...orderInput("idem-discount-pending"),
      items: [
        {
          productId: "product-1",
          quantity: 2,
          discountPercent: 20,
          discountReason: "Manager promo",
        },
      ],
    });
    let inventory = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    expect(result.status).toBe("awaiting_discount_approval");
    expect(inventory.data()?.reservedQty).toBe(0);

    await approveDiscountAction("manager-a", {
      orderId: result.orderId,
      decision: "approved",
      idempotencyKey: "idem-approve-discount",
    });
    inventory = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    const order = await getFirestore().doc(`orders/${result.orderId}`).get();
    expect(inventory.data()?.reservedQty).toBe(2);
    expect(order.data()?.status).toBe("awaiting_payment");
  });

  it("edits unpaid order reservations up and down, and blocks another registrar", async () => {
    const result = await createOrderAction("registrar-a", orderInput("idem-edit-create", 2));
    await updateUnpaidOrderAction("registrar-a", {
      orderId: result.orderId,
      items: [{ productId: "product-1", quantity: 4, discountPercent: 0 }],
      idempotencyKey: "idem-edit-up",
    });
    let inventory = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    expect(inventory.data()?.reservedQty).toBe(4);

    await updateUnpaidOrderAction("registrar-a", {
      orderId: result.orderId,
      items: [{ productId: "product-1", quantity: 1, discountPercent: 0 }],
      idempotencyKey: "idem-edit-down",
    });
    inventory = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    expect(inventory.data()?.reservedQty).toBe(1);

    await expect(
      updateUnpaidOrderAction("registrar-b", {
        orderId: result.orderId,
        items: [{ productId: "product-1", quantity: 2, discountPercent: 0 }],
        idempotencyKey: "idem-edit-other",
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks edits after payment and releases stock when unpaid order is cancelled", async () => {
    const result = await createOrderAction("registrar-a", orderInput("idem-cancel-create", 2));
    await confirmPaymentAction("cashier-a", {
      orderId: result.orderId,
      paymentLines: [{ paymentMethod: "cash", amountKobo: 200_000 }],
      idempotencyKey: "idem-cancel-pay",
    });
    await expect(
      updateUnpaidOrderAction("registrar-a", {
        orderId: result.orderId,
        items: [{ productId: "product-1", quantity: 3, discountPercent: 0 }],
        idempotencyKey: "idem-edit-paid",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(
      cancelOrderAction("registrar-a", {
        orderId: result.orderId,
        reason: "No longer needed",
        idempotencyKey: "idem-cancel-paid",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });

    const unpaid = await createOrderAction("registrar-a", orderInput("idem-cancel-unpaid", 2));
    await cancelOrderAction("registrar-a", {
      orderId: unpaid.orderId,
      reason: "Customer left",
      idempotencyKey: "idem-cancel-unpaid-ok",
    });
    const inventory = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    expect(inventory.data()?.reservedQty).toBe(2);
    const cancelled = await getFirestore().doc(`orders/${unpaid.orderId}`).get();
    expect(cancelled.data()?.status).toBe("cancelled");
  });

  it("expires stale unpaid orders but not awaiting-release orders", async () => {
    const stale = await createOrderAction("registrar-a", orderInput("idem-expire-stale", 2));
    const paid = await createOrderAction("registrar-a", orderInput("idem-expire-paid", 1));
    await confirmPaymentAction("cashier-a", {
      orderId: paid.orderId,
      paymentLines: [{ paymentMethod: "cash", amountKobo: 100_000 }],
      idempotencyKey: "idem-expire-paid-payment",
    });
    await getFirestore().doc(`orders/${stale.orderId}`).update({
      expiresAt: Timestamp.fromMillis(Date.now() - 60_000),
    });
    await getFirestore().doc(`orders/${paid.orderId}`).update({
      expiresAt: Timestamp.fromMillis(Date.now() - 60_000),
    });

    const expired = await expireStaleOrdersAction();
    const staleOrder = await getFirestore().doc(`orders/${stale.orderId}`).get();
    const paidOrder = await getFirestore().doc(`orders/${paid.orderId}`).get();

    expect(expired.expiredCount).toBe(1);
    expect(staleOrder.data()?.status).toBe("expired");
    expect(paidOrder.data()?.status).toBe("awaiting_release");
  });
});

describe("administrator direct-sale workflow", () => {
  it("completes an audited sale atomically while preserving existing reservations", async () => {
    await createOrderAction("registrar-a", orderInput("idem-existing-reservation", 3));
    await getFirestore().doc("branches/branch-a/inventoryFinancials/product-1").set({
      productId: "product-1",
      averageUnitCostKobo: 40_000,
      stockValueKobo: 800_000,
    });

    const input = {
      branchId: "branch-a",
      customerType: "walk_in",
      customerSnapshot: { name: "Direct customer", phone: "08012345678" },
      items: [{
        productId: "product-1",
        quantity: 2,
        discountPercent: 20,
        discountReason: "Owner-authorized loyalty price",
      }],
      paymentLines: [
        { paymentMethod: "cash", amountKobo: 60_000 },
        { paymentMethod: "pos_terminal", amountKobo: 100_000, reference: "POS-123" },
      ],
      administrationReason: "Owner handled customer sale directly",
      idempotencyKey: "idem-admin-direct-sale",
    };

    const result = await administerSaleAction("admin", input);
    const repeated = await administerSaleAction("admin", input);
    const db = getFirestore();
    const [order, inventory, financial, payments, transactions, movements, audits] =
      await Promise.all([
        db.doc(`orders/${result.orderId}`).get(),
        db.doc("branches/branch-a/inventory/product-1").get(),
        db.doc("branches/branch-a/inventoryFinancials/product-1").get(),
        db.collection(`orders/${result.orderId}/payments`).get(),
        db.collection("financialTransactions").where("orderId", "==", result.orderId).get(),
        db.collection("stockMovements").where("orderId", "==", result.orderId).get(),
        db.collection("auditLogs").where("entityId", "==", result.orderId).get(),
      ]);

    expect(repeated.orderId).toBe(result.orderId);
    expect(order.data()).toMatchObject({
      status: "completed",
      paymentStatus: "paid",
      administeredSale: true,
      administeredBy: "admin",
      discountApprovalStatus: "approved",
      grandTotalKobo: 160_000,
    });
    expect(inventory.data()).toMatchObject({ onHandQty: 18, reservedQty: 3, soldQty: 2 });
    expect(financial.data()?.stockValueKobo).toBe(720_000);
    expect(payments.size).toBe(2);
    expect(transactions.size).toBe(2);
    expect(movements.size).toBe(1);
    expect(movements.docs[0].data()?.reason).toBe("admin_direct_sale");
    expect(audits.docs.some((entry) => entry.data().action === "sale.administered")).toBe(true);
  });

  it("restricts direct sales to administrators and validates totals and stock", async () => {
    const base = {
      ...orderInput("idem-direct-denied", 1),
      paymentLines: [{ paymentMethod: "cash", amountKobo: 100_000 }],
      administrationReason: "Direct owner-assisted sale",
    };
    await expect(administerSaleAction("manager-a", base)).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(administerSaleAction("admin", {
      ...base,
      idempotencyKey: "idem-direct-total",
      paymentLines: [{ paymentMethod: "cash", amountKobo: 99_999 }],
    })).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(administerSaleAction("admin", {
      ...base,
      idempotencyKey: "idem-direct-stock",
      items: [{ productId: "product-1", quantity: 21, discountPercent: 0 }],
      paymentLines: [{ paymentMethod: "cash", amountKobo: 2_100_000 }],
    })).rejects.toMatchObject({ code: "failed-precondition" });
  });
});

describe("payment workflow", () => {
  it("confirms valid mixed payment and is idempotent", async () => {
    const result = await createOrderAction("registrar-a", orderInput("idem-payment-create", 3));
    const input = {
      orderId: result.orderId,
      paymentLines: [
        { paymentMethod: "cash", amountKobo: 100_000 },
        { paymentMethod: "pos_terminal", amountKobo: 200_000, reference: "POS-1" },
      ],
      idempotencyKey: "idem-payment-ok",
    };
    await confirmPaymentAction("cashier-a", input);
    await confirmPaymentAction("cashier-a", input);

    const order = await getFirestore().doc(`orders/${result.orderId}`).get();
    const payments = await getFirestore().collection(`orders/${result.orderId}/payments`).get();
    const financials = await getFirestore()
      .collection("financialTransactions")
      .where("orderId", "==", result.orderId)
      .get();

    expect(order.data()?.status).toBe("awaiting_release");
    expect(order.data()?.paymentStatus).toBe("paid");
    expect(payments.size).toBe(2);
    expect(financials.size).toBe(2);
  });

  it("rejects unauthorized payment, total mismatch, and invalid order states", async () => {
    const result = await createOrderAction("registrar-a", orderInput("idem-payment-reject", 1));
    await expect(
      confirmPaymentAction("registrar-a", {
        orderId: result.orderId,
        paymentLines: [{ paymentMethod: "cash", amountKobo: 100_000 }],
        idempotencyKey: "idem-payment-role",
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      confirmPaymentAction("cashier-a", {
        orderId: result.orderId,
        paymentLines: [{ paymentMethod: "cash", amountKobo: 99_999 }],
        idempotencyKey: "idem-payment-mismatch",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await cancelOrderAction("registrar-a", {
      orderId: result.orderId,
      reason: "Cancelled",
      idempotencyKey: "idem-payment-cancel",
    });
    await expect(
      confirmPaymentAction("cashier-a", {
        orderId: result.orderId,
        paymentLines: [{ paymentMethod: "cash", amountKobo: 100_000 }],
        idempotencyKey: "idem-payment-cancelled",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("enforces transfer proof and credit rules", async () => {
    await clearAuthUsers();
    await clearFirestore();
    await seedBaseData({ settings: { requireTransferProof: true, allowCreditSales: true } });
    const transfer = await createOrderAction("registrar-a", orderInput("idem-proof-create", 1));
    await expect(
      confirmPaymentAction("cashier-a", {
        orderId: transfer.orderId,
        paymentLines: [{ paymentMethod: "bank_transfer", amountKobo: 100_000 }],
        idempotencyKey: "idem-proof-missing",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    const intent = await createPaymentProofUploadIntentAction("cashier-a", {
      orderId: transfer.orderId,
      fileName: "proof.pdf",
      contentType: "application/pdf",
      sizeBytes: 12,
      idempotencyKey: "idem-proof-intent",
    }) as {
      proofUploadIntentId: string;
      storagePath: string;
      contentType: string;
      sizeBytes: number;
      requiredMetadata: Record<string, string>;
    };
    await uploadPaymentProof(intent);
    await confirmPaymentAction("cashier-a", {
      orderId: transfer.orderId,
      paymentLines: [
        {
          paymentMethod: "bank_transfer",
          amountKobo: 100_000,
          proofUploadIntentId: intent.proofUploadIntentId,
          proofStoragePath: intent.storagePath,
        },
      ],
      idempotencyKey: "idem-proof-ok",
    });

    const credit = await createOrderAction("registrar-a", {
      branchId: "branch-a",
      customerType: "registered",
      customerId: "customer-a",
      items: [{ productId: "product-1", quantity: 2, discountPercent: 0 }],
      idempotencyKey: "idem-credit-create",
    });
    await confirmPaymentAction("cashier-a", {
      orderId: credit.orderId,
      paymentLines: [{ paymentMethod: "credit", amountKobo: 200_000 }],
      idempotencyKey: "idem-credit-pay",
    });
    const customer = await getFirestore().doc("customers/customer-a").get();
    expect(customer.data()?.outstandingBalanceKobo).toBe(200_000);
  });
});

describe("release workflow and idempotency", () => {
  it("rejects release before payment, then completes paid order once", async () => {
    const result = await createOrderAction("registrar-a", orderInput("idem-release-create", 2));
    await expect(
      verifyAndCompleteReleaseAction("release-a", {
        orderId: result.orderId,
        verificationMethod: "qr",
        qrToken: result.qrToken,
        idempotencyKey: "idem-release-before-payment",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });

    await confirmPaymentAction("cashier-a", {
      orderId: result.orderId,
      paymentLines: [{ paymentMethod: "cash", amountKobo: 200_000 }],
      idempotencyKey: "idem-release-payment",
    });
    await verifyAndCompleteReleaseAction("release-a", {
      orderId: result.orderId,
      verificationMethod: "qr",
      qrToken: result.qrToken,
      idempotencyKey: "idem-release-ok",
    });
    await verifyAndCompleteReleaseAction("release-a", {
      orderId: result.orderId,
      verificationMethod: "qr",
      qrToken: result.qrToken,
      idempotencyKey: "idem-release-ok",
    });

    const inventory = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    const order = await getFirestore().doc(`orders/${result.orderId}`).get();
    const stockOuts = await getFirestore()
      .collection("stockMovements")
      .where("orderId", "==", result.orderId)
      .where("movementType", "==", "stock_out")
      .get();

    expect(order.data()?.status).toBe("completed");
    expect(inventory.data()?.onHandQty).toBe(18);
    expect(inventory.data()?.reservedQty).toBe(0);
    expect(inventory.data()?.soldQty).toBe(2);
    expect(stockOuts.size).toBe(1);
  });

  it("rejects QR mismatch, manual release without reason, cross-branch release, and broken reservation", async () => {
    const result = await createOrderAction("registrar-a", orderInput("idem-release-rejects", 1));
    await confirmPaymentAction("cashier-a", {
      orderId: result.orderId,
      paymentLines: [{ paymentMethod: "cash", amountKobo: 100_000 }],
      idempotencyKey: "idem-release-reject-payment",
    });
    await expect(
      verifyAndCompleteReleaseAction("release-a", {
        orderId: result.orderId,
        verificationMethod: "qr",
        qrToken: "wrong-token",
        idempotencyKey: "idem-release-bad-qr",
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      verifyAndCompleteReleaseAction("release-a", {
        orderId: result.orderId,
        verificationMethod: "manual",
        idempotencyKey: "idem-release-no-reason",
      }),
    ).rejects.toBeTruthy();
    await expect(
      verifyAndCompleteReleaseAction("registrar-b", {
        orderId: result.orderId,
        verificationMethod: "manual",
        manualReason: "Manager checked receipt",
        idempotencyKey: "idem-release-cross",
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });

    await getFirestore().doc("branches/branch-a/inventory/product-1").update({ reservedQty: 0 });
    await expect(
      verifyAndCompleteReleaseAction("release-a", {
        orderId: result.orderId,
        verificationMethod: "manual",
        manualReason: "Receipt checked",
        idempotencyKey: "idem-release-broken-inventory",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("creates audit records without raw QR tokens", async () => {
    const result = await createOrderAction("registrar-a", orderInput("idem-audit-create", 1));
    const auditLogs = await getFirestore()
      .collection("auditLogs")
      .where("entityId", "==", result.orderId)
      .get();

    expect(auditLogs.size).toBeGreaterThan(0);
    expect(JSON.stringify(auditLogs.docs.map((doc) => doc.data()))).not.toContain(result.qrToken);
  });

  it("reissues unpaid QR tokens and validates release QR without mutating stock", async () => {
    const result = await createOrderAction("registrar-a", orderInput("idem-qr-reissue-create", 1));
    const reissued = await reissueOrderQrTokenAction("registrar-a", {
      orderId: result.orderId,
      idempotencyKey: "idem-qr-reissue",
    });

    expect(reissued.qrToken).toBeTruthy();
    expect(reissued.qrToken).not.toBe(result.qrToken);
    await expect(
      verifyAndCompleteReleaseAction("release-a", {
        orderId: result.orderId,
        verificationMethod: "qr",
        qrToken: result.qrToken,
        idempotencyKey: "idem-old-qr",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });

    await confirmPaymentAction("cashier-a", {
      orderId: result.orderId,
      paymentLines: [{ paymentMethod: "cash", amountKobo: 100_000 }],
      idempotencyKey: "idem-qr-release-payment",
    });
    const before = await getFirestore().doc("branches/branch-a/inventory/product-1").get();
    const preview = await validateReleaseQrAction("release-a", {
      orderNumber: reissued.orderNumber,
      qrToken: reissued.qrToken,
    }) as unknown as { orderId: string; status: string };
    const after = await getFirestore().doc("branches/branch-a/inventory/product-1").get();

    expect(preview.orderId).toBe(result.orderId);
    expect(preview.status).toBe("awaiting_release");
    expect(after.data()?.onHandQty).toBe(before.data()?.onHandQty);
    expect(after.data()?.reservedQty).toBe(before.data()?.reservedQty);
    await expect(
      validateReleaseQrAction("release-a", {
        orderNumber: reissued.orderNumber,
        qrToken: "wrong",
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
