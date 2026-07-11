"use client";

import { IconBuildingStore } from "@tabler/icons-react";

import { useBranchContext } from "@/components/branch/branch-context";

export function BranchSelector() {
  const {
    branches,
    error,
    loading,
    requiresSelection,
    selectBranch,
    selectedBranch,
    selectedBranchId,
  } = useBranchContext();

  return (
    <div className="app-surface glass-edge flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2">
      <span className="glass-edge grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-foreground">
        <IconBuildingStore className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Active branch
        </p>
        {branches.length > 1 || requiresSelection ? (
          <select
            aria-label="Active branch"
            className="w-full min-w-40 bg-transparent text-sm font-semibold tracking-normal outline-none"
            disabled={loading}
            onChange={(event) => selectBranch(event.target.value)}
            value={selectedBranchId ?? ""}
          >
            <option value="">
              {loading ? "Loading branches" : "Select branch"}
            </option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="truncate text-sm font-semibold tracking-normal">
            {selectedBranch?.name ?? (error || "No branch assigned")}
          </p>
        )}
      </div>
    </div>
  );
}
