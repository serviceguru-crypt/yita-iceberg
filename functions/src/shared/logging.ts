import { randomBytes } from "node:crypto";

import { logger } from "firebase-functions";

const sensitiveKeyPattern = /(password|token|cookie|privatekey|private_key|qr|proofstoragepath|storagepath|authorization|secret)/i;

export function errorReference(prefix = "ERR") {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[REDACTED]" : redactSensitive(nested),
      ]),
    );
  }

  return value;
}

export function logInfo(eventName: string, metadata: Record<string, unknown> = {}) {
  logger.info(eventName, redactSensitive(metadata));
}

export function logWarn(eventName: string, metadata: Record<string, unknown> = {}) {
  logger.warn(eventName, redactSensitive(metadata));
}

export function logError(eventName: string, error: unknown, metadata: Record<string, unknown> = {}) {
  const reference = errorReference();
  const message = error instanceof Error ? error.message : "Unknown error";
  logger.error(eventName, {
    ...redactSensitive(metadata) as Record<string, unknown>,
    reference,
    errorMessage: message,
  });
  return reference;
}
