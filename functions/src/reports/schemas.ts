import { z } from "zod";

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

export const branchScopeSchema = z.enum(["selected_branch", "all_branches"]);

export const reportTypeSchema = z.enum([
  "dashboard",
  "sales",
  "payments",
  "inventory",
  "stock_movements",
  "reversals",
  "credit",
  "staff_activity",
  "low_stock",
]);

export const reportInputSchema = z.object({
  branchId: z.string().trim().min(1).optional(),
  branchScope: branchScopeSchema.default("selected_branch"),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  pageCursor: z.string().trim().min(1).max(500).optional(),
  filters: z.record(z.string(), z.unknown()).default({}),
});

export const dashboardSummarySchema = reportInputSchema
  .extend({
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  });

export const exportReportSchema = reportInputSchema.extend({
  reportType: reportTypeSchema.exclude(["dashboard"]),
  format: z.enum(["csv"]).default("csv"),
});

export const rebuildReportSummariesSchema = z.object({
  branchId: z.string().trim().min(1).optional(),
  branchScope: branchScopeSchema.default("selected_branch"),
  startDate: isoDate,
  endDate: isoDate,
});

export type ReportInput = z.infer<typeof reportInputSchema>;
export type ExportReportInput = z.infer<typeof exportReportSchema>;
export type ReportType = z.infer<typeof reportTypeSchema>;
