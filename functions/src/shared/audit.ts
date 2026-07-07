import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "./firebase";
import type { ActorProfile } from "./roles";

type AuditPayload = {
  actor: ActorProfile;
  action: string;
  entityType: string;
  entityId: string;
  branchId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(payload: AuditPayload) {
  await adminDb().collection("auditLogs").add({
    actorId: payload.actor.uid,
    actorRole: payload.actor.platformRole,
    branchId: payload.branchId ?? null,
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId,
    before: payload.before ?? null,
    after: payload.after ?? null,
    metadata: payload.metadata ?? {},
    createdAt: FieldValue.serverTimestamp(),
  });
}
