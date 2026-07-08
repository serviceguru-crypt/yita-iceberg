import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { z } from "zod";

import { assertProductionGuardFromEnv } from "./shared/confirm-production";

const envSchema = z.object({
  APP_ENV: z.enum(["local", "staging", "production"]).default("staging"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  FIREBASE_PROJECT_ID: z.string().min(1).default("yita-iceberg-dev"),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1).default("dry-run-api-key"),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1).default("localhost"),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1).default("yita-iceberg-dev.appspot.com"),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1).default("000000000000"),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1).default("1:000000000000:web:dryrun"),
  DEFAULT_FUNCTION_REGION: z.string().default("us-central1"),
  SMOKE_TEST_EMAIL: z.string().email().optional(),
  SMOKE_TEST_PASSWORD: z.string().min(1).optional(),
  SMOKE_TEST_DRY_RUN: z.string().optional(),
});

function hasArg(name: string) {
  return process.argv.includes(name);
}

async function expectOk(url: string) {
  const response = await fetch(url, { redirect: "manual" });
  if (response.status >= 500) {
    throw new Error(`Smoke check failed for ${url}: ${response.status}`);
  }
  return response.status;
}

async function main() {
  const env = envSchema.parse(process.env);
  const dryRun = hasArg("--dry-run") || env.SMOKE_TEST_DRY_RUN === "true";

  assertProductionGuardFromEnv({
    confirmationEnv: "SMOKE_TEST_PRODUCTION_CONFIRMATION",
    allowEnv: "SMOKE_TEST_ALLOW_PRODUCTION",
    requiredConfirmation: "RUN_SMOKE_TESTS_AGAINST_PRODUCTION",
  });

  console.log(`Smoke test target: ${env.APP_ENV} (${env.FIREBASE_PROJECT_ID})`);
  console.log(`Dry run: ${dryRun ? "yes" : "no"}`);

  if (dryRun) {
    console.log("Dry run complete. No authenticated or write-capable checks were executed.");
    return;
  }

  const rootStatus = await expectOk(env.APP_BASE_URL);
  const signInStatus = await expectOk(`${env.APP_BASE_URL}/sign-in`);
  const dashboardStatus = await expectOk(`${env.APP_BASE_URL}/dashboard`);
  console.log(`HTTP checks: / ${rootStatus}, /sign-in ${signInStatus}, /dashboard ${dashboardStatus}`);

  if (!env.SMOKE_TEST_EMAIL || !env.SMOKE_TEST_PASSWORD) {
    console.log("No SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD provided; skipping authenticated callable checks.");
    return;
  }

  const app = initializeApp({
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, env.SMOKE_TEST_EMAIL, env.SMOKE_TEST_PASSWORD);
  const getDashboardSummary = httpsCallable(getFunctions(app, env.DEFAULT_FUNCTION_REGION), "getDashboardSummary");
  await getDashboardSummary({
    branchScope: "selected_branch",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    filters: {},
  });
  await signOut(auth);
  console.log("Authenticated dashboard callable smoke check passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Smoke test failed.");
  process.exit(1);
});
