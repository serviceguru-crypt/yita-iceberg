import { onCall } from "firebase-functions/v2/https";

import { toHttpsError } from "../shared/errors";
import { sensitiveCallableOptions } from "../shared/runtime";
import {
  deactivateUserAction,
  provisionUserAction,
  reactivateUserAction,
  updateUserAccessAction,
  updateUserProfileAction,
} from "./service";

export const provisionUser = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await provisionUserAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const updateUserProfile = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await updateUserProfileAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const updateUserAccess = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await updateUserAccessAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const deactivateUser = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await deactivateUserAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const reactivateUser = onCall(sensitiveCallableOptions(), async (request) => {
  try {
    return await reactivateUserAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});
