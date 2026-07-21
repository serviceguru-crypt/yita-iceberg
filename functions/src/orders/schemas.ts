import { z } from "zod";

export const orderStatusSchema = z.enum([
  "draft",
  "awaiting_discount_approval",
  "awaiting_payment",
  "awaiting_release",
  "completed",
  "cancelled",
  "expired",
  "partially_reversed",
  "reversed",
]);

export const paymentStatusSchema = z.enum(["unpaid", "paid", "credit"]);

export const paymentMethodSchema = z.enum([
  "cash",
  "bank_transfer",
  "pos_terminal",
  "credit",
]);

const idempotencyKey = z.string().trim().min(8).max(200);

export const orderItemInputSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  discountPercent: z.number().int().min(0).max(100).default(0),
  discountReason: z.string().trim().min(1).max(300).optional(),
});

export const createOrderSchema = z.object({
  branchId: z.string().trim().min(1),
  customerType: z.enum(["walk_in", "registered"]),
  customerId: z.string().trim().min(1).optional(),
  customerSnapshot: z
    .object({
      name: z.string().trim().min(1).optional(),
      phone: z.string().trim().min(1).optional(),
      address: z.string().trim().min(1).optional(),
    })
    .optional(),
  items: z.array(orderItemInputSchema).min(1),
  idempotencyKey,
});

export const updateUnpaidOrderSchema = z.object({
  orderId: z.string().trim().min(1),
  items: z.array(orderItemInputSchema).min(1),
  idempotencyKey,
});

export const cancelOrderSchema = z.object({
  orderId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey,
});

export const requestDiscountApprovalSchema = z.object({
  orderId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500).optional(),
  idempotencyKey,
});

export const approveDiscountSchema = z.object({
  orderId: z.string().trim().min(1),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(3).max(500).optional(),
  idempotencyKey,
});

export const paymentLineInputSchema = z.object({
  paymentMethod: paymentMethodSchema,
  amountKobo: z.number().int().positive(),
  reference: z.string().trim().min(1).max(200).optional(),
  proofUploadIntentId: z.string().trim().min(1).max(200).optional(),
  proofStoragePath: z.string().trim().min(1).max(500).optional(),
});

export const confirmPaymentSchema = z.object({
  orderId: z.string().trim().min(1),
  paymentLines: z.array(paymentLineInputSchema).min(1),
  idempotencyKey,
});

export const administerSaleSchema = createOrderSchema.extend({
  paymentLines: z.array(paymentLineInputSchema).min(1),
  administrationReason: z.string().trim().min(5).max(500),
});

export const verifyAndCompleteReleaseSchema = z
  .object({
    orderId: z.string().trim().min(1).optional(),
    orderNumber: z.string().trim().min(1).optional(),
    qrToken: z.string().trim().min(1).optional(),
    verificationMethod: z.enum(["qr", "manual"]),
    manualReason: z.string().trim().min(3).max(500).optional(),
    idempotencyKey,
  })
  .refine((data) => data.orderId || data.orderNumber, {
    message: "Order ID or order number is required.",
  })
  .refine((data) => data.verificationMethod !== "manual" || data.manualReason, {
    message: "Manual verification reason is required.",
  })
  .refine((data) => data.verificationMethod !== "qr" || data.qrToken, {
    message: "QR token is required.",
  });

export const reissueOrderQrTokenSchema = z.object({
  orderId: z.string().trim().min(1),
  idempotencyKey,
});

export const validateReleaseQrSchema = z.object({
  orderNumber: z.string().trim().min(1),
  qrToken: z.string().trim().min(1),
});

export const createPaymentProofUploadIntentSchema = z.object({
  orderId: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(180),
  contentType: z
    .string()
    .trim()
    .regex(/^(image\/(jpeg|png|webp)|application\/pdf)$/),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  idempotencyKey,
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type PaymentLineInput = z.infer<typeof paymentLineInputSchema>;
export type AdministerSaleInput = z.infer<typeof administerSaleSchema>;
