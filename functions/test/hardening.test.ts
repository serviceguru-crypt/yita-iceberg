import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { expireStaleOrdersAction } from "../src/orders/service";
import { rebuildYesterdayReportSummariesAction } from "../src/reports/service";
import { logError, redactSensitive } from "../src/shared/logging";
import { appCheckEnforcementEnabled, callableOptions } from "../src/shared/runtime";
import { assertProductionGuard } from "../../scripts/shared/confirm-production";

function init() {
  if (getApps().length === 0) initializeApp({ projectId: "yita-iceberg" });
}

async function clearFirestore() {
  const db = getFirestore();
  const collections = await db.listCollections();
  await Promise.all(collections.map((collection) => db.recursiveDelete(collection)));
}

beforeAll(() => init());

beforeEach(async () => {
  vi.unstubAllEnvs();
  await clearFirestore();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await clearFirestore();
});

describe("production hardening helpers", () => {
  it("keeps App Check disabled in emulator mode and applies callable options", () => {
    vi.stubEnv("ENABLE_APP_CHECK_ENFORCEMENT", "true");
    vi.stubEnv("FUNCTIONS_EMULATOR", "true");
    expect(appCheckEnforcementEnabled()).toBe(false);
    expect(callableOptions().enforceAppCheck).toBe(false);
  });

  it("enables callable App Check outside emulator when configured", () => {
    vi.stubEnv("ENABLE_APP_CHECK_ENFORCEMENT", "true");
    vi.stubEnv("FUNCTIONS_EMULATOR", "false");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
    expect(appCheckEnforcementEnabled()).toBe(true);
    expect(callableOptions().enforceAppCheck).toBe(true);
  });

  it("redacts sensitive logging metadata", () => {
    const redacted = redactSensitive({
      qrToken: "raw-token",
      proofStoragePath: "payment-proofs/private.pdf",
      nested: { privateKey: "secret", allowed: "ok" },
    });
    expect(JSON.stringify(redacted)).not.toContain("raw-token");
    expect(JSON.stringify(redacted)).not.toContain("private.pdf");
    expect(JSON.stringify(redacted)).toContain("ok");
    const reference = logError("hardening.test", new Error("boom"), { password: "secret" });
    expect(reference).toMatch(/^ERR-\d{8}-[A-F0-9]{6}$/);
  });

  it("prevents production script execution without explicit confirmation", () => {
    expect(() =>
      assertProductionGuard({
        appEnv: "production",
        projectId: "yita-iceberg-production",
        allowProduction: false,
      }),
    ).toThrow(/Refusing/);
    expect(() =>
      assertProductionGuard({
        appEnv: "production",
        projectId: "yita-iceberg-production",
        allowProduction: true,
        confirmation: "I_UNDERSTAND_THIS_TARGETS_PRODUCTION",
      }),
    ).not.toThrow();
  });

  it("keeps stale-order expiry idempotent", async () => {
    const db = getFirestore();
    await Promise.all([
      db.doc("branches/branch-a/inventory/product-1").set({
        onHandQty: 5,
        reservedQty: 2,
      }),
      db.doc("orders/stale-order").set({
        branchId: "branch-a",
        status: "awaiting_payment",
        paymentStatus: "unpaid",
        items: [{ productId: "product-1", quantity: 2 }],
        expiresAt: Timestamp.fromDate(new Date(Date.now() - 60_000)),
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);
    await expireStaleOrdersAction(10);
    await expireStaleOrdersAction(10);
    const order = await db.doc("orders/stale-order").get();
    const inventory = await db.doc("branches/branch-a/inventory/product-1").get();
    expect(order.data()?.status).toBe("expired");
    expect(inventory.data()?.reservedQty).toBe(0);
  });

  it("scheduled report-summary rebuild is bounded to active branches", async () => {
    const db = getFirestore();
    await Promise.all([
      db.doc("branches/branch-a").set({ name: "Branch A", isActive: true }),
      db.doc("branches/branch-b").set({ name: "Branch B", isActive: false }),
    ]);
    const result = await rebuildYesterdayReportSummariesAction();
    expect(result.branchCount).toBe(1);
    const summaries = await db.collection("reportSummaries").get();
    expect(summaries.docs.some((doc) => doc.id.startsWith("dailyBranch_branch-a"))).toBe(true);
    expect(summaries.docs.some((doc) => doc.id.startsWith("dailyBranch_branch-b"))).toBe(false);
  });
});
