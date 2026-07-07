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
    <div className="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2">
      <IconBuildingStore className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">Active branch</p>
        {branches.length > 1 || requiresSelection ? (
          <select
            aria-label="Active branch"
            className="w-full min-w-40 bg-transparent text-sm font-medium outline-none"
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
          <p className="truncate text-sm font-medium">
            {selectedBranch?.name ?? (error || "No branch assigned")}
          </p>
        )}
      </div>
    </div>
  );
}
