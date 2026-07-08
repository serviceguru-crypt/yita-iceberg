import { onCall } from "firebase-functions/v2/https";

import { toHttpsError } from "../shared/errors";
import {
  exportReportAction,
  getCreditReportAction,
  getDashboardSummaryAction,
  getInventoryReportAction,
  getLowStockReportAction,
  getPaymentReportAction,
  getReversalReportAction,
  getSalesReportAction,
  getStaffActivityReportAction,
  getStockMovementReportAction,
  rebuildReportSummariesAction,
} from "./service";

export const getDashboardSummary = onCall(async (request) => {
  try {
    return await getDashboardSummaryAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getSalesReport = onCall(async (request) => {
  try {
    return await getSalesReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getPaymentReport = onCall(async (request) => {
  try {
    return await getPaymentReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getInventoryReport = onCall(async (request) => {
  try {
    return await getInventoryReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getStockMovementReport = onCall(async (request) => {
  try {
    return await getStockMovementReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getReversalReport = onCall(async (request) => {
  try {
    return await getReversalReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getCreditReport = onCall(async (request) => {
  try {
    return await getCreditReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getStaffActivityReport = onCall(async (request) => {
  try {
    return await getStaffActivityReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getLowStockReport = onCall(async (request) => {
  try {
    return await getLowStockReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const exportReport = onCall(async (request) => {
  try {
    return await exportReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const rebuildReportSummaries = onCall(async (request) => {
  try {
    return await rebuildReportSummariesAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});
