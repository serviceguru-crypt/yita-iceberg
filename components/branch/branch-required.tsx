"use client";

import { OperationState } from "@/components/shared/operation-state";
import { useBranchContext } from "@/components/branch/branch-context";

export function BranchRequired({ children }: { children: React.ReactNode }) {
  const { error, loading, reloadBranches, requiresSelection, selectedBranch } =
    useBranchContext();

  if (loading) {
    return <OperationState title="Loading branch context" />;
  }

  if (error) {
    return (
      <OperationState
        actionLabel="Retry"
        detail={error}
        onAction={() => void reloadBranches()}
        title="Branch context unavailable"
      />
    );
  }

  if (requiresSelection || !selectedBranch) {
    return (
      <OperationState
        detail="Choose an active branch from the header before continuing."
        title="Select a branch"
      />
    );
  }

  return children;
}
