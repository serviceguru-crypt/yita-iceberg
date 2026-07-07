import { requireActiveUser } from "@/lib/server/auth/session";

export default async function ProfilePage() {
  const user = await requireActiveUser();

  return (
    <section className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account access is managed by an administrator.
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border bg-card p-4">
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Name
          </dt>
          <dd className="mt-2 text-sm font-medium">{user.displayName}</dd>
        </div>
        <div className="rounded-md border bg-card p-4">
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Email
          </dt>
          <dd className="mt-2 text-sm font-medium">{user.email}</dd>
        </div>
        <div className="rounded-md border bg-card p-4">
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Role
          </dt>
          <dd className="mt-2 text-sm font-medium capitalize">
            {user.platformRole.replaceAll("_", " ")}
          </dd>
        </div>
        <div className="rounded-md border bg-card p-4">
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Branches
          </dt>
          <dd className="mt-2 text-sm font-medium">
            {user.assignedBranchIds.length > 0
              ? user.assignedBranchIds.join(", ")
              : "All branches or none assigned"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
