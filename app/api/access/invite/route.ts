import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { isAdminRole, platformRoles, type PlatformRole } from "@/lib/domain/roles";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminAuth, adminDb } from "@/lib/server/firebase-admin";

const inviteUserSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  platformRole: z.enum(platformRoles),
  assignedBranchIds: z.array(z.string().trim().min(1)).default([]),
});

function canAssignRole(actorRole: PlatformRole, targetRole: PlatformRole) {
  if (actorRole === "super_admin") {
    return true;
  }

  return actorRole === "admin" && targetRole !== "super_admin";
}

function requiresBranchAssignment(role: PlatformRole) {
  return role !== "admin" && role !== "super_admin";
}

async function getAllowedBranchIds(actor: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!actor) return new Set<string>();

  if (isAdminRole(actor.platformRole)) {
    const snapshot = await adminDb().collection("branches").limit(100).get();
    return new Set(
      snapshot.docs
        .filter((branch) => branch.data().isActive !== false)
        .map((branch) => branch.id),
    );
  }

  return new Set(actor.assignedBranchIds);
}

async function assertBranchesAllowed(
  actor: Awaited<ReturnType<typeof getCurrentUser>>,
  branchIds: string[],
) {
  const uniqueBranchIds = [...new Set(branchIds)];
  const allowedBranchIds = await getAllowedBranchIds(actor);

  for (const branchId of uniqueBranchIds) {
    if (!allowedBranchIds.has(branchId)) {
      throw new Error("Branch access denied.");
    }
  }

  return uniqueBranchIds;
}

export async function POST(request: Request) {
  const actor = await getCurrentUser();

  if (!actor) {
    return NextResponse.json(
      { ok: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  if (!isAdminRole(actor.platformRole)) {
    return NextResponse.json(
      { ok: false, message: "Access management requires admin access." },
      { status: 403 },
    );
  }

  try {
    const data = inviteUserSchema.parse(await request.json());

    if (!canAssignRole(actor.platformRole, data.platformRole)) {
      return NextResponse.json(
        { ok: false, message: "Role assignment denied." },
        { status: 403 },
      );
    }

    if (
      requiresBranchAssignment(data.platformRole) &&
      data.assignedBranchIds.length === 0
    ) {
      return NextResponse.json(
        { ok: false, message: "Branch assignment is required." },
        { status: 400 },
      );
    }

    const assignedBranchIds = await assertBranchesAllowed(
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
      return NextResponse.json(
        { ok: false, message: "User profile already exists." },
        { status: 409 },
      );
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
    await adminAuth().setCustomUserClaims(authUser.uid, {
      platformRole: data.platformRole,
      isActive: true,
    });
    await adminDb().collection("auditLogs").add({
      actorId: actor.uid,
      actorRole: actor.platformRole,
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
      metadata: { passwordResetRequired: true, source: "next_api" },
      createdAt: now,
    });

    const inviteLink = await adminAuth().generatePasswordResetLink(data.email);

    return NextResponse.json({
      ok: true,
      uid: authUser.uid,
      passwordResetRequired: true,
      inviteLink,
    });
  } catch (error) {
    console.error("Invite user failed", error);

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to invite user.",
      },
      { status: 500 },
    );
  }
}
