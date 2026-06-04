import { z } from "zod";
import { teamKeySchema } from "cs2-demo-format";
import { accountContextAvailabilitySchema } from "./analysis.js";
import { leaderboardMetricKeySchema } from "./leaderboard.js";

/**
 * 选手赛季档案。由 @cs2dak/presentation 从 SeasonCohortBundle 中单个选手派生。
 * 产品中立：身份用 playerKey/steamIds/externalUserId，不含数据库/路由/权限语义（规则 8）。
 * 不算评分公式；rating/style 均来自 cohort 已接线的 rival-rating 结果（规则 5）。
 * 缺失保持 null（规则 6）；style 在 PRISM 缺失时整体为 null。
 */

export const rrBreakdownEntrySchema = z.object({
  key: z.enum(["combat", "trade", "clutch", "objective", "utility"]),
  label: z.string(),
  value: z.number()
});

/** PRISM 单根轴的展示项（八维风格雷达）。 */
export const playerStyleAxisSchema = z.object({
  key: z.string(), // PrismAxisKey
  label: z.string(),
  percentile: z.number().min(0).max(100)
});

export const playerStyleSchema = z.object({
  weightsVersion: z.string(),
  /** 整体着色依据：RR 百分位（0–100）。 */
  rrPercentile: z.number().min(0).max(100),
  /** 八根轴，按 PRISM_AXIS_ORDER 排序。 */
  axes: z.array(playerStyleAxisSchema)
});

export const playerSeasonTrendPointSchema = z.object({
  matchId: z.string(),
  rivalhubRR: z.number().nonnegative(),
  hltvRating: z.number().nonnegative()
});

export const playerWeaponProfileEntrySchema = z.object({
  weapon: z.string(),
  label: z.string(),
  kills: z.number().int().nonnegative(),
  killSharePercent: z.number().min(0).max(100)
});

export const playerSeasonProfileSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/player-profile-0.1"),
  weightsVersion: z.string(),
  playerKey: z.string(),
  name: z.string(),
  steamIds: z.array(z.string()),
  externalUserId: z.string().nullable(),
  teamKeys: z.array(teamKeySchema),
  mapCount: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  accountContextStatus: z.object({
    buyDelta: accountContextAvailabilitySchema,
    manState: accountContextAvailabilitySchema
  }),
  rating: z.object({
    rivalhubRR: z.number().nonnegative(),
    rivalhubRRRaw: z.number(),
    hltvRating: z.number().nonnegative(),
    hltvPercentile: z.number().min(0).max(100),
    breakdown: z.array(rrBreakdownEntrySchema)
  }),
  /** 与排行榜同口径的展示指标（共享 SEASON_STAT_VIEWS 渲染列）。 */
  metrics: z.record(leaderboardMetricKeySchema, z.number().nullable()),
  weapons: z.array(playerWeaponProfileEntrySchema),
  highlights: z.object({
    wallbangKills: z.number().int().nonnegative().nullable(),
    noScopeKills: z.number().int().nonnegative().nullable(),
    throughSmokeKills: z.number().int().nonnegative().nullable(),
    collateralKills: z.number().int().nonnegative().nullable()
  }),
  style: playerStyleSchema.nullable(),
  /** 每场 RR 趋势，按 matchId 升序。 */
  perMatch: z.array(playerSeasonTrendPointSchema),
  /** 相对赛季 cohort 的强项 / 弱项（按技能类指标的 cohort 百分位派生）。 */
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string())
});

export type RRBreakdownEntry = z.infer<typeof rrBreakdownEntrySchema>;
export type PlayerStyleAxis = z.infer<typeof playerStyleAxisSchema>;
export type PlayerStyle = z.infer<typeof playerStyleSchema>;
export type PlayerSeasonTrendPoint = z.infer<typeof playerSeasonTrendPointSchema>;
export type PlayerWeaponProfileEntry = z.infer<typeof playerWeaponProfileEntrySchema>;
export type PlayerSeasonProfile = z.infer<typeof playerSeasonProfileSchema>;
