"use client";

import { useEffect, useMemo, useState } from "react";

type DisplayNamesResponse = {
  ok?: boolean;
  names?: Record<string, string>;
};

export function useUserDisplayNames(
  userIds: Array<string | null | undefined>,
  branchId: string | null | undefined,
) {
  const idsKey = useMemo(
    () => [...new Set(userIds.filter((value): value is string => Boolean(value)))].sort().join(","),
    [userIds],
  );
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (!branchId || ids.length === 0) {
      setNames({});
      return;
    }

    const controller = new AbortController();
    setNames({});
    void fetch("/api/display-names", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branchId, userIds: ids }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as DisplayNamesResponse;
        if (response.ok && result.ok && result.names) setNames(result.names);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Unable to load staff display names", error);
      });

    return () => controller.abort();
  }, [branchId, idsKey]);

  return (userId: string | null | undefined, fallback = "Staff member") => {
    if (!userId) return fallback;
    if (userId === "system") return "System";
    return names[userId] ?? fallback;
  };
}
