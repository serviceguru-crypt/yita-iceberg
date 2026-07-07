export const platformRoles = [
  "order_registrar",
  "cashier",
  "release_verifier",
  "branch_manager",
  "admin",
  "super_admin",
] as const;

export type PlatformRole = (typeof platformRoles)[number];

export const elevatedRoles = ["branch_manager", "admin", "super_admin"] as const;

export function isAdminRole(role: PlatformRole) {
  return role === "admin" || role === "super_admin";
}
