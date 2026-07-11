import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  appEnv: z.enum(["local", "staging", "production"]).default("local"),
  appBaseUrl: z.string().url().optional(),
  firebaseProjectId: z.string().min(1),
  firebaseClientEmail: z.string().optional(),
  firebasePrivateKey: z.string().optional(),
  firebaseServiceAccountJson: z.string().optional(),
  firebaseServiceAccountFile: z.string().optional(),
  firebaseStorageBucket: z.string().optional(),
  sessionCookieName: z.string().min(1).default("__session"),
  sessionCookieMaxAgeDays: z.number().int().positive().default(5),
  defaultFunctionRegion: z.string().min(1).default("us-central1"),
  enableAppCheckEnforcement: z.boolean().default(false),
  enableReportSummaryRebuild: z.boolean().default(false),
  maxReportExportDays: z.number().int().positive().default(31),
  maxDetailReportDays: z.number().int().positive().default(93),
}).superRefine((env, ctx) => {
  if (env.appEnv === "production") {
    if (!env.appBaseUrl) {
      ctx.addIssue({ code: "custom", message: "APP_BASE_URL is required in production." });
    }
    if (
      !env.firebaseServiceAccountJson &&
      !env.firebaseServiceAccountFile &&
      !(env.firebaseClientEmail && env.firebasePrivateKey)
    ) {
      ctx.addIssue({ code: "custom", message: "Production requires Firebase Admin credentials." });
    }
  }
});

function readBoolean(value: string | undefined) {
  return value === "true";
}

function readInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getServerEnv() {
  return serverEnvSchema.parse({
    appEnv: process.env.APP_ENV,
    appBaseUrl: process.env.APP_BASE_URL,
    firebaseProjectId:
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      "yita-iceberg-dev",
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY,
    firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    firebaseServiceAccountFile: process.env.FIREBASE_SERVICE_ACCOUNT_FILE,
    firebaseStorageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    sessionCookieName: process.env.SESSION_COOKIE_NAME,
    sessionCookieMaxAgeDays: readInt(process.env.SESSION_COOKIE_MAX_AGE_DAYS, 5),
    defaultFunctionRegion: process.env.DEFAULT_FUNCTION_REGION,
    enableAppCheckEnforcement: readBoolean(process.env.ENABLE_APP_CHECK_ENFORCEMENT),
    enableReportSummaryRebuild: readBoolean(process.env.ENABLE_REPORT_SUMMARY_REBUILD),
    maxReportExportDays: readInt(process.env.MAX_REPORT_EXPORT_DAYS, 31),
    maxDetailReportDays: readInt(process.env.MAX_DETAIL_REPORT_DAYS, 93),
  });
}
