import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  exportReportAction,
  getDashboardSummaryAction,
  getInventoryReportAction,
  getLowStockReportAction,
  getPaymentReportAction,
  getReversalReportAction,
  getSalesReportAction,
  getStaffActivityReportAction,
} from "../src/reports/service";

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

function ts(day: string) {
  return Timestamp.fromDate(new Date(`${day}T10:00:00.000Z`));
}

async function seedBase() {
  const db = getFirestore();
  await Promise.all([
    db.doc("branches/branch-a").set({ name: "Branch A", code: "A", isActive: true }),
    db.doc("branches/branch-b").set({ name: "Branch B", code: "B", isActive: true }),
    db.doc("orders/order-complete").set({
      branchId: "branch-a",
      orderNumber: "YI-A-1",
      customerType: "walk_in",
      status: "completed",
      paymentStatus: "paid",
      subtotalKobo: 120_000,
      discountTotalKobo: 20_000,
      grandTotalKobo: 100_000,
      createdBy: "registrar-a",
      paidBy: "cashier-a",
      releasedBy: "release-a",
      createdAt: ts("2026-07-08"),
      items: [{ productId: "product-1", productName: "Ice", quantity: 1 }],
    }),
    db.doc("orders/order-partial").set({
      branchId: "branch-a",
      orderNumber: "YI-A-2",
      customerType: "registered",
      customerId: "customer-a",
      customerSnapshot: { name: "Customer A" },
      status: "partially_reversed",
      paymentStatus: "credit",
      subtotalKobo: 200_000,
      discountTotalKobo: 0,
      grandTotalKobo: 200_000,
      reversedTotalKobo: 50_000,
      createdBy: "registrar-a",
      paidBy: "cashier-a",
      releasedBy: "release-a",
      createdAt: ts("2026-07-08"),
      items: [{ productId: "product-1", productName: "Ice", quantity: 2 }],
    }),
    db.doc("orders/order-reversed").set({
      branchId: "branch-a",
      orderNumber: "YI-A-3",
      customerType: "walk_in",
      status: "reversed",
      paymentStatus: "paid",
      subtotalKobo: 80_000,
      discountTotalKobo: 0,
      grandTotalKobo: 80_000,
      reversedTotalKobo: 80_000,
      createdBy: "registrar-a",
      paidBy: "cashier-a",
      releasedBy: "release-a",
      createdAt: ts("2026-07-08"),
      items: [{ productId: "product-2", productName: "Dry Ice", quantity: 1 }],
    }),
    db.doc("orders/order-cancelled").set({
      branchId: "branch-a",
      orderNumber: "YI-A-4",
      customerType: "walk_in",
      status: "cancelled",
      paymentStatus: "unpaid",
      subtotalKobo: 90_000,
      discountTotalKobo: 0,
      grandTotalKobo: 90_000,
      createdBy: "registrar-a",
      createdAt: ts("2026-07-08"),
      items: [],
    }),
    db.doc("orders/order-expired").set({
      branchId: "branch-a",
      orderNumber: "YI-A-5",
      customerType: "walk_in",
      status: "expired",
      paymentStatus: "unpaid",
      subtotalKobo: 90_000,
      discountTotalKobo: 0,
      grandTotalKobo: 90_000,
      createdBy: "registrar-a",
      createdAt: ts("2026-07-08"),
      items: [],
    }),
    db.doc("orders/order-b").set({
      branchId: "branch-b",
      orderNumber: "YI-B-1",
      customerType: "walk_in",
      status: "completed",
      paymentStatus: "paid",
      subtotalKobo: 500_000,
      discountTotalKobo: 0,
      grandTotalKobo: 500_000,
      createdBy: "registrar-b",
      paidBy: "cashier-b",
      releasedBy: "release-b",
      createdAt: ts("2026-07-08"),
      items: [],
    }),
    db.doc("orders/order-complete/payments/cash").set({
      branchId: "branch-a",
      orderId: "order-complete",
      paymentMethod: "cash",
      amountKobo: 40_000,
      reference: "CASH",
      proofStoragePath: "secret/path",
      proofRequired: false,
      receivedBy: "cashier-a",
      receivedAt: ts("2026-07-08"),
      status: "confirmed",
    }),
    db.doc("orders/order-complete/payments/transfer").set({
      branchId: "branch-a",
      orderId: "order-complete",
      paymentMethod: "bank_transfer",
      amountKobo: 30_000,
      reference: "TRF",
      proofStoragePath: "secret/path",
      proofRequired: true,
      receivedBy: "cashier-a",
      receivedAt: ts("2026-07-08"),
      status: "confirmed",
    }),
    db.doc("orders/order-complete/payments/pos").set({
      branchId: "branch-a",
      orderId: "order-complete",
      paymentMethod: "pos_terminal",
      amountKobo: 30_000,
      reference: "POS",
      proofRequired: false,
      receivedBy: "cashier-a",
      receivedAt: ts("2026-07-08"),
      status: "confirmed",
    }),
    db.doc("orders/order-partial/payments/credit").set({
      branchId: "branch-a",
      orderId: "order-partial",
      paymentMethod: "credit",
      amountKobo: 200_000,
      reference: "CREDIT",
      proofRequired: false,
      receivedBy: "cashier-a",
      receivedAt: ts("2026-07-08"),
      status: "confirmed",
    }),
    db.doc("branches/branch-a/inventory/product-1").set({
      productId: "product-1",
      sku: "SKU-1",
      productName: "Ice",
      onHandQty: 3,
      reservedQty: 1,
      soldQty: 4,
      returnedQty: 1,
      damagedQty: 0,
      reorderLevel: 3,
    }),
    db.doc("branches/branch-a/inventory/product-2").set({
      productId: "product-2",
      sku: "SKU-2",
      productName: "Dry Ice",
      onHandQty: 20,
      reservedQty: 0,
      soldQty: 1,
      returnedQty: 0,
      damagedQty: 0,
      reorderLevel: 2,
    }),
    db.doc("branches/branch-a/inventoryFinancials/product-1").set({
      productId: "product-1",
      averageUnitCostKobo: 40_000,
      stockValueKobo: 120_000,
    }),
    db.doc("branches/branch-b/inventory/product-b").set({
      productId: "product-b",
      sku: "SKU-B",
      productName: "Branch B Ice",
      onHandQty: 0,
      reservedQty: 0,
      reorderLevel: 2,
    }),
    db.doc("saleReversals/reversal-refund").set({
      branchId: "branch-a",
      reversalNumber: "RV-1",
      orderId: "order-partial",
      orderNumber: "YI-A-2",
      reversalType: "partial_reversal_with_stock_return",
      status: "completed",
      requestedBy: "manager-a",
      approvedBy: "admin",
      completedBy: "admin",
      refundAmountKobo: 50_000,
      creditReductionKobo: 0,
      stockReturned: true,
      requestedAt: ts("2026-07-08"),
      completedAt: ts("2026-07-08"),
    }),
    db.doc("saleReversals/reversal-credit").set({
      branchId: "branch-a",
      reversalNumber: "RV-2",
      orderId: "order-partial",
      orderNumber: "YI-A-2",
      reversalType: "credit_correction",
      status: "completed",
      requestedBy: "manager-a",
      approvedBy: "admin",
      completedBy: "admin",
      refundAmountKobo: 0,
      creditReductionKobo: 25_000,
      stockReturned: false,
      requestedAt: ts("2026-07-08"),
      completedAt: ts("2026-07-08"),
    }),
    db.doc("financialTransactions/credit-sale").set({
      branchId: "branch-a",
      orderId: "order-partial",
      transactionType: "credit_sale",
      paymentMethod: "credit",
      amountKobo: 200_000,
      createdAt: ts("2026-07-08"),
      outstandingBalanceAfterKobo: 200_000,
    }),
    db.doc("financialTransactions/credit-correction").set({
      branchId: "branch-a",
      orderId: "order-partial",
      transactionType: "credit_correction",
      amountKobo: 25_000,
      createdAt: ts("2026-07-08"),
      outstandingBalanceAfterKobo: 175_000,
    }),
    db.doc("auditLogs/activity-a").set({
      branchId: "branch-a",
      actorId: "cashier-a",
      actorRole: "cashier",
      action: "payment.confirmed",
      entityType: "order",
      entityId: "order-complete",
      before: { secret: "hidden" },
      after: { proofStoragePath: "secret/path" },
      createdAt: ts("2026-07-08"),
    }),
    db.doc("auditLogs/activity-b").set({
      branchId: "branch-b",
      actorId: "manager-b",
      actorRole: "branch_manager",
      action: "order.created",
      entityType: "order",
      entityId: "order-b",
      createdAt: ts("2026-07-08"),
    }),
  ]);
  await seedUser("manager-a", "branch_manager", ["branch-a"]);
  await seedUser("manager-b", "branch_manager", ["branch-b"]);
  await seedUser("admin", "admin");
  await seedUser("cashier-a", "cashier", ["branch-a"]);
}

