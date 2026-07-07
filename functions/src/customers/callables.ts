import { onCall } from "firebase-functions/v2/https";

import { toHttpsError } from "../shared/errors";
import { createCustomerAction, updateCustomerAction } from "./service";

export const createCustomer = onCall(async (request) => {
  try {
    return await createCustomerAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const updateCustomer = onCall(async (request) => {
  try {
    return await updateCustomerAction(request.auth?.uid, request.data);
  } catch (error) {
    throw toHttpsError(error);
  }
});
