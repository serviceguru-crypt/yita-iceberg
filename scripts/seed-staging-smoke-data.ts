import { readFileSync } from "node:fs";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";

import { isProductionTarget } from "./shared/confirm-production";

const envSchema = z.object({
  APP_ENV: z.literal("staging"),
  FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_FILE: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  STAGING_SEED_CONFIRM: z.string().optional(),
  STAGING_SEED_DRY_RUN: z.string().optional(),
  STAGING_SEED_PASSWORD: z.string().optional(),
  STAGING_SEED_RESET_PASSWORDS: z.string().optional(),
  STAGING_SEED_EMAIL_DOMAIN: z.string().default("example.test"),
});

type SeedUser = {
  uid: string;
  email: string;
  displayName: string;
  platformRole: string;
  assignedBranchIds: string[];
};

const branchId = "staging-test-branch-a";
const productId = "staging-test-product-ice-block";
const customerId = "staging-test-customer-a";

function initializeAdmin(projectId: string) {
  if (getApps().length > 0) return;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)), projectId });
    return;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_FILE) {
    initializeApp({
      credential: cert(JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, "utf8"))),
      projectId,
    });
    return;
  }

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
      projectId,
    });
    return;
  }

  initializeApp({ credential: applicationDefault(), projectId });
}

function userList(domain: string): SeedUser[] {
  return [
    {
      uid: "staging-smoke-super-admin",
      email: `smoke.super-admin@${domain}`,
      displayName: "SMOKE TEST Super Admin",
      platformRole: "super_admin",
      assignedBranchIds: [],
    },
    {
      uid: "staging-smoke-branch-manager",
      email: `smoke.branch-manager@${domain}`,
      displayName: "SMOKE TEST Branch Manager",
      platformRole: "branch_manager",
      assignedBranchIds: [branchId],
    },
    {
      uid: "staging-smoke-registrar",
      email: `smoke.registrar@${domain}`,
      displayName: "SMOKE TEST Registrar",
      platformRole: "order_registrar",
      assignedBranchIds: [branchId],
    },
    {
      uid: "staging-smoke-cashier",
      email: `smoke.cashier@${domain}`,
      displayName: "SMOKE TEST Cashier",
      platformRole: "cashier",
      assignedBranchIds: [branchId],
    },
    {
      uid: "staging-smoke-release-verifier",
      email: `smoke.release-verifier@${domain}`,
      displayName: "SMOKE TEST Release Verifier",
      platformRole: "release_verifier",
      assignedBranchIds: [branchId],
    },
  ];
}

async function upsertUser(user: SeedUser, password: string, resetPassword: boolean) {
  const auth = getAuth();
  try {
    await auth.getUser(user.uid);
    await auth.updateUser(user.uid, {
      email: user.email,
      displayName: user.displayName,
      disabled: false,
      emailVerified: true,
      ...(resetPassword ? { password } : {}),
    });
  } catch {
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      disabled: false,
      emailVerified: true,
      password,
    });
  }

  await auth.setCustomUserClaims(user.uid, {
    platformRole: user.platformRole,
    isActive: true,
  });
}

