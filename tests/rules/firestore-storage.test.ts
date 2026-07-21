import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { getBytes, ref, uploadString } from "firebase/storage";

const projectId = "yita-iceberg";

let testEnv: RulesTestEnvironment;

async function seedBaseData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users/registrar-a"), {
        displayName: "Registrar A",
        email: "registrar-a@example.test",
        isActive: true,
        platformRole: "order_registrar",
        assignedBranchIds: ["branch-a"],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "seed",
        updatedBy: "seed",
      }),
      setDoc(doc(db, "users/inactive-user"), {
        displayName: "Inactive",
        email: "inactive@example.test",
        isActive: false,
        platformRole: "cashier",
        assignedBranchIds: ["branch-a"],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "seed",
        updatedBy: "seed",
      }),
      setDoc(doc(db, "users/admin-user"), {
        displayName: "Admin",
        email: "admin@example.test",
        isActive: true,
        platformRole: "admin",
        assignedBranchIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "seed",
        updatedBy: "seed",
      }),
      setDoc(doc(db, "users/cashier-a"), {
        displayName: "Cashier A",
        email: "cashier-a@example.test",
        isActive: true,
        platformRole: "cashier",
        assignedBranchIds: ["branch-a"],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "seed",
        updatedBy: "seed",
      }),
      setDoc(doc(db, "users/release-a"), {
        displayName: "Release A",
        email: "release-a@example.test",
        isActive: true,
        platformRole: "release_verifier",
        assignedBranchIds: ["branch-a"],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "seed",
        updatedBy: "seed",
      }),
      setDoc(doc(db, "users/manager-a"), {
        displayName: "Manager A",
        email: "manager-a@example.test",
        isActive: true,
        platformRole: "branch_manager",
        assignedBranchIds: ["branch-a"],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "seed",
        updatedBy: "seed",
      }),
      setDoc(doc(db, "branches/branch-a"), {
        name: "Branch A",
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "branches/branch-b"), {
        name: "Branch B",
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "products/product-1"), {
        sku: "SKU-1",
        name: "Product 1",
        unit: "bag",
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "branches/branch-a/products/product-1"), {
        productId: "product-1",
        sku: "SKU-1",
        name: "Product 1",
        unit: "bag",
        sellingPriceKobo: 100000,
        isActive: true,
        updatedAt: serverTimestamp(),
        updatedBy: "seed",
      }),
      setDoc(doc(db, "branches/branch-a/inventory/product-1"), {
        productId: "product-1",
        sku: "SKU-1",
        productName: "Product 1",
        unit: "bag",
        onHandQty: 10,
        reservedQty: 0,
        reorderLevel: 2,
        isLowStock: false,
        updatedAt: serverTimestamp(),
        updatedBy: "seed",
      }),
      setDoc(doc(db, "branches/branch-a/productControls/product-1"), {
        productId: "product-1",
        minimumPriceKobo: 90000,
        defaultCostPriceKobo: 60000,
        updatedAt: serverTimestamp(),
        updatedBy: "seed",
      }),
      setDoc(doc(db, "branches/branch-a/inventoryFinancials/product-1"), {
        productId: "product-1",
        averageUnitCostKobo: 60000,
        stockValueKobo: 600000,
        updatedAt: serverTimestamp(),
        updatedBy: "seed",
      }),
      setDoc(doc(db, "branches/branch-b/inventory/product-1"), {
        productId: "product-1",
        onHandQty: 10,
        reservedQty: 0,
        updatedAt: serverTimestamp(),
        updatedBy: "seed",
      }),
      setDoc(doc(db, "orders/order-a"), {
        branchId: "branch-a",
        status: "awaiting_payment",
        createdAt: serverTimestamp(),
      }),
      setDoc(doc(db, "stockMovements/movement-a"), {
        branchId: "branch-a",
        productId: "product-1",
        movementType: "stock_received",
        quantity: 10,
        onHandBefore: 0,
        onHandAfter: 10,
        reservedBefore: 0,
        reservedAfter: 0,
        createdAt: serverTimestamp(),
      }),
      setDoc(doc(db, "stockReceipts/receipt-a"), {
        receiptNumber: "SR-A",
        branchId: "branch-a",
        items: [
          {
            productId: "product-1",
            sku: "SKU-1",
            productName: "Product 1",
            quantity: 10,
            unitCostKobo: 60000,
            lineValueKobo: 600000,
          },
        ],
        totalValueKobo: 600000,
        status: "posted",
        receivedBy: "manager-a",
        receivedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "stockReceipts/receipt-allocation"), {
        receiptNumber: "SR-ALLOC",
        destinationType: "allocation_pool",
        branchId: null,
        items: [],
        totalValueKobo: 0,
        status: "posted",
        receivedBy: "admin-user",
        receivedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "inventoryAdjustmentRequests/adjustment-a"), {
        branchId: "branch-a",
        productId: "product-1",
        adjustmentType: "increase",
        quantity: 1,
        unitCostKobo: 60000,
        reason: "Opening balance correction",
        status: "pending",
        requestedBy: "manager-a",
        requestedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "stockCounts/count-a"), {
        stockCountNumber: "SC-A",
        branchId: "branch-a",
        status: "open",
        productIds: ["product-1"],
        startedBy: "manager-a",
        startedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }),
      setDoc(doc(db, "stockCounts/count-a/items/product-1"), {
        productId: "product-1",
        expectedOnHandQtyAtStart: 10,
        status: "pending",
      }),
      setDoc(doc(db, "saleReversals/reversal-a"), {
        reversalNumber: "RV-A",
        orderId: "order-a",
        orderNumber: "YI-A",
        branchId: "branch-a",
        reversalType: "partial_reversal_with_stock_return",
        status: "requested",
        reason: "Returned item",
        requestedBy: "manager-a",
        requestedAt: serverTimestamp(),
        items: [],
        originalOrderTotalKobo: 100000,
        reversalSubtotalKobo: 50000,
        refundAmountKobo: 50000,
        creditReductionKobo: 0,
        stockReturnRequired: true,
        stockReturned: false,
        financialImpact: "refund_recorded",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "saleReversals/reversal-b"), {
        reversalNumber: "RV-B",
        orderId: "order-b",
        orderNumber: "YI-B",
        branchId: "branch-b",
        reversalType: "full_reversal_without_stock_return",
        status: "completed",
        reason: "Other branch",
        requestedBy: "manager-b",
        requestedAt: serverTimestamp(),
        items: [],
        originalOrderTotalKobo: 100000,
        reversalSubtotalKobo: 100000,
        refundAmountKobo: 100000,
        creditReductionKobo: 0,
        stockReturnRequired: false,
        stockReturned: false,
        financialImpact: "refund_recorded",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "financialTransactions/transaction-a"), {
        branchId: "branch-a",
        orderId: "order-a",
        paymentId: "payment-a",
        transactionType: "sale_payment",
        paymentMethod: "bank_transfer",
        amountKobo: 100000,
        reference: "TRF-001",
        receivedBy: "cashier-a",
        createdAt: serverTimestamp(),
      }),
      setDoc(doc(db, "financialTransactions/transaction-b"), {
        branchId: "branch-b",
        orderId: "order-b",
        transactionType: "sale_refund",
        amountKobo: 50000,
        reference: "RV-B",
        receivedBy: "admin-user",
        createdAt: serverTimestamp(),
      }),
      setDoc(doc(db, "reportSummaries/dailyBranch_branch-a_20260708"), {
        branchId: "branch-a",
        periodType: "daily",
        periodKey: "20260708",
        grossSalesKobo: 100000,
        netSalesKobo: 100000,
        stockValueKobo: 600000,
        updatedAt: serverTimestamp(),
        generatedBy: "manual",
      }),
      setDoc(doc(db, "reportSummaries/dailyBranch_branch-b_20260708"), {
        branchId: "branch-b",
        periodType: "daily",
        periodKey: "20260708",
        grossSalesKobo: 100000,
        netSalesKobo: 100000,
        updatedAt: serverTimestamp(),
        generatedBy: "manual",
      }),
      setDoc(doc(db, "reportSummaries/dailyCompany_20260708"), {
        periodType: "daily",
        periodKey: "20260708",
        grossSalesKobo: 200000,
        netSalesKobo: 200000,
        updatedAt: serverTimestamp(),
        generatedBy: "manual",
      }),
      setDoc(doc(db, "reportExports/export-a"), {
        branchId: "branch-a",
        reportType: "sales",
        storagePath: "report-exports/branch-a/export-a.csv",
        createdAt: serverTimestamp(),
      }),
      setDoc(doc(db, "paymentProofUploadIntents/payment-a"), {
        paymentId: "payment-a",
        branchId: "branch-a",
        orderId: "order-a",
        storagePath: "payment-proofs/branch-a/order-a/payment-a/proof.pdf",
        contentType: "application/pdf",
        sizeBytes: 5,
        createdBy: "cashier-a",
        consumed: false,
        createdAt: serverTimestamp(),
      }),
      setDoc(doc(db, "auditLogs/audit-a"), {
        actorId: "seed",
        actorRole: "system",
        branchId: "branch-a",
        action: "seed",
        entityType: "test",
        entityId: "test",
        createdAt: serverTimestamp(),
      }),
    ]);
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
    },
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await seedBaseData();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Firestore branch access rules", () => {
  it("blocks unauthenticated users from protected data", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "branches/branch-a")));
  });

  it("allows an operational user to read their own profile", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertSucceeds(getDoc(doc(db, "users/registrar-a")));
  });

  it("allows assigned-branch inventory reads", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertSucceeds(getDoc(doc(db, "branches/branch-a/inventory/product-1")));
    await assertSucceeds(getDoc(doc(db, "branches/branch-a/products/product-1")));
    await assertSucceeds(getDoc(doc(db, "stockMovements/movement-a")));
  });

  it("allows an order registrar to load assigned-branch order form data", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();

    await assertSucceeds(
      getDocs(
        query(
          collection(db, "branches/branch-a/products"),
          where("isActive", "==", true),
          limit(50),
        ),
      ),
    );
    await assertSucceeds(
      getDocs(query(collection(db, "branches/branch-a/inventory"), limit(50))),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, "customers"),
          where("branchId", "==", "branch-a"),
          where("isActive", "==", true),
          limit(25),
        ),
      ),
    );
  });

  it("blocks cross-branch inventory reads", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertFails(getDoc(doc(db, "branches/branch-b/inventory/product-1")));
  });

  it("keeps protected cost, pricing controls, and global catalog admin-only", async () => {
    const registrarDb = testEnv.authenticatedContext("registrar-a").firestore();
    const cashierDb = testEnv.authenticatedContext("cashier-a").firestore();
    const releaseDb = testEnv.authenticatedContext("release-a").firestore();
    const managerDb = testEnv.authenticatedContext("manager-a").firestore();
    const adminDb = testEnv.authenticatedContext("admin-user").firestore();

    await assertFails(getDoc(doc(registrarDb, "branches/branch-a/productControls/product-1")));
    await assertFails(getDoc(doc(cashierDb, "branches/branch-a/inventoryFinancials/product-1")));
    await assertFails(getDoc(doc(releaseDb, "products/product-1")));
    await assertFails(getDoc(doc(managerDb, "branches/branch-a/productControls/product-1")));
    await assertFails(getDoc(doc(managerDb, "branches/branch-a/inventoryFinancials/product-1")));

    await assertSucceeds(getDoc(doc(adminDb, "products/product-1")));
    await assertSucceeds(getDoc(doc(adminDb, "branches/branch-a/productControls/product-1")));
    await assertSucceeds(getDoc(doc(adminDb, "branches/branch-a/inventoryFinancials/product-1")));
  });

  it("limits receipt, adjustment, and stock count reads to managers and admins", async () => {
    const registrarDb = testEnv.authenticatedContext("registrar-a").firestore();
    const managerDb = testEnv.authenticatedContext("manager-a").firestore();
    const adminDb = testEnv.authenticatedContext("admin-user").firestore();

    await assertFails(getDoc(doc(registrarDb, "stockReceipts/receipt-a")));
    await assertFails(getDoc(doc(registrarDb, "inventoryAdjustmentRequests/adjustment-a")));
    await assertFails(getDoc(doc(registrarDb, "stockCounts/count-a")));
    await assertFails(getDoc(doc(registrarDb, "stockCounts/count-a/items/product-1")));

    await assertSucceeds(getDoc(doc(managerDb, "stockReceipts/receipt-a")));
    await assertSucceeds(getDoc(doc(managerDb, "inventoryAdjustmentRequests/adjustment-a")));
    await assertSucceeds(getDoc(doc(managerDb, "stockCounts/count-a")));
    await assertSucceeds(getDoc(doc(managerDb, "stockCounts/count-a/items/product-1")));
    await assertSucceeds(getDoc(doc(adminDb, "stockReceipts/receipt-a")));
    await assertFails(getDoc(doc(managerDb, "stockReceipts/receipt-allocation")));
    await assertSucceeds(getDoc(doc(adminDb, "stockReceipts/receipt-allocation")));
  });

  it("limits reversal reads to branch managers and admins", async () => {
    const registrarDb = testEnv.authenticatedContext("registrar-a").firestore();
    const cashierDb = testEnv.authenticatedContext("cashier-a").firestore();
    const releaseDb = testEnv.authenticatedContext("release-a").firestore();
    const managerDb = testEnv.authenticatedContext("manager-a").firestore();
    const adminDb = testEnv.authenticatedContext("admin-user").firestore();

    await assertFails(getDoc(doc(registrarDb, "saleReversals/reversal-a")));
    await assertFails(getDoc(doc(cashierDb, "saleReversals/reversal-a")));
    await assertFails(getDoc(doc(releaseDb, "saleReversals/reversal-a")));
    await assertSucceeds(getDoc(doc(managerDb, "saleReversals/reversal-a")));
    await assertSucceeds(getDoc(doc(adminDb, "saleReversals/reversal-b")));
    await assertFails(getDoc(doc(managerDb, "saleReversals/reversal-b")));
  });

  it("keeps financial transactions manager and admin only", async () => {
    const registrarDb = testEnv.authenticatedContext("registrar-a").firestore();
    const cashierDb = testEnv.authenticatedContext("cashier-a").firestore();
    const releaseDb = testEnv.authenticatedContext("release-a").firestore();
    const managerDb = testEnv.authenticatedContext("manager-a").firestore();
    const adminDb = testEnv.authenticatedContext("admin-user").firestore();

    await assertFails(getDoc(doc(registrarDb, "financialTransactions/transaction-a")));
    await assertFails(getDoc(doc(cashierDb, "financialTransactions/transaction-a")));
    await assertFails(getDoc(doc(releaseDb, "financialTransactions/transaction-a")));
    await assertSucceeds(getDoc(doc(managerDb, "financialTransactions/transaction-a")));
    await assertFails(getDoc(doc(managerDb, "financialTransactions/transaction-b")));
    await assertSucceeds(getDoc(doc(adminDb, "financialTransactions/transaction-b")));
  });

  it("allows permitted report summary reads and blocks cross-branch summaries", async () => {
    const managerDb = testEnv.authenticatedContext("manager-a").firestore();
    const adminDb = testEnv.authenticatedContext("admin-user").firestore();

    await assertSucceeds(getDoc(doc(managerDb, "reportSummaries/dailyBranch_branch-a_20260708")));
    await assertFails(getDoc(doc(managerDb, "reportSummaries/dailyBranch_branch-b_20260708")));
    await assertFails(getDoc(doc(managerDb, "reportSummaries/dailyCompany_20260708")));
    await assertSucceeds(getDoc(doc(adminDb, "reportSummaries/dailyCompany_20260708")));
  });

  it("blocks direct inventory writes", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertFails(
      setDoc(doc(db, "branches/branch-a/inventory/product-2"), {
        productId: "product-2",
        onHandQty: 5,
      }),
    );
  });

  it("blocks client writes to catalog, protected inventory, and control documents", async () => {
    const db = testEnv.authenticatedContext("admin-user").firestore();

    await assertFails(setDoc(doc(db, "products/product-2"), { sku: "SKU-2", name: "Product 2" }));
    await assertFails(setDoc(doc(db, "branches/branch-a/products/product-1"), { sellingPriceKobo: 1 }));
    await assertFails(setDoc(doc(db, "branches/branch-a/productControls/product-1"), { minimumPriceKobo: 1 }));
    await assertFails(setDoc(doc(db, "branches/branch-a/inventoryFinancials/product-1"), { stockValueKobo: 1 }));
    await assertFails(setDoc(doc(db, "productUniqueSkus/sku-2"), { productId: "product-2" }));
    await assertFails(setDoc(doc(db, "productUniqueBarcodes/bar-2"), { productId: "product-2" }));
  });

  it("blocks client writes to inventory operation ledgers", async () => {
    const db = testEnv.authenticatedContext("manager-a").firestore();

    await assertFails(setDoc(doc(db, "stockReceipts/receipt-b"), { branchId: "branch-a" }));
    await assertFails(setDoc(doc(db, "inventoryAdjustmentRequests/adjustment-b"), { branchId: "branch-a" }));
    await assertFails(setDoc(doc(db, "stockCounts/count-b"), { branchId: "branch-a" }));
    await assertFails(setDoc(doc(db, "stockCounts/count-a/items/product-1"), { countedQty: 10 }));
    await assertFails(setDoc(doc(db, "stockMovements/movement-b"), { branchId: "branch-a" }));
    await assertFails(setDoc(doc(db, "saleReversals/reversal-c"), { branchId: "branch-a" }));
    await assertFails(setDoc(doc(db, "reportSummaries/dailyBranch_branch-a_20260709"), { branchId: "branch-a" }));
    await assertFails(setDoc(doc(db, "reportExports/export-b"), { branchId: "branch-a" }));
  });

  it("blocks direct order creation or edits", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertFails(
      setDoc(doc(db, "orders/order-new"), {
        branchId: "branch-a",
        status: "awaiting_payment",
      }),
    );
    await assertFails(
      setDoc(doc(db, "orders/order-a"), {
        branchId: "branch-a",
        status: "completed",
      }),
    );
  });

  it("blocks users from editing their own role or branch assignment", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertFails(
      setDoc(doc(db, "users/registrar-a"), {
        displayName: "Registrar A",
        email: "registrar-a@example.test",
        isActive: true,
        platformRole: "admin",
        assignedBranchIds: ["branch-a", "branch-b"],
      }),
    );
  });

  it("blocks operational users from reading another user profile", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertFails(getDoc(doc(db, "users/cashier-a")));
  });

  it("allows admin access to branch data", async () => {
    const db = testEnv.authenticatedContext("admin-user").firestore();
    await assertSucceeds(getDoc(doc(db, "branches/branch-b/inventory/product-1")));
  });

  it("blocks client audit log creation, edits, and deletes", async () => {
    const db = testEnv.authenticatedContext("admin-user").firestore();
    await assertFails(
      setDoc(doc(db, "auditLogs/audit-new"), {
        action: "client-write",
        branchId: "branch-a",
      }),
    );
    await assertFails(
      setDoc(doc(db, "auditLogs/audit-a"), {
        action: "client-edit",
        branchId: "branch-a",
      }),
    );
    await assertFails(deleteDoc(doc(db, "auditLogs/audit-a")));
  });

  it("blocks client writes to financial and idempotency ledgers", async () => {
    const db = testEnv.authenticatedContext("admin-user").firestore();

    await assertFails(
      setDoc(doc(db, "financialTransactions/txn-a"), {
        branchId: "branch-a",
        orderId: "order-a",
        amountKobo: 1000,
      }),
    );
    await assertFails(
      setDoc(doc(db, "idempotencyRecords/admin_create_key"), {
        actorId: "admin-user",
        operation: "createOrder",
      }),
    );
  });

  it("keeps export metadata private", async () => {
    const managerDb = testEnv.authenticatedContext("manager-a").firestore();
    const adminDb = testEnv.authenticatedContext("admin-user").firestore();

    await assertFails(getDoc(doc(managerDb, "reportExports/export-a")));
    await assertFails(getDoc(doc(adminDb, "reportExports/export-a")));
  });

  it("denies inactive users where rules can enforce active status", async () => {
    const db = testEnv.authenticatedContext("inactive-user").firestore();
    await assertFails(getDoc(doc(db, "users/inactive-user")));
    await assertFails(getDoc(doc(db, "branches/branch-a/inventory/product-1")));
  });
});

