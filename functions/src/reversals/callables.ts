import { onCall } from "firebase-functions/v2/https";

import { toHttpsError } from "../shared/errors";
import { callableOptions, sensitiveCallableOptions } from "../shared/runtime";
import {
  approveReversalRequestAction,
  cancelReversalRequestAction,
  completeApprovedReversalAction,
  createReversalRequestAction,
  getReversalPreviewAction,
  rejectReversalRequestAction,
} from "./service";

function callable(
  handler: (uid: string | undefined, data: unknown) => Promise<unknown>,
  sensitive = true,
) {
  return onCall(sensitive ? sensitiveCallableOptions() : callableOptions(), async (request) => {
    try {
      return await handler(request.auth?.uid, request.data);
    } catch (error) {
      throw toHttpsError(error);
    }
  });
}

export const getReversalPreview = callable(getReversalPreviewAction, false);
export const createReversalRequest = callable(createReversalRequestAction);
export const approveReversalRequest = callable(approveReversalRequestAction);
export const rejectReversalRequest = callable(rejectReversalRequestAction);
export const cancelReversalRequest = callable(cancelReversalRequestAction);
export const completeApprovedReversal = callable(completeApprovedReversalAction);
