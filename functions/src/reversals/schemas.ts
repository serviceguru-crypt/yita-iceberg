import { z } from "zod";

const idempotencyKey = z.string().trim().min(8).max(200);
const money = z.number().int().min(0);
const positiveQty = z.number().int().positive();

export const reversalTypeSchema = z.enum([
  "full_reversal_with_stock_return",
  "full_reversal_without_stock_return",
  "partial_reversal_with_stock_return",
  "partial_reversal_without_stock_return",
  "refund_only",
  "credit_correction",
  "correction_note",
]);

export const refundMethodSchema = z.enum([
  "cash",
  "bank_transfer",
  "pos_reversal",
  "credit_note",
  "no_refund",
]);

export const reversalItemInputSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: positiveQty,
  stockReturnedQuantity: z.number().int().min(0).optional(),
});

export const getReversalPreviewSchema = z.object({
  orderId: z.string().trim().min(1),
});

export const createReversalRequestSchema = z.object({
  orderId: z.string().trim().min(1),
  reversalType: reversalTypeSchema,
  reason: z.string().trim().min(5).max(500),
  internalNote: z.string().trim().max(500).optional(),
  items: z.array(reversalItemInputSchema).max(100).default([]),
  refundAmountKobo: money.default(0),
  creditReductionKobo: money.default(0),
  refundMethod: refundMethodSchema.default("no_refund"),
  idempotencyKey,
});

export const approveReversalRequestSchema = z.object({
  reversalId: z.string().trim().min(1),
  approvalNote: z.string().trim().max(500).optional(),
  idempotencyKey,
});

export const rejectReversalRequestSchema = z.object({
  reversalId: z.string().trim().min(1),
  rejectionReason: z.string().trim().min(3).max(500),
  idempotencyKey,
});

export const cancelReversalRequestSchema = z.object({
  reversalId: z.string().trim().min(1),
  cancellationReason: z.string().trim().min(3).max(500),
  idempotencyKey,
});

export const completeApprovedReversalSchema = z.object({
  reversalId: z.string().trim().min(1),
  completionNote: z.string().trim().max(500).optional(),
  idempotencyKey,
});

export type ReversalType = z.infer<typeof reversalTypeSchema>;
export type RefundMethod = z.infer<typeof refundMethodSchema>;
export type ReversalItemInput = z.infer<typeof reversalItemInputSchema>;