async function main() {
  const env = envSchema.parse(process.env);
  const projectId = env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apply = process.argv.includes("--apply") || env.STAGING_SEED_DRY_RUN === "false";
  const dryRun = !apply;

  if (isProductionTarget({ appEnv: env.APP_ENV, projectId })) {
    throw new Error("Refusing to seed a production-looking project.");
  }
  if (projectId !== "yita-iceberg-staging") {
    throw new Error(`Refusing to seed unexpected staging project: ${projectId}.`);
  }
  if (env.FIRESTORE_EMULATOR_HOST && !dryRun) {
    throw new Error("Refusing staging seed while FIRESTORE_EMULATOR_HOST is set.");
  }
  if (!dryRun && env.STAGING_SEED_CONFIRM !== "true") {
    throw new Error("Set STAGING_SEED_CONFIRM=true before writing staging smoke data.");
  }
  if (!dryRun && !env.STAGING_SEED_PASSWORD) {
    throw new Error("Set STAGING_SEED_PASSWORD before writing staging smoke users.");
  }

  const users = userList(env.STAGING_SEED_EMAIL_DOMAIN);
  console.log(`Staging seed target: ${projectId}`);
  console.log(`Dry run: ${dryRun ? "yes" : "no"}`);
  console.log(`Branch: ${branchId}`);
  console.log(`Product: ${productId}`);
  console.log(`Customer: ${customerId}`);
  console.log(`Users: ${users.map((user) => user.email).join(", ")}`);

  if (dryRun) {
    console.log("Dry run complete. No Firebase writes were executed.");
    return;
  }

  initializeAdmin(projectId);
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const password = env.STAGING_SEED_PASSWORD as string;
  const resetPassword = env.STAGING_SEED_RESET_PASSWORDS === "true";

  await Promise.all(users.map((user) => upsertUser(user, password, resetPassword)));

  await db.doc(`branches/${branchId}`).set({
    name: "SMOKE TEST Branch A",
    code: "SMOKE-A",
    isActive: true,
    settings: {
      orderExpiryMinutes: 60,
      registrarMaximumDiscountPercent: 5,
      managerApprovalThresholdPercent: 10,
      requireDiscountReason: false,
      requireTransferProof: false,
      allowCreditSales: true,
      allowSplitPayments: true,
    },
    createdAt: now,
    updatedAt: now,
    createdBy: "staging-smoke-seed",
    updatedBy: "staging-smoke-seed",
  }, { merge: true });

  await db.doc(`products/${productId}`).set({
    sku: "SMOKE-ICE-BLOCK",
    name: "SMOKE TEST Ice Block",
    unit: "block",
    description: "Staging smoke-test product.",
    categoryId: null,
    barcode: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: "staging-smoke-seed",
    updatedBy: "staging-smoke-seed",
  }, { merge: true });

  await db.doc("productUniqueSkus/smoke-ice-block").set({
    productId,
    sku: "SMOKE-ICE-BLOCK",
    updatedAt: now,
  }, { merge: true });

  await Promise.all([
    db.doc(`branches/${branchId}/products/${productId}`).set({
      productId,
      sku: "SMOKE-ICE-BLOCK",
      name: "SMOKE TEST Ice Block",
      description: "Staging smoke-test product.",
      categoryId: null,
      unit: "block",
      barcode: null,
      sellingPriceKobo: 250_000,
      isActive: true,
      updatedAt: now,
      updatedBy: "staging-smoke-seed",
    }, { merge: true }),
    db.doc(`branches/${branchId}/productControls/${productId}`).set({
      productId,
      minimumPriceKobo: 200_000,
      defaultCostPriceKobo: 120_000,
      updatedAt: now,
      updatedBy: "staging-smoke-seed",
    }, { merge: true }),
    db.doc(`branches/${branchId}/inventory/${productId}`).set({
      productId,
      sku: "SMOKE-ICE-BLOCK",
      productName: "SMOKE TEST Ice Block",
      unit: "block",
      onHandQty: 100,
      reservedQty: 0,
      soldQty: 0,
      damagedQty: 0,
      returnedQty: 0,
      reorderLevel: 10,
      isLowStock: false,
      isActive: true,
      updatedAt: now,
      updatedBy: "staging-smoke-seed",
    }, { merge: true }),
    db.doc(`branches/${branchId}/inventoryFinancials/${productId}`).set({
      productId,
      averageUnitCostKobo: 120_000,
      stockValueKobo: 12_000_000,
      updatedAt: now,
      updatedBy: "staging-smoke-seed",
    }, { merge: true }),
    db.doc(`customers/${customerId}`).set({
      name: "SMOKE TEST Customer",
      phone: "+2340000000000",
      address: "Staging smoke-test customer.",
      branchId,
      creditLimitKobo: 500_000,
      outstandingBalanceKobo: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: "staging-smoke-seed",
      updatedBy: "staging-smoke-seed",
    }, { merge: true }),
  ]);

  for (const user of users) {
    await db.doc(`users/${user.uid}`).set({
      displayName: user.displayName,
      email: user.email,
      phone: null,
      isActive: true,
      platformRole: user.platformRole,
      assignedBranchIds: user.assignedBranchIds,
      createdAt: now,
      updatedAt: now,
      createdBy: "staging-smoke-seed",
      updatedBy: "staging-smoke-seed",
    }, { merge: true });
  }

  console.log("Staging smoke seed data created or updated.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Staging smoke seed failed.");
  process.exit(1);
});
