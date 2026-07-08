import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

import { requireActor } from "../shared/auth";
import { adminDb } from "../shared/firebase";
import { canAccessBranch, type ActorProfile } from "../shared/roles";
import {
  dashboardSummarySchema,
  exportReportSchema,
  rebuildReportSummariesSchema,
  reportInputSchema,
  type ExportReportInput,
  type ReportInput,
  type ReportType,
} from "./schemas";

type DateRange = {
  startDate: string;
  endDate: string;
  start: Timestamp;
  end: Timestamp;
  days: number;
};

type BranchScope = {
  branchScope: "selected_branch" | "all_branches";
  branchIds: string[];
  branchNames: Record<string, string>;
  requestedBranchId?: string;
};

type ReportResult = {
  summary: Record<string, unknown>;
  rows: Record<string, unknown>[];
  nextPageCursor: string | null;
  generatedAt: string;
  branchScope: BranchScope["branchScope"];
  branchIds: string[];
  sensitiveFieldsIncluded: boolean;
};

const managementRoles = ["branch_manager", "admin", "super_admin"];
const adminRoles = ["admin", "super_admin"];
const operationalRoles = ["order_registrar", "cashier", "release_verifier"];
const detailRangeLimitDays = 93;
const exportRangeLimitDays = 31;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function parseDateRange(input: { startDate?: string; endDate?: string }, defaults: "today" | "month" = "month"): DateRange {
  const startDate = input.startDate ?? (defaults === "today" ? todayIso() : monthStartIso());
  const endDate = input.endDate ?? todayIso();
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) {
    throw new HttpsError("invalid-argument", "Invalid report date range.");
  }
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  if (start >= endExclusive) {
    throw new HttpsError("invalid-argument", "Start date must be before or equal to end date.");
  }
  const days = Math.ceil((endExclusive.getTime() - start.getTime()) / 86_400_000);
  return {
    startDate,
    endDate,
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(endExclusive),
    days,
  };
}

function ensureRole(actor: ActorProfile, roles: string[]) {
  if (!roles.includes(actor.platformRole)) {
    throw new HttpsError("permission-denied", "Role is not allowed for this report.");
  }
}

function includeSensitiveFinancials(actor: ActorProfile) {
  return adminRoles.includes(actor.platformRole);
}

async function loadBranches() {
  const snapshot = await adminDb().collection("branches").get();
  const names: Record<string, string> = {};
  for (const doc of snapshot.docs) {
    names[doc.id] = String(doc.data().name ?? doc.id);
  }
  return names;
}

async function resolveBranchScope(actor: ActorProfile, input: Pick<ReportInput, "branchId" | "branchScope">): Promise<BranchScope> {
  const branchNames = await loadBranches();
  if (input.branchScope === "all_branches") {
    if (!adminRoles.includes(actor.platformRole)) {
      throw new HttpsError("permission-denied", "All-branch reports require admin access.");
    }
    return {
      branchScope: "all_branches",
      branchIds: Object.keys(branchNames),
      branchNames,
    };
  }

  const selectedBranchId = input.branchId ?? actor.assignedBranchIds[0];
  if (!selectedBranchId) {
    throw new HttpsError("invalid-argument", "Select a branch for this report.");
  }
  if (!canAccessBranch(actor, selectedBranchId)) {
    throw new HttpsError("permission-denied", "Branch access denied.");
  }
  return {
    branchScope: "selected_branch",
    branchIds: [selectedBranchId],
    branchNames,
    requestedBranchId: selectedBranchId,
  };
}

