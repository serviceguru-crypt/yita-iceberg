import { HttpsError } from "firebase-functions/v2/https";
import { ZodError } from "zod";

import { logError, logWarn } from "./logging";

export function toHttpsError(error: unknown): HttpsError {
  if (error instanceof HttpsError) {
    if (error.code === "internal" || error.code === "unknown") {
      const reference = logError("callable.https_error", error);
      return new HttpsError(error.code, `${error.message} Reference: ${reference}`);
    }
    logWarn("callable.rejected", { code: error.code, message: error.message });
    return error;
  }

  if (error instanceof ZodError) {
    logWarn("callable.validation_failed", { issues: error.issues });
    return new HttpsError("invalid-argument", "Invalid request.");
  }

  const reference = logError("callable.unhandled_error", error);
  return new HttpsError("internal", `Unable to complete request. Reference: ${reference}`);
}

export function permissionDenied(message = "You do not have permission.") {
  return new HttpsError("permission-denied", message);
}
