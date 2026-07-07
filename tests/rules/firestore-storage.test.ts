import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getBytes, ref, uploadString } from "firebase/storage";

const projectId = "yita-iceberg-dev";

let testEnv: RulesTestEnvironment;

async function seedBaseData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users/registrar-a"), {
        displayName: "Registrar A",
        email: "registrar-a@example.test",
        isActive: true,
        platformRole: "order_registrar",
        assignedBranchIds: ["branch-a"],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "seed",
        updatedBy: "seed",
      }),
      setDoc(doc(db, "users/inactive-user"), {
        displayName: "Inactive",
        email: "inactive@example.test",
        isActive: false,
        platformRole: "cashier",
        assignedBranchIds: ["branch-a"],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "seed",
        updatedBy: "seed",
      }),
      setDoc(doc(db, "users/admin-user"), {
        displayName: "Admin",
        email: "admin@example.test",
        isActive: true,
        platformRole: "admin",
        assignedBranchIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "seed",
        updatedBy: "seed",
      }),
      setDoc(doc(db, "users/cashier-a"), {
        displayName: "Cashier A",
        email: "cashier-a@example.test",
        isActive: true,
        platformRole: "cashier",
        assignedBranchIds: ["branch-a"],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "seed",
        updatedBy: "seed",
      }),
      setDoc(doc(db, "branches/branch-a"), {
        name: "Branch A",
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "branches/branch-b"), {
        name: "Branch B",
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "branches/branch-a/inventory/product-1"), {
        productId: "product-1",
        onHandQty: 10,
        reservedQty: 0,
        updatedAt: serverTimestamp(),
        updatedBy: "seed",
      }),
      setDoc(doc(db, "branches/branch-b/inventory/product-1"), {
        productId: "product-1",
        onHandQty: 10,
        reservedQty: 0,
        updatedAt: serverTimestamp(),
        updatedBy: "seed",
      }),
      setDoc(doc(db, "orders/order-a"), {
        branchId: "branch-a",
        status: "awaiting_payment",
        createdAt: serverTimestamp(),
      }),
      setDoc(doc(db, "paymentProofUploadIntents/payment-a"), {
        paymentId: "payment-a",
        branchId: "branch-a",
        orderId: "order-a",
        storagePath: "payment-proofs/branch-a/order-a/payment-a/proof.pdf",
        contentType: "application/pdf",
        sizeBytes: 5,
        createdBy: "cashier-a",
        consumed: false,
        createdAt: serverTimestamp(),
      }),
      setDoc(doc(db, "auditLogs/audit-a"), {
        actorId: "seed",
        actorRole: "system",
        branchId: "branch-a",
        action: "seed",
        entityType: "test",
        entityId: "test",
        createdAt: serverTimestamp(),
      }),
    ]);
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
    },
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await seedBaseData();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Firestore branch access rules", () => {
  it("blocks unauthenticated users from protected data", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "branches/branch-a")));
  });

  it("allows an operational user to read their own profile", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertSucceeds(getDoc(doc(db, "users/registrar-a")));
  });

  it("allows assigned-branch inventory reads", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertSucceeds(getDoc(doc(db, "branches/branch-a/inventory/product-1")));
  });

  it("blocks cross-branch inventory reads", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertFails(getDoc(doc(db, "branches/branch-b/inventory/product-1")));
  });

  it("blocks direct inventory writes", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertFails(
      setDoc(doc(db, "branches/branch-a/inventory/product-2"), {
        productId: "product-2",
        onHandQty: 5,
      }),
    );
  });

  it("blocks direct order creation or edits", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertFails(
      setDoc(doc(db, "orders/order-new"), {
        branchId: "branch-a",
        status: "awaiting_payment",
      }),
    );
    await assertFails(
      setDoc(doc(db, "orders/order-a"), {
        branchId: "branch-a",
        status: "completed",
      }),
    );
  });

  it("blocks users from editing their own role or branch assignment", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertFails(
      setDoc(doc(db, "users/registrar-a"), {
        displayName: "Registrar A",
        email: "registrar-a@example.test",
        isActive: true,
        platformRole: "admin",
        assignedBranchIds: ["branch-a", "branch-b"],
      }),
    );
  });

  it("blocks operational users from reading another user profile", async () => {
    const db = testEnv.authenticatedContext("registrar-a").firestore();
    await assertFails(getDoc(doc(db, "users/cashier-a")));
  });

  it("allows admin access to branch data", async () => {
    const db = testEnv.authenticatedContext("admin-user").firestore();
    await assertSucceeds(getDoc(doc(db, "branches/branch-b/inventory/product-1")));
  });

  it("blocks client audit log creation, edits, and deletes", async () => {
    const db = testEnv.authenticatedContext("admin-user").firestore();
    await assertFails(
      setDoc(doc(db, "auditLogs/audit-new"), {
        action: "client-write",
        branchId: "branch-a",
      }),
    );
    await assertFails(
      setDoc(doc(db, "auditLogs/audit-a"), {
        action: "client-edit",
        branchId: "branch-a",
      }),
    );
    await assertFails(deleteDoc(doc(db, "auditLogs/audit-a")));
  });

  it("blocks client writes to financial and idempotency ledgers", async () => {
    const db = testEnv.authenticatedContext("admin-user").firestore();

    await assertFails(
      setDoc(doc(db, "financialTransactions/txn-a"), {
        branchId: "branch-a",
        orderId: "order-a",
        amountKobo: 1000,
      }),
    );
    await assertFails(
      setDoc(doc(db, "idempotencyRecords/admin_create_key"), {
        actorId: "admin-user",
        operation: "createOrder",
      }),
    );
  });

  it("denies inactive users where rules can enforce active status", async () => {
    const db = testEnv.authenticatedContext("inactive-user").firestore();
    await assertFails(getDoc(doc(db, "users/inactive-user")));
    await assertFails(getDoc(doc(db, "branches/branch-a/inventory/product-1")));
  });
});

describe("Storage payment proof rules", () => {
  it("allows authorized payment proof uploads and reads in the assigned branch", async () => {
    const context = testEnv.authenticatedContext("cashier-a");
    const storage = context.storage();
    const proofRef = ref(
      storage,
      "payment-proofs/branch-a/order-a/payment-a/proof.pdf",
    );

    await assertSucceeds(
      uploadString(proofRef, "proof", "raw", {
        contentType: "application/pdf",
        customMetadata: {
          paymentProofUploadIntentId: "payment-a",
          branchId: "branch-a",
          orderId: "order-a",
        },
      }),
    );
    await assertSucceeds(getBytes(proofRef));
  });

  it("rejects unauthorized payment proof uploads and reads", async () => {
    const registrarStorage = testEnv.authenticatedContext("registrar-a").storage();
    const crossBranchStorage = testEnv.authenticatedContext("cashier-a").storage();

    await assertFails(
      uploadString(
        ref(registrarStorage, "payment-proofs/branch-a/order-a/payment-a/proof.pdf"),
        "proof",
        "raw",
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadString(
        ref(
          crossBranchStorage,
          "payment-proofs/branch-b/order-b/payment-b/proof.pdf",
        ),
        "proof",
        "raw",
        { contentType: "application/pdf" },
      ),
    );
  });
});
