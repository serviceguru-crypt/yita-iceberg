import { z } from "zod";

import { platformRoles } from "@/lib/domain/roles";

export const platformRoleSchema = z.enum(platformRoles);

export const userProfileSchema = z.object({
  displayName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean(),
  platformRole: platformRoleSchema,
  assignedBranchIds: z.array(z.string().min(1)),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1).optional(),
});

export const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const sessionSchema = z.object({
  idToken: z.string().min(1),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
