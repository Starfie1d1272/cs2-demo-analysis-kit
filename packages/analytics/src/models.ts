import { z } from "zod";
import { indicatorRatingResultSchema, rrIndicatorsSchema } from "@cs2dak/rating";
import { teamKeySchema, playerWeaponHighlightFactsSchema, playerRoundFactSchema, timelineEventSchema, economyPointSchema, heatmapPointSchema, qaReportSchema } from "@cs2dak/contract";

export const playerIndicatorRowSchema = indicatorRatingResultSchema.extend({
  name: z.string(),
  teamKey: teamKeySchema
});

export const playerScoreboardRowSchema = z.object({
  steamId64: z.string(),
  name: z.string(),
  teamKey: teamKeySchema,
  indicators: rrIndicatorsSchema,
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  adr: z.number().nonnegative(),
  kast: z.number().min(0).max(100),
  headshotPercent: z.number().min(0).max(100),
  entryKills: z.number().int().nonnegative(),
  tradeKills: z.number().int().nonnegative(),
  awpKills: z.number().int().nonnegative(),
  utilityDamage: z.number().int().nonnegative(),
  combatDeathCount: z.number().int().nonnegative().nullable(),
  bombDeathCount: z.number().int().nonnegative().nullable(),
  wallbangKillCount: z.number().int().nonnegative().nullable(),
  noScopeKillCount: z.number().int().nonnegative().nullable(),
  throughSmokeKillCount: z.number().int().nonnegative().nullable(),
  collateralKillCount: z.number().int().nonnegative().nullable(),
  bombPlantCount: z.number().int().nonnegative().nullable(),
  bombDefuseCount: z.number().int().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
  fieldAvailability: z.object({
    playerStats: z.enum(["available", "missing"]),
    economy: z.enum(["available", "missing"]),
    rounds: z.enum(["available", "missing"]),
    richKills: z.enum(["available", "partial", "missing"]),
    damages: z.enum(["available", "missing"]),
    bombs: z.enum(["available", "missing"])
  }),
  // rrBase（clamp 前的基础分）：被碾压方 KAST/KPR 低、死亡惩罚大时可为负，
  // 不能强制非负，否则一边倒的真实比赛整场导入失败。最终 rr 才被 clamp 到非负。
  ratingSeed: z.number(),
  rr: z.number().nonnegative(),
  rrPercentile: z.number().min(0).max(100),
  /** RR v2 账户分。单场为 frozen pro baseline：1.00 = 职业基线。 */
  accountRR: z.number().nonnegative(),
  /** 锚定/clamp 前的原始账户分（调试用）。 */
  accountRRRaw: z.number(),
  /** Combat 击杀项的 context 乘子（1.0 = context 未生效 / 已降级）。 */
  accountCombatContextFactor: z.number(),
  /** 六账户对 RR 的加权贡献（解释面板用）。 */
  accountBreakdown: z.object({
    combat: z.number(),
    trade: z.number(),
    mapControl: z.number(),
    clutch: z.number(),
    objective: z.number(),
    utility: z.number()
  }),
  /**
   * Combat context 分桶的可用性。
   * "available" = 采集到数据源（即使无相关样本，分桶为 0 也算 available）；
   * "missing" = 数据源缺失（parser 未产出），乘子已降级为 1.0，前端应显示"未启用"。
   */
  accountContextStatus: z.object({
    buyDelta: z.enum(["available", "missing"]),
    manState: z.enum(["available", "missing"])
  })
});

export const analysisProvenanceSchema = z.object({
  analysisVersion: z.string(),
  sourceSchemaVersion: z.literal("cs2-demo-format/3.0"),
  sourceDemoHash: z.string().nullable(),
  exporter: z.object({ name: z.string(), version: z.string() }),
  parser: z.object({ name: z.string(), version: z.string() }),
  ratingVersions: z.object({
    rr: z.string().nullable(),
    valueAccounts: z.string().nullable()
  })
});

export const analysisBundleSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/1.0"),
  sourceSchemaVersion: z.literal("cs2-demo-format/3.0"),
  provenance: analysisProvenanceSchema,
  mapName: z.string(),
  tickrate: z.number().int().positive(),
  teams: z.object({
    teamA: z.object({ name: z.string(), score: z.number().int().nonnegative() }),
    teamB: z.object({ name: z.string(), score: z.number().int().nonnegative() })
  }),
  scoreboard: z.array(playerScoreboardRowSchema),
  playerWeaponHighlights: z.array(playerWeaponHighlightFactsSchema),
  playerIndicators: z.array(playerIndicatorRowSchema),
  playerRoundFacts: z.array(playerRoundFactSchema),
  timeline: z.array(timelineEventSchema),
  economy: z.array(economyPointSchema),
  heatmap: z.array(heatmapPointSchema),
  qa: qaReportSchema
});

export type PlayerIndicatorRow = z.infer<typeof playerIndicatorRowSchema>;
export type PlayerScoreboardRow = z.infer<typeof playerScoreboardRowSchema>;
export type AnalysisBundle = z.infer<typeof analysisBundleSchema>;
export type AnalysisProvenance = z.infer<typeof analysisProvenanceSchema>;
