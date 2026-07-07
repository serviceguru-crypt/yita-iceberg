import { z } from "zod";

const idempotencyKey = z.string().trim().min(8).max(200);
const optionalText = z.string().trim().max(500).optional();
const productId = z.string().trim().min(1);
const branchId = z.string().trim().min(1);
const positiveQty = z.number().int().positive();
const nonNegativeQty = z.number().int().min(0);
const money = z.number().int().min(0);

export const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(40),
  description: optionalText,
  categoryId: z.string().trim().max(120).optional(),
  barcode: z.string().trim().min(1).max(120).optional(),
  idempotencyKey,
});

export const updateProductSchema = z.object({
  productId,
  sku: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  description: optionalText,
  categoryId: z.string().trim().max(120).optional(),
  barcode: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  idempotencyKey,
});

export const archiveProductSchema = z.object({
  productId,
  idempotencyKey,
});

export const addBranchProductSchema = z.object({
  branchId,
  productId,
  sellingPriceKobo: money,
  minimumPriceKobo: money,
  defaultCostPriceKobo: money.optional(),
  reorderLevel: z.number().int().min(0).default(0),
  idempotencyKey,
});

export const updateBranchProductSettingsSchema = z.object({
  branchId,
  productId,
  reorderLevel: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  idempotencyKey,
});

export const updateBranchProductPricingSchema = z.object({
  branchId,
  productId,
  sellingPriceKobo: money,
  minimumPriceKobo: money.optional(),
  defaultCostPriceKobo: money.optional(),
  idempotencyKey,
});

export const stockReceiptItemSchema = z.object({
  productId,
  quantity: positiveQty,
  unitCostKobo: z.number().int().positive(),
});

export const recordStockReceiptSchema = z.object({
  branchId,
  supplierName: optionalText,
  supplierReference: optionalText,
  deliveryReference: optionalText,
  notes: optionalText,
  items: z.array(stockReceiptItemSchema).min(1).max(100),
  idempotencyKey,
});

export const adjustmentTypeSchema = z.enum([
  "increase",
  "decrease",
  "damage_write_off",
]);

export const requestInventoryAdjustmentSchema = z.object({
  branchId,
  productId,
  adjustmentType: adjustmentTypeSchema,
  quantity: positiveQty,
  unitCostKobo: money.optional(),
  reason: z.string().trim().min(5).max(500),
  supportingReference: optionalText,
  idempotencyKey,
});

export const reviewInventoryAdjustmentSchema = z.object({
  requestId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500).optional(),
  idempotencyKey,
});

export const rejectInventoryAdjustmentSchema =
  reviewInventoryAdjustmentSchema.extend({
    reason: z.string().trim().min(3).max(500),
  });

export const startStockCountSchema = z.object({
  branchId,
  productIds: z.array(productId).min(1).max(100),
  idempotencyKey,
});

export const submitStockCountSchema = z.object({
  stockCountId: z.string().trim().min(1),
  items: z.array(z.object({ productId, countedQty: nonNegativeQty })).min(1).max(100),
  idempotencyKey,
});

export const reviewStockCountSchema = z.object({
  stockCountId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500).optional(),
  idempotencyKey,
});

export const rejectStockCountSchema = reviewStockCountSchema.extend({
  reason: z.string().trim().min(3).max(500),
});

export type StockReceiptItemInput = z.infer<typeof stockReceiptItemSchema>;
