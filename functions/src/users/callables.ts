import { onCall } from "firebase-functions/v2/https";

import { toHttpsError } from "../shared/errors";
import {
  deactivateUserAction,
  provisionUserAction,
  reactivateUserAction,
  updateUserAccessAction,
  updateUserProfileAction,
} from "./service";

export const provisionUser = onCall(async (request) => {
  try {
    return await provisionUserAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const updateUserProfile = onCall(async (request) => {
  try {
    return await updateUserProfileAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const updateUserAccess = onCall(async (request) => {
  try {
    return await updateUserAccessAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const deactivateUser = onCall(async (request) => {
  try {
    return await deactivateUserAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const reactivateUser = onCall(async (request) => {
  try {
    return await reactivateUserAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});
