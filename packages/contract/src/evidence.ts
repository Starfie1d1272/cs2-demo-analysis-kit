import { z } from "zod";

/**
 * 可定位的分析证据。
 *
 * 这是跨 core/cohort/presentation 的纯数据合同；它只说明要看哪一段比赛、
 * 以及这一段为何与结果有关，不携带 Studio 导航或持久化语义。
 */
export const evidenceRoleSchema = z.enum(["example", "supporting", "counterexample"]);

export const evidenceRefSchema = z.object({
  matchId: z.string().min(1),
  roundNumber: z.number().int().positive(),
  tick: z.number().int().positive().optional(),
  eventKey: z.string().min(1).optional(),
  areaKey: z.string().min(1).optional(),
  reason: z.string().min(1),
  role: evidenceRoleSchema.optional(),
});

export type EvidenceRole = z.infer<typeof evidenceRoleSchema>;
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