const input = {
  branchId: "branch-a",
  branchScope: "selected_branch" as const,
  startDate: "2026-07-08",
  endDate: "2026-07-08",
  filters: {},
};

beforeAll(() => init());

beforeEach(async () => {
  await clearAuthUsers();
  await clearFirestore();
  await seedBase();
});

describe("report authorization and summaries", () => {
  it("allows branch managers to fetch their branch dashboard and blocks other branches", async () => {
    const dashboard = await getDashboardSummaryAction("manager-a", input);
    expect(dashboard.summary.completedOrdersToday).toBe(3);
    expect(dashboard.branchIds).toEqual(["branch-a"]);
    await expect(getDashboardSummaryAction("manager-a", { ...input, branchId: "branch-b" })).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("allows admins to fetch all-branch dashboard summaries", async () => {
    const dashboard = await getDashboardSummaryAction("admin", { ...input, branchScope: "all_branches", branchId: undefined });
    expect(dashboard.branchScope).toBe("all_branches");
    expect(dashboard.branchIds).toContain("branch-a");
    expect(dashboard.branchIds).toContain("branch-b");
  });

  it("denies operational staff sensitive financial reports", async () => {
    await expect(getSalesReportAction("cashier-a", input)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("excludes cancelled and expired orders from completed-sales totals and marks reversals", async () => {
    const report = await getSalesReportAction("manager-a", input);
    expect(report.summary.orderCount).toBe(5);
    expect(report.summary.completedOrderCount).toBe(3);
    expect(report.summary.cancelledExpiredCount).toBe(2);
    expect(report.summary.netCompletedSalesKobo).toBe(300_000);
    expect(report.summary.reversedValueKobo).toBe(130_000);
    expect(report.rows.some((row) => row.reversalStatus === "partially_reversed")).toBe(true);
    expect(report.rows.some((row) => row.reversalStatus === "reversed")).toBe(true);
  });

  it("separates payment methods and hides payment-proof paths", async () => {
    const report = await getPaymentReportAction("manager-a", input);
    expect(report.summary.cashTotalKobo).toBe(40_000);
    expect(report.summary.transferTotalKobo).toBe(30_000);
    expect(report.summary.posTotalKobo).toBe(30_000);
    expect(report.summary.creditTotalKobo).toBe(200_000);
    expect(JSON.stringify(report.rows)).not.toContain("secret/path");
    expect(report.rows.some((row) => row.proofStatus === "proof attached")).toBe(true);
  });

  it("counts refund records and credit corrections separately", async () => {
    const report = await getReversalReportAction("manager-a", input);
    expect(report.summary.refundAmountKobo).toBe(50_000);
    expect(report.summary.creditReductionKobo).toBe(25_000);
    expect(report.summary.stockReturnCount).toBe(1);
    expect(report.summary.noStockReturnCount).toBe(1);
  });

  it("hides valuation fields from branch managers and includes them for admins", async () => {
    const managerReport = await getInventoryReportAction("manager-a", input);
    const adminReport = await getInventoryReportAction("admin", input);
    expect(managerReport.sensitiveFieldsIncluded).toBe(false);
    expect(managerReport.rows[0]).not.toHaveProperty("stockValueKobo");
    expect(adminReport.sensitiveFieldsIncluded).toBe(true);
    expect(adminReport.rows.some((row) => row.stockValueKobo === 120_000)).toBe(true);
  });

  it("returns low-stock rows only for authorized branches", async () => {
    const report = await getLowStockReportAction("manager-a", input);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].branchId).toBe("branch-a");
    await expect(getLowStockReportAction("manager-a", { ...input, branchId: "branch-b" })).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("keeps staff activity branch-scoped and sanitized", async () => {
    const managerReport = await getStaffActivityReportAction("manager-a", input);
    expect(managerReport.rows).toHaveLength(1);
    expect(JSON.stringify(managerReport.rows)).not.toContain("proofStoragePath");
    const cashierReport = await getStaffActivityReportAction("cashier-a", input);
    expect(cashierReport.summary.ownActivityOnly).toBe(true);
    expect(cashierReport.rows.every((row) => row.userId === "cashier-a")).toBe(true);
  });

  it("exports CSV from authorized data and rejects cross-branch or excessive exports", async () => {
    const exportResult = await exportReportAction("manager-a", { ...input, reportType: "sales", format: "csv" });
    expect(exportResult.fileName).toContain("sales-report");
    expect(exportResult.content).toContain("generatedBy,manager-a");
    await expect(exportReportAction("manager-a", { ...input, branchId: "branch-b", reportType: "sales", format: "csv" })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(exportReportAction("admin", { ...input, reportType: "sales", startDate: "2026-01-01", endDate: "2026-07-08", format: "csv" })).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("validates malformed report filters and dates with Zod", async () => {
    await expect(getSalesReportAction("manager-a", { ...input, startDate: "07-08-2026" })).rejects.toBeTruthy();
  });
});
