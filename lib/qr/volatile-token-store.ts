"use client";

type QrTokenRecord = {
  orderNumber: string;
  qrToken: string;
  createdAtMs: number;
};

const orderQrTokens = new Map<string, QrTokenRecord>();
const releaseQrTokens = new Map<string, QrTokenRecord>();
const ttlMs = 10 * 60 * 1000;

function fresh(record: QrTokenRecord | undefined) {
  return record && Date.now() - record.createdAtMs <= ttlMs ? record : null;
}

export function storeOrderQrToken(
  orderId: string,
  value: { orderNumber: string; qrToken: string },
) {
  orderQrTokens.set(orderId, { ...value, createdAtMs: Date.now() });
}

export function readOrderQrToken(orderId: string) {
  const record = fresh(orderQrTokens.get(orderId));
  if (!record) {
    orderQrTokens.delete(orderId);
  }

  return record;
}

export function clearOrderQrToken(orderId: string) {
  orderQrTokens.delete(orderId);
}

export function storeReleaseQrToken(
  orderId: string,
  value: { orderNumber: string; qrToken: string },
) {
  releaseQrTokens.set(orderId, { ...value, createdAtMs: Date.now() });
}

export function readReleaseQrToken(orderId: string) {
  const record = fresh(releaseQrTokens.get(orderId));
  if (!record) {
    releaseQrTokens.delete(orderId);
  }

  return record;
}

export function clearReleaseQrToken(orderId: string) {
  releaseQrTokens.delete(orderId);
}
