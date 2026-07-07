import { z } from "zod";

import { platformRoles } from "../shared/roles";

export const platformRoleSchema = z.enum(platformRoles);

export const provisionUserSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  platformRole: platformRoleSchema,
  assignedBranchIds: z.array(z.string().trim().min(1)).default([]),
});

export const updateUserProfileSchema = z.object({
  displayName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
});

export const updateUserAccessSchema = z.object({
  uid: z.string().trim().min(1),
  platformRole: platformRoleSchema,
  assignedBranchIds: z.array(z.string().trim().min(1)),
  isActive: z.boolean(),
});

export const userUidSchema = z.object({
  uid: z.string().trim().min(1),
});
