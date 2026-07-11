import { AppShell } from "@/components/layout/app-shell";
import { requireSessionUser } from "@/lib/server/auth/session";

export default async function ProtectedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSessionUser();
  const clientUser = {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    platformRole: user.platformRole,
    assignedBranchIds: user.assignedBranchIds,
  };

  return <AppShell user={clientUser}>{children}</AppShell>;
}
