import { SignOutButton } from "@/components/auth/sign-out-button";
import { BranchProvider } from "@/components/branch/branch-context";
import { BranchSelector } from "@/components/branch/branch-selector";
import { AppNavigation } from "@/components/navigation/app-navigation";
import type { ActiveSessionUser } from "@/lib/server/auth/session";

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: ActiveSessionUser;
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
          <aside className="border-b bg-card px-4 py-5 lg:border-b-0 lg:border-r">
            <div className="mb-8 space-y-1">
              <p className="text-sm font-semibold">YITA Iceberg</p>
              <p className="text-xs text-muted-foreground">{branchLabel}</p>
            </div>
            <AppNavigation role={user.platformRole} />
          </aside>

          <div className="flex min-w-0 flex-col">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
              <div>
                <p className="text-sm font-medium">{user.displayName}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {user.platformRole.replaceAll("_", " ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <BranchSelector />
                <SignOutButton />
              </div>
            </header>
            <main className="flex-1 px-4 py-5 sm:px-6">{children}</main>
          </div>
        </div>
      </div>
    </BranchProvider>
  );
}
