import { HttpsError } from "firebase-functions/v2/https";
import { ZodError } from "zod";

export function toHttpsError(error: unknown): HttpsError {
  if (error instanceof HttpsError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new HttpsError("invalid-argument", "Invalid request.");
  }

  return new HttpsError("internal", "Unable to complete request.");
}

export function permissionDenied(message = "You do not have permission.") {
  return new HttpsError("permission-denied", message);
}
