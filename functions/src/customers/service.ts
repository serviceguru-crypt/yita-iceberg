import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

import { requireActor } from "../shared/auth";
import { adminDb } from "../shared/firebase";
import { hashValue } from "../shared/hash";
import { canAccessBranch, type ActorProfile } from "../shared/roles";
import { createCustomerSchema, updateCustomerSchema } from "./schemas";

function ensureCustomerRole(actor: ActorProfile) {
  if (
    ![
      "order_registrar",
      "cashier",
      "branch_manager",
      "admin",
      "super_admin",
    ].includes(actor.platformRole)
  ) {
    throw new HttpsError("permission-denied", "Role is not allowed.");
  }
}

function ensureBranch(actor: ActorProfile, branchId: string) {
  if (!canAccessBranch(actor, branchId)) {
    throw new HttpsError("permission-denied", "Branch access denied.");
  }
}

function idemRef(actor: ActorProfile, operation: string, idempotencyKey: string) {
  const keyHash = hashValue(idempotencyKey);
  return {
    keyHash,
    ref: adminDb().doc(
      `idempotencyRecords/${actor.uid}_${operation}_${keyHash}`,
    ),
  };
}

function auditData(
  actor: ActorProfile,
  action: string,
  entityId: string,
  branchId: string,
  before: unknown,
  after: unknown,
) {
  return {
    actorId: actor.uid,
    actorRole: actor.platformRole,
    branchId,
    action,
    entityType: "customer",
    entityId,
    before: before ?? null,
    after: after ?? null,
    metadata: {},
    createdAt: FieldValue.serverTimestamp(),
  };
}

export async function createCustomerAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureCustomerRole(actor);
  const data = createCustomerSchema.parse(input);
  ensureBranch(actor, data.branchId);
  const { keyHash, ref } = idemRef(actor, "createCustomer", data.idempotencyKey);
  const customerRef = adminDb().collection("customers").doc();

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;

    const branchSnapshot = await tx.get(adminDb().doc(`branches/${data.branchId}`));
    if (!branchSnapshot.exists || branchSnapshot.data()?.isActive !== true) {
      throw new HttpsError("invalid-argument", "Invalid branch.");
    }

    const response = { id: customerRef.id, customerId: customerRef.id };
    const profile = {
      name: data.name,
      phone: data.phone,
      address: data.address ?? null,
      branchId: data.branchId,
      creditLimitKobo: 0,
      outstandingBalanceKobo: 0,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid,
      updatedBy: actor.uid,
      idempotencyKeyHash: keyHash,
    };

    tx.set(customerRef, profile);
    tx.set(
      adminDb().collection("auditLogs").doc(`createCustomer_${customerRef.id}_${keyHash}`),
      auditData(actor, "customer.created", customerRef.id, data.branchId, null, {
        name: data.name,
        phone: data.phone,
      }),
    );
    tx.set(ref, {
      actorId: actor.uid,
      operation: "createCustomer",
      keyHash,
      entityId: customerRef.id,
      responseSnapshot: response,
      createdAt: FieldValue.serverTimestamp(),
    });
    return response;
  });
}

export async function updateCustomerAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  ensureCustomerRole(actor);
  const data = updateCustomerSchema.parse(input);
  const { keyHash, ref } = idemRef(actor, "updateCustomer", data.idempotencyKey);
  const customerRef = adminDb().doc(`customers/${data.customerId}`);

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data()?.responseSnapshot;
    const customerSnapshot = await tx.get(customerRef);
    if (!customerSnapshot.exists) {
      throw new HttpsError("not-found", "Customer not found.");
    }
    const before = customerSnapshot.data()!;
    ensureBranch(actor, before.branchId);

    const patch = {
      ...(data.name ? { name: data.name } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.address !== undefined ? { address: data.address || null } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    };
    const response = { id: data.customerId, customerId: data.customerId };

    tx.update(customerRef, patch);
    tx.set(
      adminDb().collection("auditLogs").doc(`updateCustomer_${data.customerId}_${keyHash}`),
      auditData(actor, "customer.updated", data.customerId, before.branchId, {
        name: before.name,
        phone: before.phone,
        address: before.address ?? null,
      }, patch),
    );
    tx.set(ref, {
      actorId: actor.uid,
      operation: "updateCustomer",
      keyHash,
      entityId: data.customerId,
      responseSnapshot: response,
      createdAt: FieldValue.serverTimestamp(),
    });
    return response;
  });
}
