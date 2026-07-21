import { NextResponse } from "next/server";

import { isAdminRole } from "@/lib/domain/roles";
import { canAccessBranch } from "@/lib/permissions/policy";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminDb } from "@/lib/server/firebase-admin";

const documentIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const maximumIds = 100;

export async function POST(request: Request) {
  const actor = await getCurrentUser();

  if (!actor) {
    return NextResponse.json(
      { ok: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  let input: { branchId?: unknown; userIds?: unknown };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid display-name request." },
      { status: 400 },
    );
  }

  const branchId = typeof input.branchId === "string" ? input.branchId.trim() : "";
  const userIds = Array.isArray(input.userIds)
    ? [...new Set(input.userIds.filter((value): value is string =>
        typeof value === "string" && documentIdPattern.test(value),
      ))].slice(0, maximumIds)
    : [];

  if (!documentIdPattern.test(branchId) || !canAccessBranch(actor, branchId)) {
    return NextResponse.json(
      { ok: false, message: "Branch access denied." },
      { status: 403 },
    );
  }

  if (userIds.length === 0) {
    return NextResponse.json(
      { ok: true, names: {} },
      { headers: { "cache-control": "private, max-age=300" } },
    );
  }

  try {
    const snapshots = await adminDb().getAll(
      ...userIds.map((uid) => adminDb().doc(`users/${uid}`)),
    );
    const names: Record<string, string> = {};

    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue;
      const profile = snapshot.data() ?? {};
      const assignedBranchIds = Array.isArray(profile.assignedBranchIds)
        ? profile.assignedBranchIds.filter((value): value is string => typeof value === "string")
        : [];
      const visible =
        isAdminRole(actor.platformRole) ||
        snapshot.id === actor.uid ||
        assignedBranchIds.includes(branchId);
      const displayName =
        typeof profile.displayName === "string" ? profile.displayName.trim() : "";

      if (visible && displayName) names[snapshot.id] = displayName;
    }

    if (userIds.includes("system")) names.system = "System";

    return NextResponse.json(
      { ok: true, names },
      { headers: { "cache-control": "private, max-age=300" } },
    );
  } catch (error) {
    console.error("Display-name lookup failed", error);
    return NextResponse.json(
      { ok: false, message: "Unable to load staff names." },
      { status: 500 },
    );
  }
}
