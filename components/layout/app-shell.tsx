import Image from "next/image";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { BranchProvider } from "@/components/branch/branch-context";
import { BranchSelector } from "@/components/branch/branch-selector";
import { CrystalMark } from "@/components/brand/crystal-mark";
import { AppNavigation } from "@/components/navigation/app-navigation";
import type { SessionUserForClient } from "@/lib/types/operational";

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: SessionUserForClient;
}) {
  const branchLabel =
    user.platformRole === "admin" || user.platformRole === "super_admin"
      ? "All branches"
      : user.assignedBranchIds.length > 0
        ? `${user.assignedBranchIds.length} assigned branch${
            user.assignedBranchIds.length === 1 ? "" : "es"
          }`
        : "No branch assigned";

  return (
    <BranchProvider user={user}>
      <div className="min-h-screen bg-background text-foreground">
        <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
          <aside className="liquid-rail hidden border-r border-sidebar-border px-4 py-5 text-sidebar-foreground lg:block">
            <div className="sticky top-5">
              <div className="glass-edge mb-7 rounded-xl border border-sidebar-border bg-white/[0.14] p-4 shadow-2xl shadow-black/10 backdrop-blur-xl">
                <Image
                  alt="YITA Iceberg"
                  className="h-auto w-32 brightness-110"
                  height={1254}
                  priority
                  src="/brand/yita-iceberg-logo.webp"
                  width={1254}
                />
                <div className="mt-4 space-y-1">
                  <p className="text-sm font-semibold tracking-normal">YITA Iceberg</p>
                  <p className="text-xs text-sidebar-foreground/65">{branchLabel}</p>
                </div>
              </div>
              <AppNavigation role={user.platformRole} />
            </div>
          </aside>

          <div className="flex min-w-0 flex-col">
            <header className="liquid-glass sticky top-0 z-40 flex flex-col gap-3 border-b px-4 py-3 lg:static lg:flex-row lg:items-center lg:justify-between lg:border-b-0 lg:bg-transparent lg:px-7 lg:py-5 lg:shadow-none lg:backdrop-blur-none">
              <div className="flex min-w-0 items-center gap-3">
                <span className="app-surface grid size-10 shrink-0 place-items-center rounded-xl border shadow-sm lg:hidden">
                  <CrystalMark className="size-6 rotate-45" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-normal">
                    <span className="lg:hidden">YITA Iceberg</span>
                    <span className="hidden lg:inline">{user.displayName}</span>
                  </p>
                  <p className="truncate text-xs capitalize text-muted-foreground">
                    <span className="lg:hidden">{branchLabel}</span>
                    <span className="hidden lg:inline">
                      {user.platformRole.replaceAll("_", " ")}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <BranchSelector />
                <SignOutButton />
              </div>
            </header>
            <main className="flex-1 px-4 py-5 pb-28 sm:px-6 lg:px-7 lg:pb-7 lg:pt-2">
              <div className="mx-auto w-full max-w-[1500px]">{children}</div>
            </main>
          </div>
        </div>

        <div className="liquid-glass fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] lg:hidden">
          <AppNavigation role={user.platformRole} placement="bottom" />
        </div>
      </div>
    </BranchProvider>
  );
}
