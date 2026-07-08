import { onCall } from "firebase-functions/v2/https";

import { toHttpsError } from "../shared/errors";
import {
  approveReversalRequestAction,
  cancelReversalRequestAction,
  completeApprovedReversalAction,
  createReversalRequestAction,
  getReversalPreviewAction,
  rejectReversalRequestAction,
} from "./service";

function callable(handler: (uid: string | undefined, data: unknown) => Promise<unknown>) {
  return onCall(async (request) => {
    try {
      return await handler(request.auth?.uid, request.data);
    } catch (error) {
      throw toHttpsError(error);
    }
  });
}

export const getReversalPreview = callable(getReversalPreviewAction);
export const createReversalRequest = callable(createReversalRequestAction);
export const approveReversalRequest = callable(approveReversalRequestAction);
export const rejectReversalRequest = callable(rejectReversalRequestAction);
export const cancelReversalRequest = callable(cancelReversalRequestAction);
export const completeApprovedReversal = callable(completeApprovedReversalAction);
