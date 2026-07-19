import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { assertProductionGuardFromEnv } from "./shared/confirm-production";

function initializeAdmin() {
  if (getApps().length === 0) {
    initializeApp({
      projectId:
        process.env.FIREBASE_PROJECT_ID ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
        "yita-iceberg",
    });
  }
}

async function ensureAuthUser(uid: string, email: string, displayName: string) {
  const auth = getAuth();

  try {
    return await auth.getUser(uid);
  } catch {
    return auth.createUser({
      uid,
      email,
      displayName,
      emailVerified: true,
      password: "ChangeMe123!",
    });
  }
}

async function main() {
  assertProductionGuardFromEnv({
    confirmationEnv: "SEED_PRODUCTION_CONFIRMATION",
    allowEnv: "SEED_ALLOW_PRODUCTION",
    requiredConfirmation: "SEED_TEST_USERS_IN_PRODUCTION",
  });
  initializeAdmin();

  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const users = [
    {
      uid: "seed-super-admin",
      email: "super.admin@example.test",
      displayName: "Seed Super Admin",
      platformRole: "super_admin",
      assignedBranchIds: [],
    },
    {
      uid: "seed-admin",
      email: "admin@example.test",
      displayName: "Seed Admin",
      platformRole: "admin",
      assignedBranchIds: [],
    },
    {
      uid: "seed-registrar",
      email: "registrar@example.test",
      displayName: "Seed Registrar",
      platformRole: "order_registrar",
      assignedBranchIds: ["branch-a"],
    },
  ] as const;

  await Promise.all([
    db.doc("branches/branch-a").set({
      name: "Branch A",
      code: "A",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }),
    db.doc("branches/branch-b").set({
      name: "Branch B",
      code: "B",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  for (const user of users) {
    await ensureAuthUser(user.uid, user.email, user.displayName);
    await db.doc(`users/${user.uid}`).set({
      ...user,
      phone: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: "seed",
      updatedBy: "seed",
    });
    await getAuth().setCustomUserClaims(user.uid, {
      platformRole: user.platformRole,
      isActive: true,
    });
  }

  console.log("Test users created in the configured Firebase project/emulator.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seed failed.");
  process.exit(1);
});
