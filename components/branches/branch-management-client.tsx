"use client";

import { useMemo, useState } from "react";
import { IconBuildingStore, IconRefresh } from "@tabler/icons-react";

import { useBranchContext } from "@/components/branch/branch-context";
import { Field } from "@/components/shared/field";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { isAdminRole } from "@/lib/domain/roles";
import type { BranchDocument } from "@/lib/types/operational";

type BranchResponse = {
  ok?: boolean;
  message?: string;
  branch?: BranchDocument;
};

const defaultSettings = {
  requireDiscountReason: true,
  requireTransferProof: false,
  allowCreditSales: true,
  allowSplitPayments: true,
};

function settingLabel(value: boolean) {
  return value ? "On" : "Off";
}

export function BranchManagementClient() {
  const { branches, reloadBranches, user } = useBranchContext();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [settings, setSettings] = useState(defaultSettings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageBranches = isAdminRole(user.platformRole);
  const sortedBranches = useMemo(
    () => [...branches].sort((first, second) => first.name.localeCompare(second.name)),
    [branches],
  );

  function setSetting(key: keyof typeof defaultSettings, value: boolean) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function createBranch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/branches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, code, settings }),
        credentials: "same-origin",
      });
      const result = (await response.json()) as BranchResponse;

      if (!response.ok || !result.ok || !result.branch) {
        throw new Error(result.message || "Unable to create branch.");
      }

      setMessage(`${result.branch.name} branch created.`);
      setName("");
      setCode("");
      setSettings(defaultSettings);
      await reloadBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create branch.");
    } finally {
      setBusy(false);
    }
  }

  if (!canManageBranches) {
    return (
      <OperationState
        detail="Only admin and super-admin users can create and manage branches."
        title="Branch management restricted"
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Branches</h1>
          <p className="text-sm text-muted-foreground">
            Create operating branches and configure workflow rules.
          </p>
        </div>
        <Button onClick={() => void reloadBranches()} type="button" variant="outline">
          <IconRefresh />
          Refresh
        </Button>
      </div>

      <section className="grid gap-4 rounded-lg border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <form className="space-y-4" onSubmit={createBranch}>
          <div>
            <h2 className="text-lg font-semibold tracking-normal">Create branch</h2>
            <p className="text-sm text-muted-foreground">
              New branches become available for staff assignment and branch selection.
            </p>
          </div>

          {message ? <OperationState detail={message} title="Branch ready" /> : null}
          {error ? <OperationState detail={error} title="Branch creation failed" /> : null}

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Branch name">
              <input
                className="h-9 rounded-md border bg-background px-3"
                onChange={(event) => setName(event.target.value)}
                placeholder="Abuja Main"
                required
                value={name}
              />
            </Field>
            <Field label="Branch code">
              <input
                className="h-9 rounded-md border bg-background px-3 uppercase"
                onChange={(event) => setCode(event.target.value)}
                placeholder="ABJ-MAIN"
                required
                value={code}
              />
            </Field>
          </div>

          <div className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-normal">
              <input
                checked={settings.requireDiscountReason}
                onChange={(event) =>
                  setSetting("requireDiscountReason", event.target.checked)
                }
                type="checkbox"
              />
              <span>Require discount reason</span>
            </label>
            <label className="flex items-center gap-2 text-sm font-normal">
              <input
                checked={settings.requireTransferProof}
                onChange={(event) =>
                  setSetting("requireTransferProof", event.target.checked)
                }
                type="checkbox"
              />
              <span>Require transfer proof</span>
            </label>
            <label className="flex items-center gap-2 text-sm font-normal">
              <input
                checked={settings.allowCreditSales}
                onChange={(event) => setSetting("allowCreditSales", event.target.checked)}
                type="checkbox"
              />
              <span>Allow credit sales</span>
            </label>
            <label className="flex items-center gap-2 text-sm font-normal">
              <input
                checked={settings.allowSplitPayments}
                onChange={(event) => setSetting("allowSplitPayments", event.target.checked)}
                type="checkbox"
              />
              <span>Allow split payments</span>
            </label>
          </div>

          <Button disabled={busy || !name.trim() || !code.trim()} type="submit">
            <IconBuildingStore />
            {busy ? "Creating" : "Create branch"}
          </Button>
        </form>

        <div className="rounded-lg border bg-background p-4 text-sm">
          <p className="font-medium">Branch setup flow</p>
          <div className="mt-3 space-y-2 text-muted-foreground">
            <p>Create the branch here.</p>
            <p>Add master products in the catalog.</p>
            <p>Use branch product setup to add selling prices and stock controls.</p>
            <p>Invite staff and assign them to the branch from Access management.</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-normal">Active branches</h2>
          <p className="text-sm text-muted-foreground">
            Branches available to admin workflows and user assignments.
          </p>
        </div>

        {sortedBranches.length === 0 ? (
          <OperationState
            detail="Create the first branch to unlock branch-based orders, inventory, and access assignment."
            title="No branches found"
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Discount reason</th>
                  <th className="px-3 py-2">Transfer proof</th>
                  <th className="px-3 py-2">Credit sales</th>
                  <th className="px-3 py-2">Split payments</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedBranches.map((branch) => (
                  <tr key={branch.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{branch.name}</p>
                      <p className="text-xs text-muted-foreground">{branch.id}</p>
                    </td>
                    <td className="px-3 py-2">{branch.code ?? "—"}</td>
                    <td className="px-3 py-2">
                      {settingLabel(branch.settings?.requireDiscountReason !== false)}
                    </td>
                    <td className="px-3 py-2">
                      {settingLabel(branch.settings?.requireTransferProof === true)}
                    </td>
                    <td className="px-3 py-2">
                      {settingLabel(branch.settings?.allowCreditSales !== false)}
                    </td>
                    <td className="px-3 py-2">
                      {settingLabel(branch.settings?.allowSplitPayments !== false)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
