"use client";

import { useEffect, useMemo, useState } from "react";
import { IconRefresh, IconUserPlus } from "@tabler/icons-react";

import { useBranchContext } from "@/components/branch/branch-context";
import { Field } from "@/components/shared/field";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { isAdminRole, platformRoles, type PlatformRole } from "@/lib/domain/roles";

type AccessUser = {
  uid: string;
  displayName: string;
  email: string;
  phone?: string | null;
  isActive: boolean;
  platformRole: PlatformRole;
  assignedBranchIds: string[];
};

const roleLabels: Record<PlatformRole, string> = {
  order_registrar: "Order registrar",
  cashier: "Cashier",
  release_verifier: "Release verifier",
  branch_manager: "Branch manager",
  admin: "Admin",
  super_admin: "Super admin",
};

function requiresBranchAssignment(role: PlatformRole) {
  return role !== "admin" && role !== "super_admin";
}

export function AccessManagementClient() {
  const { branches, reloadBranches, user } = useBranchContext();
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [platformRole, setPlatformRole] = useState<PlatformRole>("order_registrar");
  const [assignedBranchIds, setAssignedBranchIds] = useState<string[]>([]);

  const canManageAccess = isAdminRole(user.platformRole);
  const canAssignSuperAdmin = user.platformRole === "super_admin";
  const roleOptions = useMemo(
    () => platformRoles.filter((role) => canAssignSuperAdmin || role !== "super_admin"),
    [canAssignSuperAdmin],
  );
  const branchRequired = requiresBranchAssignment(platformRole);
  const branchNames = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );

  async function loadUsers() {
    if (!canManageAccess) return;

    setLoadingUsers(true);
    setError(null);
    try {
      const response = await fetch("/api/access/users", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        users?: AccessUser[];
        message?: string;
      };

      if (!response.ok || !result.ok || !Array.isArray(result.users)) {
        throw new Error(result.message || "Unable to load users.");
      }

      setUsers(result.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users.");
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, [canManageAccess]);

  function toggleBranch(branchId: string) {
    setAssignedBranchIds((current) =>
      current.includes(branchId)
        ? current.filter((id) => id !== branchId)
        : [...current, branchId],
    );
  }

  function handleRoleChange(nextRole: PlatformRole) {
    setPlatformRole(nextRole);
    if (!requiresBranchAssignment(nextRole)) {
      setAssignedBranchIds([]);
    }
  }

  async function inviteUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    setInviteLink(null);
    setCopied(false);

    try {
      const response = await fetch("/api/access/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          displayName,
          ...(phone.trim() ? { phone } : {}),
          platformRole,
          assignedBranchIds: branchRequired ? assignedBranchIds : [],
        }),
        credentials: "same-origin",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        inviteLink?: string;
        message?: string;
      };

      if (!response.ok || !result.ok || !result.inviteLink) {
        throw new Error(result.message || "Unable to invite user.");
      }

      setInviteLink(result.inviteLink);
      setMessage("User invited. Copy the setup link and share it with them.");
      setDisplayName("");
      setEmail("");
      setPhone("");
      setPlatformRole("order_registrar");
      setAssignedBranchIds([]);
      await Promise.all([loadUsers(), reloadBranches()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to invite user.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;

    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
  }

  if (!canManageAccess) {
    return (
      <OperationState
        detail="Only admin and super-admin users can invite staff and manage role assignments."
        title="Access restricted"
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Access management</h1>
          <p className="text-sm text-muted-foreground">
            Invite staff, assign workflow roles, and control branch access.
          </p>
        </div>
        <Button onClick={() => void loadUsers()} type="button" variant="outline">
          <IconRefresh />
          Refresh
        </Button>
      </div>

      <section className="grid gap-4 rounded-lg border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <form className="space-y-4" onSubmit={inviteUser}>
          <div>
            <h2 className="text-lg font-semibold tracking-normal">Invite user</h2>
            <p className="text-sm text-muted-foreground">
              Generate a password setup link, copy it, and share it with the invited user.
            </p>
          </div>

          {message ? <OperationState detail={message} title="Invite ready" /> : null}
          {error ? <OperationState detail={error} title="Access management error" /> : null}
          {inviteLink ? (
            <div className="space-y-3 rounded-lg border bg-background p-4">
              <div>
                <p className="font-medium">Invite link</p>
                <p className="text-sm text-muted-foreground">
                  Share this link with the invited user so they can set their password.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="h-9 min-w-0 flex-1 rounded-md border bg-muted px-3 text-sm"
                  readOnly
                  value={inviteLink}
                />
                <Button onClick={() => void copyInviteLink()} type="button" variant="outline">
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Full name">
              <input
                className="h-9 rounded-md border bg-background px-3"
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </Field>
            <Field label="Email">
              <input
                className="h-9 rounded-md border bg-background px-3"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </Field>
            <Field label="Phone">
              <input
                className="h-9 rounded-md border bg-background px-3"
                onChange={(event) => setPhone(event.target.value)}
                value={phone}
              />
            </Field>
            <Field label="Role">
              <select
                className="h-9 rounded-md border bg-background px-3"
                onChange={(event) => handleRoleChange(event.target.value as PlatformRole)}
                value={platformRole}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {branchRequired ? (
            <Field label="Branch assignment">
              <div className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-2">
                {branches.length > 0 ? (
                  branches.map((branch) => (
                    <label className="flex items-center gap-2 text-sm font-normal" key={branch.id}>
                      <input
                        checked={assignedBranchIds.includes(branch.id)}
                        onChange={() => toggleBranch(branch.id)}
                        type="checkbox"
                      />
                      <span>{branch.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No active branches are available.
                  </p>
                )}
              </div>
            </Field>
          ) : null}

          <Button
            disabled={
              busy ||
              !displayName.trim() ||
              !email.trim() ||
              (branchRequired && assignedBranchIds.length === 0)
            }
            type="submit"
          >
            <IconUserPlus />
            {busy ? "Generating" : "Generate invite link"}
          </Button>
        </form>

        <div className="rounded-lg border bg-background p-4 text-sm">
          <p className="font-medium">Role rules</p>
          <div className="mt-3 space-y-2 text-muted-foreground">
            <p>Operational staff must be assigned to at least one branch.</p>
            <p>Admin users can manage company workflows and invite staff.</p>
            <p>Only super-admin users can create or assign super-admin access.</p>
            <p>Invite links are copied here and shared manually by the inviter.</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-normal">Users</h2>
          <p className="text-sm text-muted-foreground">
            Active and inactive staff profiles currently registered in the system.
          </p>
        </div>
        {loadingUsers ? <OperationState title="Loading users" /> : null}
        {!loadingUsers && users.length === 0 ? (
          <OperationState detail="Invite a user to begin building the staff list." title="No users found" />
        ) : null}
        {users.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Branches</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((profile) => (
                  <tr key={profile.uid}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{profile.displayName}</p>
                      <p className="text-xs text-muted-foreground">{profile.email}</p>
                    </td>
                    <td className="px-3 py-2">{roleLabels[profile.platformRole]}</td>
                    <td className="max-w-[260px] px-3 py-2">
                      {profile.assignedBranchIds.length > 0
                        ? profile.assignedBranchIds
                            .map((branchId) => branchNames.get(branchId) ?? branchId)
                            .join(", ")
                        : "All branches"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-md bg-secondary px-2 py-1 text-xs">
                        {profile.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
