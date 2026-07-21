import { adminDb } from "@/lib/server/firebase-admin";

export async function loadUserDisplayNames(userIds: Array<string | null | undefined>) {
  const ids = [...new Set(userIds.filter((value): value is string => Boolean(value)))];
  const names: Record<string, string> = {};

  if (ids.includes("system")) names.system = "System";
  const profileIds = ids.filter((uid) => uid !== "system");
  if (profileIds.length === 0) return names;

  const snapshots = await adminDb().getAll(
    ...profileIds.map((uid) => adminDb().doc(`users/${uid}`)),
  );
  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;
    const displayName = snapshot.data()?.displayName;
    if (typeof displayName === "string" && displayName.trim()) {
      names[snapshot.id] = displayName.trim();
    }
  }

  return names;
}
