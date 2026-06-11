import type { RRResult, PrismResult } from "@rivalhub/rival-rating";
import { z } from "zod";
import { teamKeySchema, sideSchema, economyTypeSchema, teamEconomySchema, grenadeTypeSchema } from "cs2-demo-format";
import { qaReportSchema } from "./qa.js";
import { rrIndicatorsSchema } from "./scoring.js";

export const playerRoundFactSchema = z.object({
  roundNumber: z.number().int().positive(),
  steamId64: z.string(),
  name: z.string(),
  teamKey: teamKeySchema,
  side: sideSchema,
  survived: z.boolean(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  damage: z.number().int().nonnegative(),
  utilityDamage: z.number().int().nonnegative(),
  flashAssists: z.number().int().nonnegative(),
  tradeKills: z.number().int().nonnegative(),
  tradedDeaths: z.number().int().nonnegative(),
  openingDuel: z.enum(["none", "won", "lost"]),
  kastTags: z.array(z.enum(["kill", "assist", "survive", "trade"])),
  equipmentValue: z.number().int().nonnegative().nullable(),
  economyType: economyTypeSchema.nullable()
});

export const playerIndicatorRowSchema = z.object({
  steamId64: z.string(),
  name: z.string(),
  teamKey: teamKeySchema,
  indicators: rrIndicatorsSchema,
  rr: z.custom<RRResult>(),
  rrPercentile: z.number().min(0).max(100),
  prism: z.custom<PrismResult>().nullable()
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
  ratingSeed: z.number().nonnegative(),
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

export const weaponKillRowSchema = z.object({
  weapon: z.string(),
  kills: z.number().int().nonnegative(),
  headshotKills: z.number().int().nonnegative(),
  tradeKills: z.number().int().nonnegative(),
  noScopeKills: z.number().int().nonnegative(),
  throughSmokeKills: z.number().int().nonnegative(),
  wallbangKills: z.number().int().nonnegative(),
  penetratedObjects: z.number().int().nonnegative()
});

export const playerWeaponHighlightFactsSchema = z.object({
  steamId64: z.string(),
  totalKills: z.number().int().nonnegative(),
  weapons: z.array(weaponKillRowSchema),
  highlights: z.object({
    wallbangKills: z.number().int().nonnegative().nullable(),
    noScopeKills: z.number().int().nonnegative().nullable(),
    throughSmokeKills: z.number().int().nonnegative().nullable(),
    collateralKills: z.number().int().nonnegative().nullable()
  })
});

export const accountContextAvailabilitySchema = z.enum(["available", "partial", "missing"]);

export const timelineEventSchema = z.object({
  id: z.string(),
  roundNumber: z.number().int().positive(),
  tick: z.number().int().positive(),
  timeSeconds: z.number().nonnegative(),
  clockPhase: z.enum(["freeze", "round", "bomb", "round-end"]),
  clockSeconds: z.number().nonnegative(),
  clockLabel: z.string(),
  type: z.enum(["kill", "bomb", "grenade", "round-end"]),
  label: z.string(),
  teamKey: teamKeySchema.nullable()
});

export const economyPointSchema = z.object({
  roundNumber: z.number().int().positive(),
  teamA: z.number().int().nonnegative(),
  teamB: z.number().int().nonnegative(),
  advantage: z.number().int(),
  teamAEconomy: teamEconomySchema,
  teamBEconomy: teamEconomySchema,
  winnerTeamKey: teamKeySchema
});

export const heatmapPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  roundNumber: z.number().int().positive(),
  teamKey: teamKeySchema.nullable(),
  steamId64: z.string().nullable(),
  side: sideSchema.nullable(),
  kind: z.enum(["kill", "death", "grenade"]),
  grenadeType: grenadeTypeSchema.nullable()
});

export const mapViewSchema = z.object({
  name: z.string(),
  radarImageUrl: z.string().nullable(),
  /** 双层地图（de_nuke / de_vertigo）的下层底图；单层地图为 null。 */
  lowerRadarImageUrl: z.string().nullable().optional().default(null),
  calibrated: z.boolean()
});

export const analysisProvenanceSchema = z.object({
  analysisVersion: z.string(),
  sourceSchemaVersion: z.literal("cs2-demo-format/2.0"),
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
  sourceSchemaVersion: z.literal("cs2-demo-format/2.0"),
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

export const demoViewModelSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  map: mapViewSchema,
  scoreline: z.string(),
  teams: analysisBundleSchema.shape.teams,
  scoreboard: z.array(playerScoreboardRowSchema),
  playerIndicators: z.array(playerIndicatorRowSchema),
  playerRoundFacts: z.array(playerRoundFactSchema),
  timeline: z.array(timelineEventSchema),
  economy: z.array(economyPointSchema),
  heatmap: z.array(heatmapPointSchema),
  qa: qaReportSchema
});

export type PlayerRoundFact = z.infer<typeof playerRoundFactSchema>;
export type PlayerIndicatorRow = z.infer<typeof playerIndicatorRowSchema>;
export type PlayerScoreboardRow = z.infer<typeof playerScoreboardRowSchema>;
export type WeaponKillRow = z.infer<typeof weaponKillRowSchema>;
export type PlayerWeaponHighlightFacts = z.infer<typeof playerWeaponHighlightFactsSchema>;
export type AccountContextAvailability = z.infer<typeof accountContextAvailabilitySchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type EconomyPoint = z.infer<typeof economyPointSchema>;
export type GrenadeType = z.infer<typeof grenadeTypeSchema>;
export type HeatmapPoint = z.infer<typeof heatmapPointSchema>;
export type AnalysisBundle = z.infer<typeof analysisBundleSchema>;
export type AnalysisProvenance = z.infer<typeof analysisProvenanceSchema>;
export type DemoViewModel = z.infer<typeof demoViewModelSchema>;
