import { onCall } from "firebase-functions/v2/https";

import { toHttpsError } from "../shared/errors";
import { callableOptions, sensitiveCallableOptions } from "../shared/runtime";
import {
  administerSaleAction,
  approveDiscountAction,
  cancelOrderAction,
  confirmPaymentAction,
  createPaymentProofUploadIntentAction,
  createOrderAction,
  reissueOrderQrTokenAction,
  requestDiscountApprovalAction,
  updateUnpaidOrderAction,
  validateReleaseQrAction,
  verifyAndCompleteReleaseAction,
} from "./service";

export const administerSale = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await administerSaleAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const createOrder = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await createOrderAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const createPaymentProofUploadIntent = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await createPaymentProofUploadIntentAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const reissueOrderQrToken = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await reissueOrderQrTokenAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const validateReleaseQr = onCall(callableOptions(), async (request) => {
  try {
    return await validateReleaseQrAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const updateUnpaidOrder = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await updateUnpaidOrderAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const cancelOrder = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await cancelOrderAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const requestDiscountApproval = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await requestDiscountApprovalAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const approveDiscount = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await approveDiscountAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const confirmPayment = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await confirmPaymentAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const verifyAndCompleteRelease = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await verifyAndCompleteReleaseAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});
