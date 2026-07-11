import { NextResponse } from "next/server";

import { isAdminRole, platformRoles, type PlatformRole } from "@/lib/domain/roles";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminDb } from "@/lib/server/firebase-admin";

type AccessUser = {
  uid: string;
  displayName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  platformRole: PlatformRole;
  assignedBranchIds: string[];
};

function toAccessUser(uid: string, data: Record<string, unknown>): AccessUser {
  return {
    uid,
    displayName: String(data.displayName ?? "Unnamed user"),
    email: String(data.email ?? ""),
    phone: typeof data.phone === "string" ? data.phone : null,
    isActive: data.isActive === true,
    platformRole: platformRoles.includes(data.platformRole as PlatformRole)
      ? (data.platformRole as PlatformRole)
      : "order_registrar",
    assignedBranchIds: Array.isArray(data.assignedBranchIds)
      ? data.assignedBranchIds.filter(
          (branchId): branchId is string => typeof branchId === "string",
        )
      : [],
  };
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  if (!isAdminRole(user.platformRole)) {
    return NextResponse.json(
      { ok: false, message: "Access management requires admin access." },
      { status: 403 },
    );
  }

  try {
    const snapshot = await adminDb().collection("users").limit(100).get();
    const users = snapshot.docs
      .map((item) => toAccessUser(item.id, item.data()))
      .sort((first, second) => first.displayName.localeCompare(second.displayName));

    return NextResponse.json(
      { ok: true, users },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Access user list failed", error);

    return NextResponse.json(
      { ok: false, message: "Unable to load users." },
      { status: 500 },
    );
  }
}
