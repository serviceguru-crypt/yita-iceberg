export const platformRoles = [
  "order_registrar",
  "cashier",
  "release_verifier",
  "branch_manager",
  "admin",
  "super_admin",
] as const;

export type PlatformRole = (typeof platformRoles)[number];

export type ActorProfile = {
  uid: string;
  displayName: string;
  email: string;
  isActive: boolean;
  platformRole: PlatformRole;
  assignedBranchIds: string[];
};

export function canManageUsers(actor: ActorProfile) {
  return (
    actor.isActive &&
    (actor.platformRole === "admin" || actor.platformRole === "super_admin")
  );
}

export function canAssignRole(actor: ActorProfile, targetRole: PlatformRole) {
  if (!canManageUsers(actor)) {
    return false;
  }

  if (actor.platformRole === "super_admin") {
    return true;
  }

  return targetRole !== "super_admin";
}

export function canAccessBranch(actor: ActorProfile, branchId: string) {
  if (!actor.isActive) {
    return false;
  }

  if (actor.platformRole === "admin" || actor.platformRole === "super_admin") {
    return true;
  }

  return actor.assignedBranchIds.includes(branchId);
}
