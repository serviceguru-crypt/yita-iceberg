import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { isAdminRole } from "@/lib/domain/roles";
import { getCurrentUser } from "@/lib/server/auth/session";
import { adminDb } from "@/lib/server/firebase-admin";
import type { BranchDocument } from "@/lib/types/operational";

const branchSettingsSchema = z.object({
  requireDiscountReason: z.boolean().default(true),
  requireTransferProof: z.boolean().default(false),
  allowCreditSales: z.boolean().default(true),
  allowSplitPayments: z.boolean().default(true),
});

const createBranchSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  settings: branchSettingsSchema.default({
    requireDiscountReason: true,
    requireTransferProof: false,
    allowCreditSales: true,
    allowSplitPayments: true,
  }),
});

function toBranch(id: string, data: Record<string, unknown>): BranchDocument {
  return {
    id,
    name: String(data.name ?? id),
    code: data.code ? String(data.code) : undefined,
    isActive: data.isActive === true,
    settings:
      typeof data.settings === "object" && data.settings !== null
        ? (data.settings as BranchDocument["settings"])
        : undefined,
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

  const admin =
    user.platformRole === "admin" || user.platformRole === "super_admin";

  try {
    let branches: BranchDocument[];

    if (admin) {
      const snapshot = await adminDb()
        .collection("branches")
        .limit(100)
        .get();

      branches = snapshot.docs
        .map((branch) => toBranch(branch.id, branch.data()))
        .filter((branch) => branch.isActive !== false)
        .sort((first, second) => first.name.localeCompare(second.name))
        .slice(0, 50);
    } else {
      const snapshots = await Promise.all(
        user.assignedBranchIds.map((branchId) =>
          adminDb().doc(`branches/${branchId}`).get(),
        ),
      );

      branches = snapshots
        .filter((snapshot) => snapshot.exists)
        .map((snapshot) => toBranch(snapshot.id, snapshot.data() ?? {}))
        .filter((branch) => branch.isActive !== false);
    }

    return NextResponse.json(
      { ok: true, branches },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Branch context load failed", error);

    return NextResponse.json(
      { ok: false, message: "Unable to load branch context." },
      { status: 500 },
    );
  }
}

function branchIdFromCode(code: string) {
  return code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  if (!isAdminRole(user.platformRole)) {
    return NextResponse.json(
      { ok: false, message: "Branch management requires admin access." },
      { status: 403 },
    );
  }

  try {
    const data = createBranchSchema.parse(await request.json());
    const branchId = branchIdFromCode(data.code);

    if (!branchId) {
      return NextResponse.json(
        { ok: false, message: "Branch code must contain letters or numbers." },
        { status: 400 },
      );
    }

    const branchRef = adminDb().doc(`branches/${branchId}`);
    const existingBranch = await branchRef.get();

    if (existingBranch.exists) {
      return NextResponse.json(
        { ok: false, message: "A branch with this code already exists." },
        { status: 409 },
      );
    }

    const now = FieldValue.serverTimestamp();
    const branch = {
      name: data.name,
      code: data.code.toUpperCase(),
      isActive: true,
      settings: data.settings,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
    };

    await branchRef.set(branch);
    await adminDb().collection("auditLogs").add({
      actorUid: user.uid,
      actorRole: user.platformRole,
      action: "branch.created",
      entityType: "branch",
      entityId: branchId,
      branchId,
      before: null,
      after: {
        name: data.name,
        code: data.code.toUpperCase(),
        isActive: true,
        settings: data.settings,
      },
      metadata: { source: "next_api" },
      createdAt: now,
    });

    return NextResponse.json({
      ok: true,
      branch: toBranch(branchId, branch),
    });
  } catch (error) {
    console.error("Create branch failed", error);

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to create branch.",
      },
      { status: 500 },
    );
  }
}