describe("Storage payment proof rules", () => {
  it("allows authorized payment proof uploads and reads in the assigned branch", async () => {
    const context = testEnv.authenticatedContext("cashier-a");
    const storage = context.storage();
    const proofRef = ref(
      storage,
      "payment-proofs/branch-a/order-a/payment-a/proof.pdf",
    );

    await assertSucceeds(
      uploadString(proofRef, "proof", "raw", {
        contentType: "application/pdf",
        customMetadata: {
          paymentProofUploadIntentId: "payment-a",
          branchId: "branch-a",
          orderId: "order-a",
        },
      }),
    );
    await assertSucceeds(getBytes(proofRef));
  });

  it("rejects unauthorized payment proof uploads and reads", async () => {
    const registrarStorage = testEnv.authenticatedContext("registrar-a").storage();
    const crossBranchStorage = testEnv.authenticatedContext("cashier-a").storage();

    await assertFails(
      uploadString(
        ref(registrarStorage, "payment-proofs/branch-a/order-a/payment-a/proof.pdf"),
        "proof",
        "raw",
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadString(
        ref(
          crossBranchStorage,
          "payment-proofs/branch-b/order-b/payment-b/proof.pdf",
        ),
        "proof",
        "raw",
        { contentType: "application/pdf" },
      ),
    );
  });

  it("does not expose generated report exports publicly", async () => {
    const adminStorage = testEnv.authenticatedContext("admin-user").storage();
    await assertFails(getBytes(ref(adminStorage, "report-exports/branch-a/export-a.csv")));
  });
});

describe("Storage product image rules", () => {
  it("allows admins to upload product images and active staff to view them", async () => {
    const adminStorage = testEnv.authenticatedContext("admin-user").storage();
    const productRef = ref(adminStorage, "product-images/product-1/primary");
    await assertSucceeds(uploadString(productRef, "image", "raw", {
      contentType: "image/webp",
      customMetadata: { productId: "product-1", uploadedBy: "admin-user" },
    }));

    const registrarStorage = testEnv.authenticatedContext("registrar-a").storage();
    await assertSucceeds(getBytes(ref(registrarStorage, "product-images/product-1/primary")));
  });

  it("rejects non-admin, invalid, and mismatched product image uploads", async () => {
    const registrarStorage = testEnv.authenticatedContext("registrar-a").storage();
    await assertFails(uploadString(
      ref(registrarStorage, "product-images/product-1/primary"),
      "image",
      "raw",
      { contentType: "image/png", customMetadata: { productId: "product-1", uploadedBy: "registrar-a" } },
    ));

    const adminStorage = testEnv.authenticatedContext("admin-user").storage();
    await assertFails(uploadString(
      ref(adminStorage, "product-images/product-1/not-primary"),
      "image",
      "raw",
      { contentType: "image/png", customMetadata: { productId: "product-1", uploadedBy: "admin-user" } },
    ));
    await assertFails(uploadString(
      ref(adminStorage, "product-images/product-1/primary"),
      "not an image",
      "raw",
      { contentType: "text/plain", customMetadata: { productId: "product-1", uploadedBy: "admin-user" } },
    ));
    await assertFails(uploadString(
      ref(adminStorage, "product-images/product-1/primary"),
      "image",
      "raw",
      { contentType: "image/png", customMetadata: { productId: "another-product", uploadedBy: "admin-user" } },
    ));
  });
});
