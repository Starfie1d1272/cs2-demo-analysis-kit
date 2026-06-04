import { z } from "zod";

export const qaIssueSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().optional()
});

export const qaReportSchema = z.object({
  ok: z.boolean(),
  summary: z.object({
    issueCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative()
  }),
  issues: z.array(qaIssueSchema)
});

export type QaIssue = z.infer<typeof qaIssueSchema>;
export type QaReport = z.infer<typeof qaReportSchema>;
