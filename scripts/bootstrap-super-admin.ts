import { randomUUID } from "node:crypto";

import { cert, getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";

const envSchema = z.object({
  BOOTSTRAP_SUPER_ADMIN_EMAIL: z.string().email(),
  BOOTSTRAP_SUPER_ADMIN_NAME: z.string().min(1),
  BOOTSTRAP_CONFIRM: z.literal("true"),
  BOOTSTRAP_EMERGENCY_OVERRIDE: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
});

function initializeAdmin() {
  if (getApps().length > 0) {
    return;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "yita-iceberg-dev";

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
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

  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

async function main() {
  const env = envSchema.parse(process.env);
  const emergencyOverride = env.BOOTSTRAP_EMERGENCY_OVERRIDE === "true";

  initializeAdmin();

  const auth = getAuth();
  const db = getFirestore();
  const existingSuperAdmin = await db
    .collection("users")
    .where("platformRole", "==", "super_admin")
    .limit(1)
    .get();

  if (!existingSuperAdmin.empty && !emergencyOverride) {
    throw new Error(
      "A super-admin already exists. Refusing bootstrap without BOOTSTRAP_EMERGENCY_OVERRIDE=true.",
    );
  }

  let authUser;

  try {
    authUser = await auth.getUserByEmail(env.BOOTSTRAP_SUPER_ADMIN_EMAIL);
  } catch {
    authUser = await auth.createUser({
      email: env.BOOTSTRAP_SUPER_ADMIN_EMAIL,
      displayName: env.BOOTSTRAP_SUPER_ADMIN_NAME,
      disabled: false,
      emailVerified: false,
    });
  }

  const now = FieldValue.serverTimestamp();

  await db.doc(`users/${authUser.uid}`).set(
    {
      displayName: env.BOOTSTRAP_SUPER_ADMIN_NAME,
      email: env.BOOTSTRAP_SUPER_ADMIN_EMAIL,
      phone: null,
      isActive: true,
      platformRole: "super_admin",
      assignedBranchIds: [],
      createdAt: now,
      updatedAt: now,
      createdBy: "bootstrap",
      updatedBy: "bootstrap",
    },
    { merge: true },
  );
  await auth.setCustomUserClaims(authUser.uid, {
    platformRole: "super_admin",
    isActive: true,
  });
  await db.collection("auditLogs").add({
    actorId: "bootstrap",
    actorRole: "system",
    branchId: null,
    action: "super_admin.bootstrapped",
    entityType: "user",
    entityId: authUser.uid,
    before: null,
    after: {
      email: env.BOOTSTRAP_SUPER_ADMIN_EMAIL,
      platformRole: "super_admin",
      isActive: true,
      assignedBranchIds: [],
    },
    metadata: {
      runId: randomUUID(),
      emergencyOverride,
    },
    createdAt: now,
  });

  console.log("Super-admin bootstrap complete.");
  console.log(`UID: ${authUser.uid}`);
  console.log("Set the password through Firebase Console password reset.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Bootstrap failed.");
  process.exit(1);
});