function positiveInt(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function iso(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function decodeCursor(cursor?: string) {
  if (!cursor) return 0;
  const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function encodeCursor(offset: number, total: number) {
  return offset < total ? Buffer.from(String(offset), "utf8").toString("base64url") : null;
}

function paginate<T>(items: T[], pageSize = 50, cursor?: string) {
  const start = decodeCursor(cursor);
  const rows = items.slice(start, start + pageSize);
  return { rows, nextPageCursor: encodeCursor(start + rows.length, items.length) };
}

async function queryCollectionByDate(
  collection: string,
  dateField: string,
  range: DateRange,
  branchIds: string[],
): Promise<Record<string, unknown>[]> {
  const snapshots = await Promise.all(
    branchIds.map((branchId) =>
      adminDb()
        .collection(collection)
        .where("branchId", "==", branchId)
        .where(dateField, ">=", range.start)
        .where(dateField, "<", range.end)
        .orderBy(dateField, "desc")
        .limit(500)
        .get(),
    ),
  );
  return snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
}

async function queryOrders(range: DateRange, branchIds: string[]) {
  return queryCollectionByDate("orders", "createdAt", range, branchIds);
}

async function queryFinancialTransactions(range: DateRange, branchIds: string[]) {
  return queryCollectionByDate("financialTransactions", "createdAt", range, branchIds);
}

async function queryReversals(range: DateRange, branchIds: string[]) {
  return queryCollectionByDate("saleReversals", "requestedAt", range, branchIds);
}

async function queryMovements(range: DateRange, branchIds: string[]) {
  return queryCollectionByDate("stockMovements", "createdAt", range, branchIds);
}

async function queryAuditLogs(range: DateRange, branchIds: string[]) {
  return queryCollectionByDate("auditLogs", "createdAt", range, branchIds);
}

function paymentProofStatus(payment: Record<string, unknown>) {
  if (payment.proofRequired === true && payment.proofStoragePath) return "proof attached";
  if (payment.proofRequired === true) return "not attached";
  return "not required";
}

async function getPaymentLines(orderIds: string[]) {
  const rows: Record<string, unknown>[] = [];
  await Promise.all(
    orderIds.map(async (orderId) => {
      const snapshot = await adminDb().collection(`orders/${orderId}/payments`).get();
      for (const doc of snapshot.docs) {
        rows.push({ id: doc.id, ...doc.data() });
      }
    }),
  );
  return rows;
}

function orderCustomerName(order: Record<string, unknown>) {
  const snapshot = order.customerSnapshot;
  if (snapshot && typeof snapshot === "object" && "name" in snapshot && typeof snapshot.name === "string") {
    return snapshot.name;
  }
  return order.customerType === "registered" ? text(order.customerId, "Registered customer") : "Walk-in customer";
}

function saleStatusCounts(orders: Record<string, unknown>[]) {
  return {
    orderCount: orders.length,
    completedOrderCount: orders.filter((order) => ["completed", "partially_reversed", "reversed"].includes(text(order.status))).length,
    cancelledOrderCount: orders.filter((order) => order.status === "cancelled").length,
    expiredOrderCount: orders.filter((order) => order.status === "expired").length,
    reversedOrderCount: orders.filter((order) => order.status === "reversed").length,
    partiallyReversedOrderCount: orders.filter((order) => order.status === "partially_reversed").length,
  };
}

function completedSaleOrders(orders: Record<string, unknown>[]) {
  return orders.filter((order) => ["completed", "partially_reversed", "reversed"].includes(text(order.status)));
}

function applyOrderFilters(orders: Record<string, unknown>[], filters: Record<string, unknown>) {
  return orders.filter((order) => {
    if (typeof filters.status === "string" && order.status !== filters.status) return false;
    if (typeof filters.customerType === "string" && order.customerType !== filters.customerType) return false;
    if (typeof filters.createdBy === "string" && order.createdBy !== filters.createdBy) return false;
    if (typeof filters.paymentStatus === "string" && order.paymentStatus !== filters.paymentStatus) return false;
    if (typeof filters.productId === "string") {
      const items = Array.isArray(order.items) ? order.items : [];
      return items.some((item) => item && typeof item === "object" && "productId" in item && item.productId === filters.productId);
    }
    return true;
  });
}

async function salesReport(actor: ActorProfile, input: ReportInput, defaults: "today" | "month" = "month"): Promise<ReportResult> {
  ensureRole(actor, managementRoles);
  const range = parseDateRange(input, defaults);
  if (range.days > detailRangeLimitDays) throw new HttpsError("invalid-argument", "Sales report date range is too large.");
  const scope = await resolveBranchScope(actor, input);
  const allOrders = applyOrderFilters(await queryOrders(range, scope.branchIds), input.filters);
  const completed = completedSaleOrders(allOrders);
  const reversedValueKobo = completed.reduce((sum, order) => sum + positiveInt(order.reversedTotalKobo), 0);
  const grossSalesKobo = completed.reduce((sum, order) => sum + positiveInt(order.subtotalKobo), 0);
  const discountTotalKobo = completed.reduce((sum, order) => sum + positiveInt(order.discountTotalKobo), 0);
  const netCompletedSalesKobo = completed
    .filter((order) => order.status !== "reversed")
    .reduce((sum, order) => sum + positiveInt(order.grandTotalKobo), 0);
  const rows = allOrders.map((order) => ({
    orderId: order.id,
    orderNumber: text(order.orderNumber, String(order.id)),
    date: iso(order.createdAt),
    branchId: order.branchId,
    branch: scope.branchNames[String(order.branchId)] ?? order.branchId,
    customer: orderCustomerName(order),
    status: order.status,
    paymentStatus: order.paymentStatus,
    subtotalKobo: positiveInt(order.subtotalKobo),
    discountKobo: positiveInt(order.discountTotalKobo),
    totalKobo: positiveInt(order.grandTotalKobo),
    createdBy: order.createdBy,
    paidBy: order.paidBy ?? null,
    releasedBy: order.releasedBy ?? null,
    reversalStatus: order.status === "reversed" || order.status === "partially_reversed" ? order.status : "none",
  }));
  const page = paginate(rows, input.pageSize, input.pageCursor);
  return {
    summary: {
      grossSalesKobo,
      discountTotalKobo,
      netCompletedSalesKobo,
      reversedValueKobo,
      cancelledExpiredCount: allOrders.filter((order) => ["cancelled", "expired"].includes(text(order.status))).length,
      averageOrderValueKobo: completed.length ? Math.round(netCompletedSalesKobo / completed.length) : 0,
      ...saleStatusCounts(allOrders),
      completedOrderCount: completed.length,
    },
    rows: page.rows,
    nextPageCursor: page.nextPageCursor,
    generatedAt: new Date().toISOString(),
    branchScope: scope.branchScope,
    branchIds: scope.branchIds,
    sensitiveFieldsIncluded: false,
  };
}

async function paymentReport(actor: ActorProfile, input: ReportInput): Promise<ReportResult> {
  ensureRole(actor, ["cashier", "branch_manager", "admin", "super_admin"]);
  const range = parseDateRange(input);
  if (range.days > detailRangeLimitDays) throw new HttpsError("invalid-argument", "Payment report date range is too large.");
  const scope = await resolveBranchScope(actor, input);
  const orders = await queryOrders(range, scope.branchIds);
  const orderById = new Map<string, Record<string, unknown>>(orders.map((order) => [String(order.id), order]));
  let payments = await getPaymentLines(orders.map((order) => String(order.id)));
  payments = payments.filter((payment) => {
    if (typeof input.filters.paymentMethod === "string" && payment.paymentMethod !== input.filters.paymentMethod) return false;
    if (typeof input.filters.cashier === "string" && payment.receivedBy !== input.filters.cashier) return false;
    if (typeof input.filters.orderNumber === "string") {
      const order = orderById.get(String(payment.orderId));
      return text(order?.orderNumber).includes(input.filters.orderNumber);
    }
    if (typeof input.filters.creditOnly === "boolean") {
      return input.filters.creditOnly ? payment.paymentMethod === "credit" : payment.paymentMethod !== "credit";
    }
    return true;
  });
  const rows = payments.map((payment) => {
    const order = orderById.get(String(payment.orderId));
    return {
      paymentId: payment.id,
      paymentDate: iso(payment.receivedAt),
      orderId: payment.orderId,
      orderNumber: text(order?.orderNumber, String(payment.orderId)),
      branchId: payment.branchId,
      branch: scope.branchNames[String(payment.branchId)] ?? payment.branchId,
      customer: order ? orderCustomerName(order) : "",
      paymentMethod: payment.paymentMethod,
      amountKobo: positiveInt(payment.amountKobo),
      reference: payment.reference ?? null,
      cashier: payment.receivedBy ?? null,
      status: payment.status ?? "confirmed",
      proofStatus: paymentProofStatus(payment),
    };
  });
  const byMethod = (method: string) => rows.filter((row) => row.paymentMethod === method).reduce((sum, row) => sum + positiveInt(row.amountKobo), 0);
  const totalReceivedKobo = rows.filter((row) => row.paymentMethod !== "credit").reduce((sum, row) => sum + positiveInt(row.amountKobo), 0);
  const page = paginate(rows, input.pageSize, input.pageCursor);
  return {
    summary: {
      cashTotalKobo: byMethod("cash"),
      transferTotalKobo: byMethod("bank_transfer"),
      posTotalKobo: byMethod("pos_terminal"),
      creditTotalKobo: byMethod("credit"),
      totalReceivedKobo,
      receivablesCreatedKobo: byMethod("credit"),
      paymentLineCount: rows.length,
    },
    rows: page.rows,
    nextPageCursor: page.nextPageCursor,
    generatedAt: new Date().toISOString(),
    branchScope: scope.branchScope,
    branchIds: scope.branchIds,
    sensitiveFieldsIncluded: false,
  };
}

async function inventoryReport(actor: ActorProfile, input: ReportInput, lowStockOnly = false): Promise<ReportResult> {
  ensureRole(actor, managementRoles);
  const scope = await resolveBranchScope(actor, input);
  const sensitive = includeSensitiveFinancials(actor);
  const rows: Record<string, unknown>[] = [];
  for (const branchId of scope.branchIds) {
    const inventorySnapshot = await adminDb().collection(`branches/${branchId}/inventory`).limit(500).get();
    const financialSnapshot = sensitive ? await adminDb().collection(`branches/${branchId}/inventoryFinancials`).limit(500).get() : null;
    const financials = new Map(financialSnapshot?.docs.map((doc) => [doc.id, doc.data()]) ?? []);
    for (const doc of inventorySnapshot.docs) {
      const item = doc.data();
      const availableQty = positiveInt(item.onHandQty) - positiveInt(item.reservedQty);
      const reorderLevel = positiveInt(item.reorderLevel);
      const isLowStock = availableQty <= reorderLevel;
      if (lowStockOnly || input.filters.lowStockOnly === true) {
        if (!isLowStock) continue;
      }
      if (typeof input.filters.productSearch === "string") {
        const needle = input.filters.productSearch.toLowerCase();
        if (!`${item.productName ?? ""} ${item.sku ?? ""}`.toLowerCase().includes(needle)) continue;
      }
      const financial = financials.get(doc.id);
      rows.push({
        productId: doc.id,
        product: text(item.productName, text(item.name, doc.id)),
        sku: item.sku ?? null,
        branchId,
        branch: scope.branchNames[branchId] ?? branchId,
        onHandQty: positiveInt(item.onHandQty),
        reservedQty: positiveInt(item.reservedQty),
        availableQty,
        soldQty: positiveInt(item.soldQty),
        reversedSoldQty: positiveInt(item.reversedSoldQty),
        returnedQty: positiveInt(item.returnedQty),
        damagedQty: positiveInt(item.damagedQty),
        reorderLevel,
        isLowStock,
        ...(sensitive
          ? {
              stockValueKobo: positiveInt(financial?.stockValueKobo),
              averageUnitCostKobo: positiveInt(financial?.averageUnitCostKobo),
              valuationMethod: "weighted_average",
            }
          : {}),
      });
    }
  }
  const page = paginate(rows, input.pageSize, input.pageCursor);
  return {
    summary: {
      productCount: rows.length,
      lowStockCount: rows.filter((row) => row.isLowStock).length,
      stockValueKobo: sensitive ? rows.reduce((sum, row) => sum + positiveInt(row.stockValueKobo), 0) : undefined,
    },
    rows: page.rows,
    nextPageCursor: page.nextPageCursor,
    generatedAt: new Date().toISOString(),
    branchScope: scope.branchScope,
    branchIds: scope.branchIds,
    sensitiveFieldsIncluded: sensitive,
  };
}

async function stockMovementReport(actor: ActorProfile, input: ReportInput): Promise<ReportResult> {
  ensureRole(actor, managementRoles);
  const range = parseDateRange(input);
  if (range.days > detailRangeLimitDays) throw new HttpsError("invalid-argument", "Stock movement report date range is too large.");
  const scope = await resolveBranchScope(actor, input);
  const sensitive = includeSensitiveFinancials(actor);
  let movements = await queryMovements(range, scope.branchIds);
  movements = movements.filter((movement) => {
    if (typeof input.filters.productId === "string" && movement.productId !== input.filters.productId) return false;
    if (typeof input.filters.movementType === "string" && movement.movementType !== input.filters.movementType) return false;
    if (typeof input.filters.orderNumber === "string" && !text(movement.orderNumber).includes(input.filters.orderNumber)) return false;
    if (typeof input.filters.performedBy === "string" && movement.performedBy !== input.filters.performedBy) return false;
    return true;
  });
  const rows = movements.map((movement) => ({
    movementId: movement.id,
    date: iso(movement.createdAt),
    branchId: movement.branchId,
    branch: scope.branchNames[String(movement.branchId)] ?? movement.branchId,
    productId: movement.productId,
    product: movement.productName ?? movement.productId,
    movementType: movement.movementType,
    quantity: positiveInt(movement.quantity),
    onHandBefore: positiveInt(movement.onHandBefore),
    onHandAfter: positiveInt(movement.onHandAfter),
    reservedBefore: positiveInt(movement.reservedBefore),
    reservedAfter: positiveInt(movement.reservedAfter),
    orderId: movement.orderId ?? null,
    orderNumber: movement.orderNumber ?? null,
    reason: movement.reason ?? null,
    performedBy: movement.performedBy ?? null,
    ...(sensitive ? { unitCostKobo: positiveInt(movement.unitCostKobo), inventoryValueImpactKobo: positiveInt(movement.inventoryValueImpactKobo) } : {}),
  }));
  const page = paginate(rows, input.pageSize, input.pageCursor);
  return {
    summary: {
      movementCount: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + positiveInt(row.quantity), 0),
    },
    rows: page.rows,
    nextPageCursor: page.nextPageCursor,
    generatedAt: new Date().toISOString(),
    branchScope: scope.branchScope,
    branchIds: scope.branchIds,
    sensitiveFieldsIncluded: sensitive,
  };
}

async function reversalReport(actor: ActorProfile, input: ReportInput): Promise<ReportResult> {
  ensureRole(actor, managementRoles);
  const range = parseDateRange(input);
  if (range.days > detailRangeLimitDays) throw new HttpsError("invalid-argument", "Reversal report date range is too large.");
  const scope = await resolveBranchScope(actor, input);
  let reversals = await queryReversals(range, scope.branchIds);
  reversals = reversals.filter((reversal) => {
    if (typeof input.filters.status === "string" && reversal.status !== input.filters.status) return false;
    if (typeof input.filters.reversalType === "string" && reversal.reversalType !== input.filters.reversalType) return false;
    if (typeof input.filters.requestedBy === "string" && reversal.requestedBy !== input.filters.requestedBy) return false;
    if (typeof input.filters.approvedBy === "string" && reversal.approvedBy !== input.filters.approvedBy) return false;
    if (typeof input.filters.completedBy === "string" && reversal.completedBy !== input.filters.completedBy) return false;
    if (typeof input.filters.stockReturned === "boolean" && reversal.stockReturned !== input.filters.stockReturned) return false;
    return true;
  });
  const rows = reversals.map((reversal) => ({
    reversalId: reversal.id,
    reversalNumber: reversal.reversalNumber,
    orderId: reversal.orderId,
    orderNumber: reversal.orderNumber,
    branchId: reversal.branchId,
    branch: scope.branchNames[String(reversal.branchId)] ?? reversal.branchId,
    customer: reversal.customerName ?? null,
    type: reversal.reversalType,
    status: reversal.status,
    requestedBy: reversal.requestedBy,
    approvedBy: reversal.approvedBy ?? null,
    completedBy: reversal.completedBy ?? null,
    refundAmountKobo: positiveInt(reversal.refundAmountKobo),
    creditReductionKobo: positiveInt(reversal.creditReductionKobo),
    stockReturned: reversal.stockReturned === true,
    requestedDate: iso(reversal.requestedAt),
    completedDate: iso(reversal.completedAt),
    note: positiveInt(reversal.refundAmountKobo) > 0 ? "Internal refund record only" : null,
  }));
  const page = paginate(rows, input.pageSize, input.pageCursor);
  return {
    summary: {
      reversalCount: rows.length,
      completedReversalCount: rows.filter((row) => row.status === "completed").length,
      refundAmountKobo: rows.reduce((sum, row) => sum + positiveInt(row.refundAmountKobo), 0),
      creditReductionKobo: rows.reduce((sum, row) => sum + positiveInt(row.creditReductionKobo), 0),
      stockReturnCount: rows.filter((row) => row.stockReturned).length,
      noStockReturnCount: rows.filter((row) => !row.stockReturned).length,
    },
    rows: page.rows,
    nextPageCursor: page.nextPageCursor,
    generatedAt: new Date().toISOString(),
    branchScope: scope.branchScope,
    branchIds: scope.branchIds,
    sensitiveFieldsIncluded: false,
  };
}

async function creditReport(actor: ActorProfile, input: ReportInput): Promise<ReportResult> {
  ensureRole(actor, managementRoles);
  const range = parseDateRange(input);
  if (range.days > detailRangeLimitDays) throw new HttpsError("invalid-argument", "Credit report date range is too large.");
  const scope = await resolveBranchScope(actor, input);
  const transactions = (await queryFinancialTransactions(range, scope.branchIds)).filter((txn) =>
    ["credit_sale", "credit_correction"].includes(text(txn.transactionType)),
  );
  const rows = transactions.map((txn) => ({
    transactionId: txn.id,
    customerId: txn.customerId ?? null,
    branchId: txn.branchId,
    branch: scope.branchNames[String(txn.branchId)] ?? txn.branchId,
    orderId: txn.orderId ?? null,
    orderNumber: txn.orderNumber ?? null,
    creditAmountKobo: txn.transactionType === "credit_sale" ? positiveInt(txn.amountKobo) : 0,
    creditReductionKobo: txn.transactionType === "credit_correction" ? positiveInt(txn.amountKobo) : 0,
    outstandingBalanceKobo: positiveInt(txn.outstandingBalanceAfterKobo),
    createdDate: iso(txn.createdAt),
    lastUpdate: iso(txn.createdAt),
    status: txn.transactionType,
  }));
  const page = paginate(rows, input.pageSize, input.pageCursor);
  return {
    summary: {
      totalCreditSalesKobo: rows.reduce((sum, row) => sum + positiveInt(row.creditAmountKobo), 0),
      totalOutstandingBalanceKobo: rows.reduce((sum, row) => Math.max(sum, positiveInt(row.outstandingBalanceKobo)), 0),
      creditReductionsKobo: rows.reduce((sum, row) => sum + positiveInt(row.creditReductionKobo), 0),
      topCustomersByOutstandingBalance: [],
    },
    rows: page.rows,
    nextPageCursor: page.nextPageCursor,
    generatedAt: new Date().toISOString(),
    branchScope: scope.branchScope,
    branchIds: scope.branchIds,
    sensitiveFieldsIncluded: false,
  };
}

async function staffActivityReport(actor: ActorProfile, input: ReportInput): Promise<ReportResult> {
  const range = parseDateRange(input);
  if (range.days > detailRangeLimitDays) throw new HttpsError("invalid-argument", "Staff activity report date range is too large.");
  const operational = operationalRoles.includes(actor.platformRole);
  const scope = await resolveBranchScope(actor, input);
  if (operational && input.branchScope === "all_branches") {
    throw new HttpsError("permission-denied", "All-branch activity requires admin access.");
  }
  let logs = await queryAuditLogs(range, scope.branchIds);
  logs = logs.filter((log) => {
    if (operational && log.actorId !== actor.uid) return false;
    if (typeof input.filters.userId === "string" && log.actorId !== input.filters.userId) return false;
    if (typeof input.filters.actionType === "string" && !text(log.action).includes(input.filters.actionType)) return false;
    if (typeof input.filters.role === "string" && log.actorRole !== input.filters.role) return false;
    return true;
  });
  const rows = logs.map((log) => ({
    activityId: log.id,
    date: iso(log.createdAt),
    branchId: log.branchId ?? null,
    branch: log.branchId ? scope.branchNames[String(log.branchId)] ?? log.branchId : null,
    userId: log.actorId,
    role: log.actorRole,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
  }));
  const countsByAction = rows.reduce<Record<string, number>>((acc, row) => {
    const action = text(row.action, "unknown");
    acc[action] = (acc[action] ?? 0) + 1;
    return acc;
  }, {});
  const page = paginate(rows, input.pageSize, input.pageCursor);
  return {
    summary: {
      activityCount: rows.length,
      countsByAction,
      ownActivityOnly: operational,
    },
    rows: page.rows,
    nextPageCursor: page.nextPageCursor,
    generatedAt: new Date().toISOString(),
    branchScope: scope.branchScope,
    branchIds: scope.branchIds,
    sensitiveFieldsIncluded: false,
  };
}

async function lowStockReport(actor: ActorProfile, input: ReportInput) {
  return inventoryReport(actor, { ...input, filters: { ...input.filters, lowStockOnly: true } }, true);
}

async function dashboardSummary(actor: ActorProfile, input: ReportInput): Promise<ReportResult> {
  const range = parseDateRange(input, "today");
  const scope = await resolveBranchScope(actor, input);
  if (managementRoles.includes(actor.platformRole)) {
    const [sales, payments, reversals, inventory] = await Promise.all([
      salesReport(actor, { ...input, startDate: range.startDate, endDate: range.endDate, branchScope: scope.branchScope, branchId: scope.requestedBranchId }, "today"),
      paymentReport(actor, { ...input, startDate: range.startDate, endDate: range.endDate, branchScope: scope.branchScope, branchId: scope.requestedBranchId }),
      reversalReport(actor, { ...input, startDate: range.startDate, endDate: range.endDate, branchScope: scope.branchScope, branchId: scope.requestedBranchId }),
      inventoryReport(actor, { ...input, branchScope: scope.branchScope, branchId: scope.requestedBranchId, pageSize: 100 }),
    ]);
    const pendingOrders = (await queryOrders(range, scope.branchIds)).filter((order) => order.status === "awaiting_payment").length;
    const paidUnreleasedOrders = (await queryOrders(range, scope.branchIds)).filter((order) => order.status === "awaiting_release").length;
    return {
      summary: {
        salesTodayKobo: positiveInt(sales.summary.netCompletedSalesKobo),
        completedOrdersToday: positiveInt(sales.summary.completedOrderCount),
        pendingUnpaidOrders: pendingOrders,
        paidButUnreleasedOrders: paidUnreleasedOrders,
        cashReceivedKobo: positiveInt(payments.summary.cashTotalKobo),
        transferReceivedKobo: positiveInt(payments.summary.transferTotalKobo),
        posReceivedKobo: positiveInt(payments.summary.posTotalKobo),
        creditSalesKobo: positiveInt(payments.summary.creditTotalKobo),
        reversalRefundValueKobo: positiveInt(reversals.summary.refundAmountKobo),
        lowStockCount: positiveInt(inventory.summary.lowStockCount),
        inventoryValueKobo: includeSensitiveFinancials(actor) ? positiveInt(inventory.summary.stockValueKobo) : undefined,
        branchComparison: scope.branchScope === "all_branches" ? buildBranchComparison(sales.rows, payments.rows) : [],
      },
      rows: [],
      nextPageCursor: null,
      generatedAt: new Date().toISOString(),
      branchScope: scope.branchScope,
      branchIds: scope.branchIds,
      sensitiveFieldsIncluded: includeSensitiveFinancials(actor),
    };
  }

  const activity = await staffActivityReport(actor, { ...input, startDate: range.startDate, endDate: range.endDate, branchScope: scope.branchScope, branchId: scope.requestedBranchId });
  return {
    summary: {
      ownActivityToday: positiveInt(activity.summary.activityCount),
      assignedBranchIds: actor.assignedBranchIds,
      role: actor.platformRole,
    },
    rows: activity.rows.slice(0, 10),
    nextPageCursor: null,
    generatedAt: new Date().toISOString(),
    branchScope: scope.branchScope,
    branchIds: scope.branchIds,
    sensitiveFieldsIncluded: false,
  };
}

function buildBranchComparison(salesRows: Record<string, unknown>[], paymentRows: Record<string, unknown>[]) {
  const byBranch = new Map<string, { branchId: string; branch: unknown; salesKobo: number; receivedKobo: number }>();
  for (const row of salesRows) {
    const branchId = String(row.branchId);
    const existing = byBranch.get(branchId) ?? { branchId, branch: row.branch, salesKobo: 0, receivedKobo: 0 };
    existing.salesKobo += positiveInt(row.totalKobo);
    byBranch.set(branchId, existing);
  }
  for (const row of paymentRows) {
    const branchId = String(row.branchId);
    const existing = byBranch.get(branchId) ?? { branchId, branch: row.branch, salesKobo: 0, receivedKobo: 0 };
    if (row.paymentMethod !== "credit") existing.receivedKobo += positiveInt(row.amountKobo);
    byBranch.set(branchId, existing);
  }
  return Array.from(byBranch.values());
}

async function runReport(actor: ActorProfile, reportType: ReportType, input: ReportInput) {
  switch (reportType) {
    case "dashboard":
      return dashboardSummary(actor, input);
    case "sales":
      return salesReport(actor, input);
    case "payments":
      return paymentReport(actor, input);
    case "inventory":
      return inventoryReport(actor, input);
    case "stock_movements":
      return stockMovementReport(actor, input);
    case "reversals":
      return reversalReport(actor, input);
    case "credit":
      return creditReport(actor, input);
    case "staff_activity":
      return staffActivityReport(actor, input);
    case "low_stock":
      return lowStockReport(actor, input);
  }
}

function csvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function toCsv(rows: Record<string, unknown>[], metadata: Record<string, unknown>) {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [
    ["generatedAt", metadata.generatedAt],
    ["generatedBy", metadata.generatedBy],
    ["reportType", metadata.reportType],
    ["branchScope", metadata.branchScope],
    ["dateRange", metadata.dateRange],
    [],
    keys,
    ...rows.map((row) => keys.map((key) => csvValue(row[key]))),
  ];
  return lines.map((line) => line.map(csvValue).join(",")).join("\n");
}

function fileSafe(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function getDashboardSummaryAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  return dashboardSummary(actor, dashboardSummarySchema.parse(input));
}

export async function getSalesReportAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  return salesReport(actor, reportInputSchema.parse(input));
}

export async function getPaymentReportAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  return paymentReport(actor, reportInputSchema.parse(input));
}

