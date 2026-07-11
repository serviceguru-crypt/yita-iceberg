import {
  IconBuildingStore,
  IconChecklist,
  IconId,
  IconLockCheck,
  IconMail,
  IconPhone,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react";

import { CrystalMark } from "@/components/brand/crystal-mark";
import { requireActiveUser } from "@/lib/server/auth/session";

const roleCopy = {
  order_registrar: {
    label: "Order Registrar",
    summary: "Registers customer orders and reserves stock for payment.",
  },
  cashier: {
    label: "Cashier",
    summary: "Verifies order details and records payment settlement.",
  },
  release_verifier: {
    label: "Release Verifier",
    summary: "Confirms payment status and completes approved release.",
  },
  branch_manager: {
    label: "Branch Manager",
    summary: "Oversees branch activity, stock movement, and corrections.",
  },
  admin: {
    label: "Administrator",
    summary: "Manages users, branches, reports, inventory, and controls.",
  },
  super_admin: {
    label: "Super Administrator",
    summary: "Has full platform oversight across branches and controls.",
  },
} as const;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDate(value: unknown) {
  if (!value || typeof value !== "object") return "Not recorded";
  if ("toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString("en", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  if ("_seconds" in value && typeof value._seconds === "number") {
    return new Date(value._seconds * 1000).toLocaleDateString("en", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return "Not recorded";
}

function DetailCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof IconUser;
  label: string;
  value: string;
}) {
  return (
    <div className="app-surface fluid-hover rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-secondary text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" stroke={1.7} />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate text-sm font-medium">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default async function ProfilePage() {
  const user = await requireActiveUser();
  const role = roleCopy[user.platformRole];
  const branchLabel =
    user.assignedBranchIds.length > 0
      ? user.assignedBranchIds.join(", ")
      : user.platformRole === "admin" || user.platformRole === "super_admin"
        ? "All branches"
        : "No branch assigned";

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-2xl border bg-primary text-primary-foreground shadow-[0_24px_80px_rgba(7,20,38,0.16)]">
        <div className="relative isolate grid gap-6 p-6 md:grid-cols-[1fr_280px] md:p-8">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),transparent_44%,rgba(200,164,93,0.16))]" />
          <div className="flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.16] px-3 py-1 text-xs uppercase tracking-[0.18em] text-primary-foreground/80">
                <span className="size-1.5 rounded-full bg-accent" />
                Active staff profile
              </div>
              <div>
                <h1 className="font-display text-4xl leading-tight sm:text-5xl">
                  {user.displayName}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-foreground/75">
                  {role.summary} Account access is managed by an administrator
                  and protected by the secure YITA Iceberg role model.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.14] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-primary-foreground/60">
                  Role
                </p>
                <p className="mt-2 text-sm font-semibold">{role.label}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.14] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-primary-foreground/60">
                  Access
                </p>
                <p className="mt-2 text-sm font-semibold">Active</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.14] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-primary-foreground/60">
                  Branch scope
                </p>
                <p className="mt-2 truncate text-sm font-semibold">
                  {branchLabel}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center md:justify-end">
            <div className="relative grid size-44 place-items-center rounded-[2rem] border border-white/10 bg-white/[0.16]">
              <CrystalMark className="absolute -right-3 -top-3 size-12 rotate-45" />
              <div className="grid size-28 place-items-center rounded-full border border-accent/40 bg-primary-foreground font-display text-4xl text-primary shadow-[0_20px_55px_rgba(0,0,0,0.2)]">
                {initials(user.displayName) || "YI"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="app-surface rounded-2xl border p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Account details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Identity and access fields used by the secure portal.
              </p>
            </div>
            <IconId aria-hidden="true" className="size-6 text-muted-foreground" stroke={1.6} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <DetailCard icon={IconUser} label="Name" value={user.displayName} />
            <DetailCard icon={IconMail} label="Email" value={user.email} />
            <DetailCard
              icon={IconPhone}
              label="Phone"
              value={user.phone || "Not provided"}
            />
            <DetailCard icon={IconShieldCheck} label="Role" value={role.label} />
            <DetailCard
              icon={IconBuildingStore}
              label="Branches"
              value={branchLabel}
            />
            <DetailCard
              icon={IconChecklist}
              label="Created"
              value={formatDate(user.createdAt)}
            />
          </div>
        </div>

        <aside className="space-y-4">
          <div className="app-surface rounded-2xl border p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-accent">
                <IconLockCheck aria-hidden="true" className="size-5" stroke={1.6} />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Security posture</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Sign-in uses Firebase Authentication. The app session is
                  created only when your Firestore profile is active and your
                  role is valid.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border bg-accent/20 p-5 text-foreground shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Managed account
            </p>
            <p className="mt-3 text-sm leading-6">
              Profile edits, branch assignments, role changes, and account
              activation are handled by an administrator to preserve audit
              control.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
