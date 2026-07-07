import { randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  provisionUserAction,
  updateUserAccessAction,
} from "../src/users/service";

function init() {
  if (getApps().length === 0) {
    initializeApp({ projectId: "yita-iceberg-dev" });
  }
}

async function clearFirestore() {
  const db = getFirestore();
  const collections = await db.listCollections();
  await Promise.all(
    collections.map(async (collection) => {
      const snapshot = await collection.get();
      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    }),
  );
}

async function clearAuthUsers() {
  const auth = getAuth();
  const users = await auth.listUsers(1000);
  await Promise.all(users.users.map((user) => auth.deleteUser(user.uid)));
}

async function seedUser({
  uid,
  role,
  isActive = true,
  branchIds = [],
}: {
  uid: string;
  role: string;
  isActive?: boolean;
  branchIds?: string[];
}) {
  const auth = getAuth();
  const db = getFirestore();

  await auth.createUser({
    uid,
    email: `${uid}@example.test`,
    displayName: uid,
    password: "ChangeMe123!",
  });
  await auth.setCustomUserClaims(uid, {
    platformRole: role,
    isActive,
  });
  await db.doc(`users/${uid}`).set({
    displayName: uid,
    email: `${uid}@example.test`,
    phone: null,
    isActive,
    platformRole: role,
    assignedBranchIds: branchIds,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: "test",
    updatedBy: "test",
  });
}

async function seedBaseData() {
  const db = getFirestore();

  await Promise.all([
    db.doc("branches/branch-a").set({
      name: "Branch A",
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.doc("branches/branch-b").set({
      name: "Branch B",
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
  ]);

  await seedUser({ uid: "super-admin", role: "super_admin" });
  await seedUser({ uid: "admin", role: "admin" });
  await seedUser({
    uid: "branch-manager",
    role: "branch_manager",
    branchIds: ["branch-a"],
  });
  await seedUser({
    uid: "registrar",
    role: "order_registrar",
    branchIds: ["branch-a"],
  });
  await seedUser({
    uid: "inactive-admin",
    role: "admin",
    isActive: false,
  });
}

function uniqueEmail() {
  return `${randomUUID()}@example.test`;
}

beforeAll(() => {
  init();
});

beforeEach(async () => {
  await clearAuthUsers();
  await clearFirestore();
  await seedBaseData();
});

describe("identity and access functions", () => {
  it("rejects unauthenticated provisioning", async () => {
    await expect(
      provisionUserAction(undefined, {
        email: uniqueEmail(),
        displayName: "No Auth",
        platformRole: "cashier",
        assignedBranchIds: ["branch-a"],
      }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("blocks branch managers from creating admin or super-admin users", async () => {
    await expect(
      provisionUserAction("branch-manager", {
        email: uniqueEmail(),
        displayName: "Admin Target",
        platformRole: "admin",
        assignedBranchIds: [],
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks admin from creating or modifying super-admin users", async () => {
    await expect(
      provisionUserAction("admin", {
        email: uniqueEmail(),
        displayName: "Super Target",
        platformRole: "super_admin",
        assignedBranchIds: [],
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });

    await expect(
      updateUserAccessAction("admin", {
        uid: "super-admin",
        platformRole: "admin",
        assignedBranchIds: [],
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("allows super-admin to provision operational staff", async () => {
    const result = await provisionUserAction("super-admin", {
      email: uniqueEmail(),
      displayName: "Cashier",
      platformRole: "cashier",
      assignedBranchIds: ["branch-a"],
    });

    expect(result.uid).toBeTruthy();

    const userSnapshot = await getFirestore().doc(`users/${result.uid}`).get();
    expect(userSnapshot.data()?.platformRole).toBe("cashier");
    expect(userSnapshot.data()?.assignedBranchIds).toEqual(["branch-a"]);
  });

  it("blocks users from changing their own role", async () => {
    await expect(
      updateUserAccessAction("admin", {
        uid: "admin",
        platformRole: "cashier",
        assignedBranchIds: ["branch-a"],
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("creates audit logs for access changes", async () => {
    await updateUserAccessAction("super-admin", {
      uid: "registrar",
      platformRole: "cashier",
      assignedBranchIds: ["branch-a"],
      isActive: true,
    });

    const auditLogs = await getFirestore()
      .collection("auditLogs")
      .where("action", "==", "user.access_updated")
      .get();

    expect(auditLogs.size).toBe(1);
    expect(auditLogs.docs[0].data().entityId).toBe("registrar");
  });

  it("rejects invalid roles and invalid branches", async () => {
    await expect(
      provisionUserAction("super-admin", {
        email: uniqueEmail(),
        displayName: "Bad Role",
        platformRole: "owner",
        assignedBranchIds: ["branch-a"],
      }),
    ).rejects.toBeTruthy();

    await expect(
      provisionUserAction("super-admin", {
        email: uniqueEmail(),
        displayName: "Bad Branch",
        platformRole: "cashier",
        assignedBranchIds: ["missing-branch"],
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects malformed input through Zod validation", async () => {
    await expect(
      provisionUserAction("super-admin", {
        email: "not-an-email",
        displayName: "",
        platformRole: "cashier",
        assignedBranchIds: ["branch-a"],
      }),
    ).rejects.toBeTruthy();
  });

  it("blocks deactivated callers", async () => {
    await expect(
      provisionUserAction("inactive-admin", {
        email: uniqueEmail(),
        displayName: "Blocked",
        platformRole: "cashier",
        assignedBranchIds: ["branch-a"],
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("keeps custom claims synchronized on access updates", async () => {
    await updateUserAccessAction("super-admin", {
      uid: "registrar",
      platformRole: "cashier",
      assignedBranchIds: ["branch-a"],
      isActive: false,
    });

    const user = await getAuth().getUser("registrar");
    expect(user.customClaims).toMatchObject({
      platformRole: "cashier",
      isActive: false,
    });
  });
});
