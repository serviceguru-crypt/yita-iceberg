import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2/options";

import { functionRegion } from "./shared/runtime";

export { createCustomer, updateCustomer } from "./customers/callables";
export {
  addBranchProduct,
  approveInventoryAdjustment,
  approveStockCount,
  archiveProduct,
  createProduct,
  recordAllocationStockReceipt,
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
  administerSale,
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
export {
  approveReversalRequest,
  cancelReversalRequest,
  completeApprovedReversal,
  createReversalRequest,
  getReversalPreview,
  rejectReversalRequest,
} from "./reversals/callables";
export {
  exportReport,
  getCreditReport,
  getDashboardSummary,
  getInventoryReport,
  getLowStockReport,
  getPaymentReport,
  getReversalReport,
  getSalesReport,
  getStaffActivityReport,
  getStockMovementReport,
  rebuildReportSummaries,
} from "./reports/callables";
export { expireStaleOrders } from "./orders/scheduled";
export { rebuildReportSummariesScheduled } from "./reports/scheduled";
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
  region: functionRegion(),
  memory: "512MiB",
  timeoutSeconds: 60,
});

// Sales, payments, orders, inventory, and reversal functions begin in Phase 4.
