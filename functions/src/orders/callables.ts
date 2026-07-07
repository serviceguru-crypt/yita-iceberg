import { onCall } from "firebase-functions/v2/https";

import { toHttpsError } from "../shared/errors";
import {
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

export const createOrder = onCall(async (request) => {
  try {
    return await createOrderAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const createPaymentProofUploadIntent = onCall(async (request) => {
  try {
    return await createPaymentProofUploadIntentAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const reissueOrderQrToken = onCall(async (request) => {
  try {
    return await reissueOrderQrTokenAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const validateReleaseQr = onCall(async (request) => {
  try {
    return await validateReleaseQrAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const updateUnpaidOrder = onCall(async (request) => {
  try {
    return await updateUnpaidOrderAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const cancelOrder = onCall(async (request) => {
  try {
    return await cancelOrderAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const requestDiscountApproval = onCall(async (request) => {
  try {
    return await requestDiscountApprovalAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const approveDiscount = onCall(async (request) => {
  try {
    return await approveDiscountAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const confirmPayment = onCall(async (request) => {
  try {
    return await confirmPaymentAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const verifyAndCompleteRelease = onCall(async (request) => {
  try {
    return await verifyAndCompleteReleaseAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});
