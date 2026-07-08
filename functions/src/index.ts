import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2/options";

export { createCustomer, updateCustomer } from "./customers/callables";
export {
  addBranchProduct,
  approveInventoryAdjustment,
  approveStockCount,
  archiveProduct,
  createProduct,
  recordStockReceipt,
  rejectInventoryAdjustment,
  rejectStockCount,
  requestInventoryAdjustment,
  startStockCount,
  submitStockCount,
  updateBranchProductPricing,
  updateBranchProductSettings,
  updateProduct,
} from "./inventory/callables";
export {
  approveDiscount,
  cancelOrder,
  confirmPayment,
  createPaymentProofUploadIntent,
  createOrder,
  reissueOrderQrToken,
  requestDiscountApproval,
  updateUnpaidOrder,
  validateReleaseQr,
  verifyAndCompleteRelease,
} from "./orders/callables";
export { expireStaleOrders } from "./orders/scheduled";
export {
  deactivateUser,
  provisionUser,
  reactivateUser,
  updateUserAccess,
  updateUserProfile,
} from "./users/callables";

initializeApp();

setGlobalOptions({
  maxInstances: 10,
  region: "us-central1",
});

// Sales, payments, orders, inventory, and reversal functions begin in Phase 4.
