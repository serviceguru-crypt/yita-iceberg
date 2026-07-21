import type { CallableOptions } from "firebase-functions/v2/https";

function readBoolean(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return value === "true";
}

function readInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function functionRegion() {
  return process.env.DEFAULT_FUNCTION_REGION || "us-central1";
}

export function appCheckEnforcementEnabled() {
  if (process.env.FUNCTIONS_EMULATOR === "true" || process.env.FIRESTORE_EMULATOR_HOST) {
    return false;
  }
  return readBoolean(process.env.ENABLE_APP_CHECK_ENFORCEMENT);
}

export function reportSummaryRebuildEnabled() {
  return readBoolean(process.env.ENABLE_REPORT_SUMMARY_REBUILD);
}

export function maxReportExportDays() {
  return readInt(process.env.MAX_REPORT_EXPORT_DAYS, 31);
}

export function maxDetailReportDays() {
  return readInt(process.env.MAX_DETAIL_REPORT_DAYS, 93);
}

export function callableOptions(overrides: Partial<CallableOptions> = {}): CallableOptions {
  return {
    enforceAppCheck: appCheckEnforcementEnabled(),
    invoker: "public",
    memory: "512MiB",
    timeoutSeconds: 60,
    ...overrides,
  };
}

export function sensitiveCallableOptions(overrides: Partial<CallableOptions> = {}): CallableOptions {
  return callableOptions({
    consumeAppCheckToken: appCheckEnforcementEnabled(),
    timeoutSeconds: 90,
    ...overrides,
  });
}
