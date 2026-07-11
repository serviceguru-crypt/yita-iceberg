"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { isAdminRole } from "@/lib/domain/roles";
import type {
  BranchDocument,
  SessionUserForClient,
} from "@/lib/types/operational";

type BranchContextValue = {
  branches: BranchDocument[];
  selectedBranch: BranchDocument | null;
  selectedBranchId: string | null;
  loading: boolean;
  error: string | null;
  requiresSelection: boolean;
  selectBranch: (branchId: string) => void;
  reloadBranches: () => Promise<void>;
  user: SessionUserForClient;
};

const BranchContext = createContext<BranchContextValue | null>(null);

function storageKey(userId: string) {
  return `yita:selectedBranch:${userId}`;
}

export function BranchProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: SessionUserForClient;
}) {
  const [branches, setBranches] = useState<BranchDocument[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const admin = isAdminRole(user.platformRole);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/branches", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        branches?: BranchDocument[];
        message?: string;
      };

      if (!response.ok || !result.ok || !Array.isArray(result.branches)) {
        throw new Error(result.message || "Unable to load branch context.");
      }

      const nextBranches = result.branches;
      setBranches(nextBranches);
      const saved =
        typeof window !== "undefined"
          ? window.localStorage.getItem(storageKey(user.uid))
          : null;

      if (!admin && nextBranches.length === 1) {
        setSelectedBranchId(nextBranches[0].id);
      } else if (saved && nextBranches.some((branch) => branch.id === saved)) {
        setSelectedBranchId(saved);
      } else {
        setSelectedBranchId(null);
      }
    } catch (err) {
      console.error("Branch context load failed", err);
      setError(
        err instanceof Error ? err.message : "Unable to load branch context.",
      );
    } finally {
      setLoading(false);
    }
  }, [admin, user.assignedBranchIds, user.uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectBranch = useCallback(
    (branchId: string) => {
      setSelectedBranchId(branchId || null);
      if (typeof window !== "undefined") {
        if (branchId) {
          window.localStorage.setItem(storageKey(user.uid), branchId);
        } else {
          window.localStorage.removeItem(storageKey(user.uid));
        }
      }
    },
    [user.uid],
  );

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );

  const value = useMemo(
    () => ({
      branches,
      selectedBranch,
      selectedBranchId,
      loading,
      error,
      requiresSelection: branches.length > 0 && !selectedBranch,
      selectBranch,
      reloadBranches: load,
      user,
    }),
    [
      branches,
      error,
      load,
      loading,
      selectBranch,
      selectedBranch,
      selectedBranchId,
      user,
    ],
  );

  return (
    <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
  );
}

export function useBranchContext() {
  const value = useContext(BranchContext);
  if (!value) {
    throw new Error("useBranchContext must be used inside BranchProvider.");
  }

  return value;
}
