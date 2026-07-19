import { onCall } from "firebase-functions/v2/https";

import { toHttpsError } from "../shared/errors";
import { sensitiveCallableOptions } from "../shared/runtime";
import {
  addBranchProductAction,
  approveInventoryAdjustmentAction,
  approveStockCountAction,
  archiveProductAction,
  createProductAction,
  recordAllocationStockReceiptAction,
  recordStockReceiptAction,
  rejectInventoryAdjustmentAction,
  rejectStockCountAction,
  requestInventoryAdjustmentAction,
  startStockCountAction,
  submitStockCountAction,
  updateBranchProductPricingAction,
  updateBranchProductSettingsAction,
  updateProductAction,
} from "./service";

function callable(handler: (uid: string | undefined, data: unknown) => Promise<unknown>) {
  return onCall(sensitiveCallableOptions(), async (request) => {
    try {
      return await handler(request.auth?.uid, request.data);
    } catch (error) {
      throw toHttpsError(error);
    }
  });
}

export const createProduct = callable(createProductAction);
export const updateProduct = callable(updateProductAction);
export const archiveProduct = callable(archiveProductAction);
export const addBranchProduct = callable(addBranchProductAction);
export const updateBranchProductSettings = callable(updateBranchProductSettingsAction);
export const updateBranchProductPricing = callable(updateBranchProductPricingAction);
export const recordAllocationStockReceipt = callable(recordAllocationStockReceiptAction);
export const recordStockReceipt = callable(recordStockReceiptAction);
export const requestInventoryAdjustment = callable(requestInventoryAdjustmentAction);
export const approveInventoryAdjustment = callable(approveInventoryAdjustmentAction);
export const rejectInventoryAdjustment = callable(rejectInventoryAdjustmentAction);
export const startStockCount = callable(startStockCountAction);
export const submitStockCount = callable(submitStockCountAction);
export const approveStockCount = callable(approveStockCountAction);
export const rejectStockCount = callable(rejectStockCountAction);
