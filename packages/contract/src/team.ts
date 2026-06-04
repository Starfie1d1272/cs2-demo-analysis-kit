import { z } from "zod";
import { leaderboardMetricKeySchema } from "./leaderboard.js";
import { playerStyleAxisSchema } from "./player.js";

export const teamRosterInputSchema = z.object({
  teamKey: z.string(),
  name: z.string(),
  playerKeys: z.array(z.string()).min(1)
});

export const teamMemberSummarySchema = z.object({
  playerKey: z.string(),
  name: z.string(),
  mapCount: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  metrics: z.record(leaderboardMetricKeySchema, z.number().nullable())
});

export const teamMetricLeaderSchema = z.object({
  metric: z.enum(["rivalhubRR", "adr", "kast", "firstKillPer100"]),
  label: z.string(),
  playerKey: z.string(),
  name: z.string(),
  value: z.number()
});

export const teamRoleSpecialistSchema = playerStyleAxisSchema.extend({
  playerKey: z.string(),
  name: z.string()
});

export const teamCohortSummarySchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/team-summary-0.1"),
  weightsVersion: z.string(),
  teamKey: z.string(),
  name: z.string(),
  members: z.array(teamMemberSummarySchema).min(1),
  coreMembers: z.array(teamMemberSummarySchema).min(1),
  averages: z.object({
    rivalhubRR: z.number().nonnegative(),
    hltvRating: z.number().nonnegative(),
    adr: z.number().nonnegative(),
    kd: z.number().nullable(),
    kast: z.number().min(0).max(100),
    confidence: z.number().min(0).max(1)
  }),
  performance: z.object({
    firstKills: z.number().int().nonnegative(),
    firstDeaths: z.number().int().nonnegative(),
    openingDuelWinRate: z.number().min(0).max(1).nullable(),
    clutchAttempts: z.number().int().nonnegative(),
    clutchWins: z.number().int().nonnegative(),
    clutchWinRate: z.number().min(0).max(1).nullable()
  }),
  /** 队伍 PRISM：成员各轴百分位的简单平均，不重算 PRISM。 */
  style: z.object({
    axes: z.array(playerStyleAxisSchema)
  }).nullable(),
  leaders: z.array(teamMetricLeaderSchema),
  roleComplementarity: z.object({
    /** 成员主轴覆盖率：不同主轴数 / min(成员数, 8)，0–100。 */
    coverageScore: z.number().min(0).max(100),
    specialists: z.array(teamRoleSpecialistSchema),
    weakAxes: z.array(playerStyleAxisSchema)
  })
});

export type TeamRosterInput = z.infer<typeof teamRosterInputSchema>;
export type TeamMemberSummary = z.infer<typeof teamMemberSummarySchema>;
export type TeamMetricLeader = z.infer<typeof teamMetricLeaderSchema>;
export type TeamRoleSpecialist = z.infer<typeof teamRoleSpecialistSchema>;
export type TeamCohortSummary = z.infer<typeof teamCohortSummarySchema>;
