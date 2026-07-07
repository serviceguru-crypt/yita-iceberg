import { AppShell } from "@/components/layout/app-shell";
import { requireSessionUser } from "@/lib/server/auth/session";

export default async function ProtectedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSessionUser();

  return <AppShell user={user}>{children}</AppShell>;
}
