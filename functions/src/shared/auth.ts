import { HttpsError } from "firebase-functions/v2/https";

import { adminDb } from "./firebase";
import { platformRoles, type ActorProfile } from "./roles";

export async function requireActor(uid: string | undefined): Promise<ActorProfile> {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in is required.");
  }

  const snapshot = await adminDb().doc(`users/${uid}`).get();

  if (!snapshot.exists) {
    throw new HttpsError("permission-denied", "User profile is missing.");
  }

  const data = snapshot.data();
  const role = data?.platformRole;

  if (!platformRoles.includes(role)) {
    throw new HttpsError("permission-denied", "User role is invalid.");
  }

  const actor: ActorProfile = {
    uid,
    displayName: String(data?.displayName ?? ""),
    email: String(data?.email ?? ""),
    isActive: data?.isActive === true,
    platformRole: role,
    assignedBranchIds: Array.isArray(data?.assignedBranchIds)
      ? data.assignedBranchIds.filter((branchId) => typeof branchId === "string")
      : [],
  };

  if (!actor.isActive) {
    throw new HttpsError("permission-denied", "User account is inactive.");
  }

  return actor;
}