export async function getInventoryReportAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  return inventoryReport(actor, reportInputSchema.parse(input));
}

export async function getStockMovementReportAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  return stockMovementReport(actor, reportInputSchema.parse(input));
}

export async function getReversalReportAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  return reversalReport(actor, reportInputSchema.parse(input));
}

export async function getCreditReportAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  return creditReport(actor, reportInputSchema.parse(input));
}

export async function getStaffActivityReportAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  return staffActivityReport(actor, reportInputSchema.parse(input));
}

export async function getLowStockReportAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  return lowStockReport(actor, reportInputSchema.parse(input));
}

export async function exportReportAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  const data: ExportReportInput = exportReportSchema.parse(input);
  const range = parseDateRange(data);
  if (range.days > exportRangeLimitDays) {
    throw new HttpsError("invalid-argument", "Exports are limited to 31 days.");
  }
  const report = await runReport(actor, data.reportType, { ...data, pageSize: 500 });
  const csv = toCsv(report.rows, {
    generatedAt: report.generatedAt,
    generatedBy: actor.uid,
    reportType: data.reportType,
    branchScope: report.branchScope,
    dateRange: `${range.startDate} to ${range.endDate}`,
  });
  const branchPart = data.branchScope === "all_branches" ? "all-branches" : fileSafe(data.branchId ?? actor.assignedBranchIds[0] ?? "branch");
  return {
    fileName: `${fileSafe(data.reportType)}-report-${branchPart}-${range.startDate}-to-${range.endDate}.csv`,
    contentType: "text/csv",
    content: csv,
    rowCount: report.rows.length,
    generatedAt: report.generatedAt,
  };
}

export async function rebuildReportSummariesAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureRole(actor, adminRoles);
  const data = rebuildReportSummariesSchema.parse(input);
  const range = parseDateRange(data);
  if (range.days > detailRangeLimitDays) {
    throw new HttpsError("invalid-argument", "Summary rebuild range is too large.");
  }
  const scope = await resolveBranchScope(actor, data);
  const dashboard = await dashboardSummary(actor, { ...data, filters: {} });
  return {
    generatedBy: "manual",
    branchScope: scope.branchScope,
    branchIds: scope.branchIds,
    periodStart: range.startDate,
    periodEnd: range.endDate,
    summary: dashboard.summary,
    updatedAt: new Date().toISOString(),
  };
}
