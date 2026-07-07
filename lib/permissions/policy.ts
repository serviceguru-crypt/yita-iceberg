import type { PlatformRole } from "@/lib/domain/roles";

export type PermissionUser = {
  uid: string;
  isActive: boolean;
  platformRole: PlatformRole;
  assignedBranchIds: string[];
};

export function canAccessBranch(user: PermissionUser, branchId: string) {
  if (!user.isActive) {
    return false;
  }

  if (user.platformRole === "admin" || user.platformRole === "super_admin") {
    return true;
  }

  return user.assignedBranchIds.includes(branchId);
}

export function canManageUsers(user: PermissionUser) {
  return (
    user.isActive &&
    (user.platformRole === "admin" || user.platformRole === "super_admin")
  );
}

export function canAssignRole(actor: PermissionUser, targetRole: PlatformRole) {
  if (!canManageUsers(actor)) {
    return false;
  }

  if (actor.platformRole === "super_admin") {
    return true;
  }

  return targetRole !== "super_admin";
}

export function canAssignBranch(actor: PermissionUser, branchId: string) {
  return canAccessBranch(actor, branchId);
}

export function canViewAuditLogs(user: PermissionUser, branchId?: string) {
  if (!user.isActive) {
    return false;
  }

  if (user.platformRole === "admin" || user.platformRole === "super_admin") {
    return true;
  }

  return (
    user.platformRole === "branch_manager" &&
    Boolean(branchId) &&
    user.assignedBranchIds.includes(branchId as string)
  );
}

export function canManageCompanySettings(user: PermissionUser) {
  return user.isActive && user.platformRole === "super_admin";
}
