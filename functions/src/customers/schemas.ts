import { z } from "zod";

const idempotencyKey = z.string().trim().min(8).max(200);

export const createCustomerSchema = z.object({
  branchId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  address: z.string().trim().max(500).optional(),
  idempotencyKey,
});

export const updateCustomerSchema = z.object({
  customerId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  address: z.string().trim().max(500).optional(),
  idempotencyKey,
});
