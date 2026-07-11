import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

import { writeAuditLog } from "../shared/audit";
import { requireActor } from "../shared/auth";
import { adminAuth, adminDb } from "../shared/firebase";
import {
  canAccessBranch,
  canAssignRole,
  canManageUsers,
  type ActorProfile,
  type PlatformRole,
} from "../shared/roles";
import {
  provisionUserSchema,
  updateUserAccessSchema,
  updateUserProfileSchema,
  userUidSchema,
} from "./schemas";

async function assertBranchesExistAndAllowed(
  actor: ActorProfile,
  branchIds: string[],
) {
  const uniqueBranchIds = [...new Set(branchIds)];

  await Promise.all(
    uniqueBranchIds.map(async (branchId) => {
      if (!canAccessBranch(actor, branchId)) {
        throw new HttpsError("permission-denied", "Branch access denied.");
      }

      const branch = await adminDb().doc(`branches/${branchId}`).get();

      if (!branch.exists || branch.data()?.isActive !== true) {
        throw new HttpsError("invalid-argument", "Invalid branch.");
      }
    }),
  );

  return uniqueBranchIds;
}

function requiresBranchAssignment(role: PlatformRole) {
  return !["admin", "super_admin"].includes(role);
}

async function setAccessClaims(
  uid: string,
  platformRole: PlatformRole,
  isActive: boolean,
) {
  await adminAuth().setCustomUserClaims(uid, {
    platformRole,
    isActive,
  });
}

export async function provisionUserAction(actorUid: string | undefined, input: unknown) {
  const actor = await requireActor(actorUid);
  const data = provisionUserSchema.parse(input);

  if (!canManageUsers(actor) || !canAssignRole(actor, data.platformRole)) {
    throw new HttpsError("permission-denied", "Role assignment denied.");
  }

  if (
    requiresBranchAssignment(data.platformRole) &&
    data.assignedBranchIds.length === 0
  ) {
    throw new HttpsError("invalid-argument", "Branch assignment is required.");
  }

  const assignedBranchIds = await assertBranchesExistAndAllowed(
    actor,
    data.assignedBranchIds,
  );
  let authUser;

  try {
    authUser = await adminAuth().getUserByEmail(data.email);
  } catch {
    authUser = await adminAuth().createUser({
      email: data.email,
      displayName: data.displayName,
      disabled: false,
      emailVerified: false,
    });
  }

  const userRef = adminDb().doc(`users/${authUser.uid}`);
  const existingProfile = await userRef.get();

  if (existingProfile.exists) {
    throw new HttpsError("already-exists", "User profile already exists.");
  }

  const now = FieldValue.serverTimestamp();
  const profile = {
    displayName: data.displayName,
    email: data.email,
    phone: data.phone ?? null,
    isActive: true,
    platformRole: data.platformRole,
    assignedBranchIds,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.uid,
    updatedBy: actor.uid,
  };

  await userRef.set(profile);
  await setAccessClaims(authUser.uid, data.platformRole, true);
  await writeAuditLog({
    actor,
    action: "user.provisioned",
    entityType: "user",
    entityId: authUser.uid,
    before: null,
    after: {
      email: data.email,
      platformRole: data.platformRole,
      assignedBranchIds,
      isActive: true,
    },
    metadata: {
      passwordResetRequired: true,
    },
  });
  const inviteLink = await adminAuth().generatePasswordResetLink(data.email);

  return {
    uid: authUser.uid,
    passwordResetRequired: true,
    inviteLink,
  };
}

export async function updateUserProfileAction(
  actorUid: string | undefined,
  input: unknown,
) {
  const actor = await requireActor(actorUid);
  const data = updateUserProfileSchema.parse(input);
  const userRef = adminDb().doc(`users/${actor.uid}`);
  const before = (await userRef.get()).data();

  await userRef.update({
    displayName: data.displayName,
    phone: data.phone ?? null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  });
  await adminAuth().updateUser(actor.uid, {
    displayName: data.displayName,
  });
  await writeAuditLog({
    actor,
    action: "user.profile_updated",
    entityType: "user",
    entityId: actor.uid,
    before: {
      displayName: before?.displayName,
      phone: before?.phone ?? null,
    },
    after: {
      displayName: data.displayName,
      phone: data.phone ?? null,
    },
  });

  return { uid: actor.uid };
}

export async function updateUserAccessAction(
  actorUid: string | undefined,
  input: unknown,
) {
  const actor = await requireActor(actorUid);
  const data = updateUserAccessSchema.parse(input);

  if (actor.uid === data.uid) {
    throw new HttpsError("permission-denied", "Users cannot edit their own access.");
  }

  if (!canManageUsers(actor) || !canAssignRole(actor, data.platformRole)) {
    throw new HttpsError("permission-denied", "Role assignment denied.");
  }

  if (
    requiresBranchAssignment(data.platformRole) &&
    data.assignedBranchIds.length === 0
  ) {
    throw new HttpsError("invalid-argument", "Branch assignment is required.");
  }

  const assignedBranchIds = await assertBranchesExistAndAllowed(
    actor,
    data.assignedBranchIds,
  );
  const userRef = adminDb().doc(`users/${data.uid}`);
  const beforeSnapshot = await userRef.get();

  if (!beforeSnapshot.exists) {
    throw new HttpsError("not-found", "User profile not found.");
  }

  const before = beforeSnapshot.data();

  if (before?.platformRole === "super_admin" && actor.platformRole !== "super_admin") {
    throw new HttpsError("permission-denied", "Super-admin access is protected.");
  }

  await userRef.update({
    platformRole: data.platformRole,
    assignedBranchIds,
    isActive: data.isActive,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  });
  await setAccessClaims(data.uid, data.platformRole, data.isActive);
  await writeAuditLog({
    actor,
    action: "user.access_updated",
    entityType: "user",
    entityId: data.uid,
    before: {
      platformRole: before?.platformRole,
      assignedBranchIds: before?.assignedBranchIds ?? [],
      isActive: before?.isActive === true,
    },
    after: {
      platformRole: data.platformRole,
      assignedBranchIds,
      isActive: data.isActive,
    },
  });

  return { uid: data.uid };
}

export async function deactivateUserAction(
  actorUid: string | undefined,
  input: unknown,
) {
  const data = userUidSchema.parse(input);
  const targetSnapshot = await adminDb().doc(`users/${data.uid}`).get();

  if (!targetSnapshot.exists) {
    throw new HttpsError("not-found", "User profile not found.");
  }

  return updateUserAccessAction(actorUid, {
    uid: data.uid,
    platformRole: targetSnapshot.data()?.platformRole,
    assignedBranchIds: targetSnapshot.data()?.assignedBranchIds ?? [],
    isActive: false,
  });
}

export async function reactivateUserAction(
  actorUid: string | undefined,
  input: unknown,
) {
  const data = userUidSchema.parse(input);
  const targetSnapshot = await adminDb().doc(`users/${data.uid}`).get();

  if (!targetSnapshot.exists) {
    throw new HttpsError("not-found", "User profile not found.");
  }

  return updateUserAccessAction(actorUid, {
    uid: data.uid,
    platformRole: targetSnapshot.data()?.platformRole,
    assignedBranchIds: targetSnapshot.data()?.assignedBranchIds ?? [],
    isActive: true,
  });
}
