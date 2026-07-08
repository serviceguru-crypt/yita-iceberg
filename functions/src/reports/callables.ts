import { onCall } from "firebase-functions/v2/https";

import { toHttpsError } from "../shared/errors";
import { callableOptions, sensitiveCallableOptions } from "../shared/runtime";
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

export const getDashboardSummary = onCall(callableOptions(), async (request) => {
  try {
    return await getDashboardSummaryAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getSalesReport = onCall(callableOptions(), async (request) => {
  try {
    return await getSalesReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getPaymentReport = onCall(callableOptions(), async (request) => {
  try {
    return await getPaymentReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getInventoryReport = onCall(callableOptions(), async (request) => {
  try {
    return await getInventoryReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getStockMovementReport = onCall(callableOptions(), async (request) => {
  try {
    return await getStockMovementReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getReversalReport = onCall(callableOptions(), async (request) => {
  try {
    return await getReversalReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getCreditReport = onCall(callableOptions(), async (request) => {
  try {
    return await getCreditReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getStaffActivityReport = onCall(callableOptions(), async (request) => {
  try {
    return await getStaffActivityReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getLowStockReport = onCall(callableOptions(), async (request) => {
  try {
    return await getLowStockReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const exportReport = onCall(sensitiveCallableOptions({ timeoutSeconds: 120 }), async (request) => {
  try {
    return await exportReportAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const rebuildReportSummaries = onCall(sensitiveCallableOptions({ timeoutSeconds: 120 }), async (request) => {
  try {
    return await rebuildReportSummariesAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});
