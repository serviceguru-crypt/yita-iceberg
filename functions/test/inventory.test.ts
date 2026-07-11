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
  addBranchProductAction,
  approveInventoryAdjustmentAction,
  approveStockCountAction,
  createProductAction,
  recordStockReceiptAction,
  rejectInventoryAdjustmentAction,
  requestInventoryAdjustmentAction,
  startStockCountAction,
  submitStockCountAction,
  updateBranchProductPricingAction,
  updateBranchProductSettingsAction,
} from "../src/inventory/service";

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
    phone: null,
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
  await getFirestore().doc("branches/branch-a").set({
    name: "Branch A",
    code: "A",
    isActive: true,
    settings: {
      orderExpiryMinutes: 60,
      registrarMaximumDiscountPercent: 10,
      requireDiscountReason: false,
      requireTransferProof: false,
      allowCreditSales: true,
      allowSplitPayments: true,
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await seedUser("admin", "admin");
  await seedUser("manager-a", "branch_manager", ["branch-a"]);
  await seedUser("registrar-a", "order_registrar", ["branch-a"]);
  await seedUser("cashier-a", "cashier", ["branch-a"]);
  await seedUser("release-a", "release_verifier", ["branch-a"]);
}

async function createBranchProduct({
  sku = "SKU-INV-1",
  sellingPriceKobo = 100_000,
  minimumPriceKobo = 50_000,
  defaultCostPriceKobo = 40_000,
  reorderLevel = 5,
} = {}) {
  const product = await createProductAction("admin", {
    sku,
    name: `Product ${sku}`,
    unit: "bag",
    barcode: `${sku}-BAR`,
    idempotencyKey: `idem-product-${sku}`,
  }) as { productId: string };
  await addBranchProductAction("admin", {
    branchId: "branch-a",
    productId: product.productId,
    sellingPriceKobo,
    minimumPriceKobo,
    defaultCostPriceKobo,
    reorderLevel,
    idempotencyKey: `idem-branch-product-${sku}`,
  });
  return product.productId;
}

beforeAll(() => init());

beforeEach(async () => {
  await clearAuthUsers();
  await clearFirestore();
  await seedBase();
});

describe("inventory product and branch setup", () => {
  it("restricts product creation and enforces unique SKU and barcode", async () => {
    await expect(
      createProductAction("registrar-a", {
        sku: "SKU-A",
        name: "A",
        unit: "bag",
        idempotencyKey: "idem-product-denied",
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });

    await createProductAction("admin", {
      sku: "SKU-A",
      name: "A",
      unit: "bag",
      barcode: "BAR-A",
      idempotencyKey: "idem-product-a",
    });
    await expect(
      createProductAction("admin", {
        sku: "SKU-A",
        name: "B",
        unit: "bag",
        idempotencyKey: "idem-product-dup-sku",
      }),
    ).rejects.toMatchObject({ code: "already-exists" });
    await expect(
      createProductAction("admin", {
        sku: "SKU-B",
        name: "B",
        unit: "bag",
        barcode: "BAR-A",
        idempotencyKey: "idem-product-dup-bar",
      }),
    ).rejects.toMatchObject({ code: "already-exists" });
  });

  it("auto-generates SKU when product creation omits one", async () => {
    const first = await createProductAction("admin", {
      name: "Auto A",
      unit: "piece",
      idempotencyKey: "idem-product-auto-a",
    }) as { productId: string; qrCodePayload: string; sku: string };
    const second = await createProductAction("admin", {
      name: "Auto B",
      unit: "piece",
      idempotencyKey: "idem-product-auto-b",
    }) as { productId: string; qrCodePayload: string; sku: string };

    expect(first.sku).toBe("YI-000001");
    expect(first.qrCodePayload).toBe(`YITA-PRODUCT|${first.productId}|YI-000001`);
    expect(second.sku).toBe("YI-000002");

    const db = getFirestore();
    const firstProduct = await db.doc(`products/${first.productId}`).get();
    const firstUniqueSku = await db.doc("productUniqueSkus/yi-000001").get();

    expect(firstProduct.data()?.sku).toBe("YI-000001");
    expect(firstProduct.data()?.qrCodePayload).toBe(first.qrCodePayload);
    expect(firstUniqueSku.data()?.productId).toBe(first.productId);
  });

  it("adds a branch product with zero stock and protected controls", async () => {
    const productId = await createBranchProduct();
    const db = getFirestore();
    const inventory = await db.doc(`branches/branch-a/inventory/${productId}`).get();
    const controls = await db.doc(`branches/branch-a/productControls/${productId}`).get();
    const financials = await db.doc(`branches/branch-a/inventoryFinancials/${productId}`).get();

    expect(inventory.data()?.onHandQty).toBe(0);
    expect(inventory.data()?.isLowStock).toBe(true);
    expect(controls.data()?.minimumPriceKobo).toBe(50_000);
    expect(financials.data()?.stockValueKobo).toBe(0);
  });
});

describe("stock receipts and valuation", () => {
  it("posts stock receipt, keeps reserved stock unchanged, and is idempotent", async () => {
    const productId = await createBranchProduct();
    const input = {
      branchId: "branch-a",
      supplierName: "Supplier",
      items: [{ productId, quantity: 10, unitCostKobo: 40_000 }],
      idempotencyKey: "idem-receipt-1",
    };
    const receipt = await recordStockReceiptAction("manager-a", input);
    await recordStockReceiptAction("manager-a", input);
    const inventory = await getFirestore().doc(`branches/branch-a/inventory/${productId}`).get();
    const financial = await getFirestore().doc(`branches/branch-a/inventoryFinancials/${productId}`).get();
    const movements = await getFirestore().collection("stockMovements").where("stockReceiptId", "==", receipt.receiptId).get();

    expect(inventory.data()?.onHandQty).toBe(10);
    expect(inventory.data()?.reservedQty).toBe(0);
    expect(inventory.data()?.isLowStock).toBe(false);
    expect(financial.data()?.averageUnitCostKobo).toBe(40_000);
    expect(financial.data()?.stockValueKobo).toBe(400_000);
    expect(movements.size).toBe(1);
  });

  it("rejects receipt for inactive branch product", async () => {
    const productId = await createBranchProduct();
    await updateBranchProductSettingsAction("manager-a", {
      branchId: "branch-a",
      productId,
      isActive: false,
      idempotencyKey: "idem-inactivate-product",
    });
    await expect(
      recordStockReceiptAction("manager-a", {
        branchId: "branch-a",
        items: [{ productId, quantity: 1, unitCostKobo: 40_000 }],
        idempotencyKey: "idem-receipt-inactive",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });
});

describe("inventory adjustments", () => {
  it("requests without mutating, blocks self approval, and rejects without stock change", async () => {
    const productId = await createBranchProduct();
    await recordStockReceiptAction("manager-a", {
      branchId: "branch-a",
      items: [{ productId, quantity: 10, unitCostKobo: 50_000 }],
      idempotencyKey: "idem-adjust-receipt",
    });
    const request = await requestInventoryAdjustmentAction("admin", {
      branchId: "branch-a",
      productId,
      adjustmentType: "decrease",
      quantity: 2,
      reason: "Count mismatch",
      idempotencyKey: "idem-adjust-request",
    }) as { requestId: string };
    await expect(
      approveInventoryAdjustmentAction("admin", {
        requestId: request.requestId,
        idempotencyKey: "idem-adjust-self",
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await rejectInventoryAdjustmentAction("admin", {
      requestId: request.requestId,
      reason: "Needs recount",
      idempotencyKey: "idem-adjust-reject",
    });
    const inventory = await getFirestore().doc(`branches/branch-a/inventory/${productId}`).get();
    expect(inventory.data()?.onHandQty).toBe(10);
  });

  it("approves damage write-off and prevents decreases below reserved stock", async () => {
    const productId = await createBranchProduct();
    await recordStockReceiptAction("manager-a", {
      branchId: "branch-a",
      items: [{ productId, quantity: 10, unitCostKobo: 50_000 }],
      idempotencyKey: "idem-damage-receipt",
    });
    const damage = await requestInventoryAdjustmentAction("manager-a", {
      branchId: "branch-a",
      productId,
      adjustmentType: "damage_write_off",
      quantity: 3,
      reason: "Damaged during loading",
      idempotencyKey: "idem-damage-request",
    }) as { requestId: string };
    await approveInventoryAdjustmentAction("admin", {
      requestId: damage.requestId,
      idempotencyKey: "idem-damage-approve",
    });
    let inventory = await getFirestore().doc(`branches/branch-a/inventory/${productId}`).get();
    const financial = await getFirestore().doc(`branches/branch-a/inventoryFinancials/${productId}`).get();
    expect(inventory.data()?.onHandQty).toBe(7);
    expect(inventory.data()?.damagedQty).toBe(3);
    expect(financial.data()?.stockValueKobo).toBe(350_000);

    await getFirestore().doc(`branches/branch-a/inventory/${productId}`).update({ reservedQty: 6 });
    const decrease = await requestInventoryAdjustmentAction("manager-a", {
      branchId: "branch-a",
      productId,
      adjustmentType: "decrease",
      quantity: 2,
      reason: "Loss check",
      idempotencyKey: "idem-decrease-request",
    }) as { requestId: string };
    await expect(
      approveInventoryAdjustmentAction("admin", {
        requestId: decrease.requestId,
        idempotencyKey: "idem-decrease-approve",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    inventory = await getFirestore().doc(`branches/branch-a/inventory/${productId}`).get();
    expect(inventory.data()?.onHandQty).toBe(7);
  });
});

describe("stock counts and sales valuation", () => {
  it("rejects stale stock count approval and reconciles a fresh count", async () => {
    const productId = await createBranchProduct();
    await recordStockReceiptAction("manager-a", {
      branchId: "branch-a",
      items: [{ productId, quantity: 10, unitCostKobo: 30_000 }],
      idempotencyKey: "idem-count-receipt",
    });
    const stale = await startStockCountAction("manager-a", {
      branchId: "branch-a",
      productIds: [productId],
      idempotencyKey: "idem-count-stale-start",
    }) as { stockCountId: string };
    await submitStockCountAction("manager-a", {
      stockCountId: stale.stockCountId,
      items: [{ productId, countedQty: 9 }],
      idempotencyKey: "idem-count-stale-submit",
    });
    await getFirestore().doc(`branches/branch-a/inventory/${productId}`).update({ onHandQty: 11 });
    await expect(
      approveStockCountAction("admin", {
        stockCountId: stale.stockCountId,
        idempotencyKey: "idem-count-stale-approve",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });

    await getFirestore().doc(`branches/branch-a/inventory/${productId}`).update({ onHandQty: 10 });
    const fresh = await startStockCountAction("manager-a", {
      branchId: "branch-a",
      productIds: [productId],
      idempotencyKey: "idem-count-start",
    }) as { stockCountId: string };
    await submitStockCountAction("manager-a", {
      stockCountId: fresh.stockCountId,
      items: [{ productId, countedQty: 12 }],
      idempotencyKey: "idem-count-submit",
    });
    await approveStockCountAction("admin", {
      stockCountId: fresh.stockCountId,
      idempotencyKey: "idem-count-approve",
    });
    const inventory = await getFirestore().doc(`branches/branch-a/inventory/${productId}`).get();
    const financial = await getFirestore().doc(`branches/branch-a/inventoryFinancials/${productId}`).get();
    expect(inventory.data()?.onHandQty).toBe(12);
    expect(financial.data()?.stockValueKobo).toBe(360_000);
  });

  it("sale completion updates inventory valuation and preserves historical order prices", async () => {
    const productId = await createBranchProduct({ sellingPriceKobo: 100_000, minimumPriceKobo: 50_000 });
    await recordStockReceiptAction("manager-a", {
      branchId: "branch-a",
      items: [{ productId, quantity: 10, unitCostKobo: 40_000 }],
      idempotencyKey: "idem-sale-valuation-receipt",
    });
    const order = await createOrderAction("registrar-a", {
      branchId: "branch-a",
      customerType: "walk_in",
      items: [{ productId, quantity: 2, discountPercent: 0 }],
      idempotencyKey: "idem-sale-order",
    });
    await updateBranchProductPricingAction("manager-a", {
      branchId: "branch-a",
      productId,
      sellingPriceKobo: 120_000,
      idempotencyKey: "idem-sale-price-update",
    });
    await confirmPaymentAction("cashier-a", {
      orderId: order.orderId,
      paymentLines: [{ paymentMethod: "cash", amountKobo: 200_000 }],
      idempotencyKey: "idem-sale-payment",
    });
    await verifyAndCompleteReleaseAction("release-a", {
      orderId: order.orderId,
      verificationMethod: "qr",
      qrToken: order.qrToken,
      idempotencyKey: "idem-sale-release",
    });
    const freshOrder = await getFirestore().doc(`orders/${order.orderId}`).get();
    const inventory = await getFirestore().doc(`branches/branch-a/inventory/${productId}`).get();
    const financial = await getFirestore().doc(`branches/branch-a/inventoryFinancials/${productId}`).get();
    expect(freshOrder.data()?.items[0].originalUnitPriceKobo).toBe(100_000);
    expect(inventory.data()?.onHandQty).toBe(8);
    expect(inventory.data()?.reservedQty).toBe(0);
    expect(financial.data()?.stockValueKobo).toBe(320_000);
  });
});
