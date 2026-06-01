import type {
  AccountSignalsV2,
  RRIndicators,
  RRResult,
  RRResultV2,
  PrismResult,
  ValueAccountsWeights
} from "@rivalhub/rival-rating";
import { z } from "zod";
import {
  blindRowSchema,
  blindsSchema,
  bombRowSchema,
  bombsSchema,
  clutchRowSchema,
  clutchesSchema,
  damageRowSchema,
  damagesSchema,
  economyTypeSchema,
  grenadeRowSchema,
  grenadesSchema,
  killRowSchema,
  killsSchema,
  manifestSchema,
  matchSchema,
  playerEconomiesSchema,
  playerEconomyRowSchema,
  playerRowSchema,
  playersSchema,
  playerStatsRowSchema,
  playerStatsSchema,
  positionRowSchema,
  positionsSchema,
  replaySchema,
  replayPlayerTrackSchema,
  replayRoundSchema,
  roundRowSchema,
  roundsSchema,
  shotRowSchema,
  shotsSchema,
  sideSchema,
  teamKeySchema,
  vec3Schema
} from "cs2-demo-format";

export {
  SCHEMAS_BY_KEY,
  blindRowSchema,
  blindsSchema,
  bombEventTypeSchema,
  bombRowSchema,
  bombsSchema,
  clutchRowSchema,
  clutchesSchema,
  damageRowSchema,
  damagesSchema,
  economyTypeSchema,
  endReasonSchema,
  grenadeRowSchema,
  grenadeTypeSchema,
  grenadesSchema,
  hitgroupSchema,
  killRowSchema,
  killsSchema,
  manifestSchema,
  matchSchema,
  playerEconomiesSchema,
  playerEconomyRowSchema,
  playerRowSchema,
  playersSchema,
  playerStatsRowSchema,
  playerStatsSchema,
  positionRowSchema,
  positionsSchema,
  replaySchema,
  replayPlayerTrackSchema,
  replayRoundSchema,
  roundRowSchema,
  roundsSchema,
  shotRowSchema,
  shotsSchema,
  sideSchema,
  steamId64Schema,
  teamKeySchema,
  teamSummarySchema,
  vec3Schema
} from "cs2-demo-format";

export const demoPackageSchema = z.object({
  manifest: manifestSchema,
  match: matchSchema,
  players: playersSchema,
  rounds: roundsSchema,
  playerEconomies: playerEconomiesSchema.default([]),
  playerStats: playerStatsSchema.default([]),
  kills: killsSchema.default([]),
  damages: damagesSchema.default([]),
  blinds: blindsSchema.default([]),
  bombs: bombsSchema.default([]),
  grenades: grenadesSchema.default([]),
  clutches: clutchesSchema.default([]),
  shots: shotsSchema.optional(),
  positions1s: positionsSchema.optional(),
  replay: replaySchema.optional(),
});

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

const clutchSplitSchema = z.object({
  count: z.number().int().nonnegative(),
  won: z.number().int().nonnegative()
});

export const rrIndicatorsSchema: z.ZodType<RRIndicators> = z.object({
  steamId64: z.string(),
  totalRounds: z.number().int().nonnegative(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  kpr: z.number().nonnegative(),
  dpr: z.number().nonnegative(),
  apr: z.number().nonnegative(),
  adr: z.number().nonnegative(),
  hsPercent: z.number().min(0).max(100),
  kast: z.number().min(0).max(100),
  survivalRate: z.number().min(0).max(1),
  twoKillRounds: z.number().int().nonnegative(),
  threeKillRounds: z.number().int().nonnegative(),
  fourKillRounds: z.number().int().nonnegative(),
  fiveKillRounds: z.number().int().nonnegative(),
  multiKillRate: z.number().min(0).max(1),
  firstKillCount: z.number().int().nonnegative(),
  firstDeathCount: z.number().int().nonnegative(),
  firstKillRate: z.number().nonnegative(),
  firstDeathRate: z.number().nonnegative(),
  openingDuelRate: z.number().nonnegative(),
  openingDuelWinRate: z.number().min(0).max(1),
  tradeKillCount: z.number().int().nonnegative(),
  tradeDeathCount: z.number().int().nonnegative(),
  tradeKillRate: z.number().nonnegative(),
  tradeDeathRate: z.number().nonnegative(),
  clutchAttempts: z.number().int().nonnegative(),
  clutchWins: z.number().int().nonnegative(),
  clutchWinRate: z.number().min(0).max(1),
  clutchFrequency: z.number().nonnegative(),
  clutchScore: z.number().nonnegative(),
  clutchScoreRate: z.number().nonnegative(),
  vsOne: clutchSplitSchema,
  vsTwo: clutchSplitSchema,
  vsThree: clutchSplitSchema,
  vsFour: clutchSplitSchema,
  vsFive: clutchSplitSchema,
  awpKills: z.number().int().nonnegative(),
  awpKillsPerRound: z.number().nonnegative(),
  awpKillRate: z.number().min(0).max(1),
  sniperKills: z.number().int().nonnegative(),
  sniperKillRate: z.number().min(0).max(1),
  awpMultiKillRate: z.number().min(0).max(1).nullable(),
  awpDuelWinRate: z.number().min(0).max(1).nullable(),
  utilityDamage: z.number().int().nonnegative(),
  utilityDamagePerRound: z.number().nonnegative(),
  flashAssistCount: z.number().int().nonnegative(),
  flashAssistPerRound: z.number().nonnegative(),
  blindDurationTotal: z.number().nonnegative(),
  blindDurationPerRound: z.number().nonnegative(),
  enemyFlashDurationSeconds: z.number().nonnegative().nullable(),
  enemyFlashDurationPerRound: z.number().nonnegative().nullable(),
  teamFlashDurationSeconds: z.number().nonnegative().nullable(),
  teamFlashDurationPerRound: z.number().nonnegative().nullable(),
  grenadeCount: z.number().int().nonnegative(),
  grenadeCountPerRound: z.number().nonnegative(),
  ecoRoundCount: z.number().int().nonnegative(),
  forceRoundCount: z.number().int().nonnegative(),
  fullBuyRoundCount: z.number().int().nonnegative(),
  pistolRoundCount: z.number().int().nonnegative(),
  avgEquipmentValue: z.number().nonnegative(),
  combatDeathCount: z.number().int().nonnegative().nullable(),
  bombDeathCount: z.number().int().nonnegative().nullable(),
  wallbangKillCount: z.number().int().nonnegative().nullable(),
  roundSwingTotal: z.number().nullable(),
  roundSwingPerKill: z.number().nullable()
});

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
  ratingSeed: z.number().nonnegative(),
  rr: z.number().nonnegative(),
  rrPercentile: z.number().min(0).max(100),
  accountRR: z.number().nonnegative(),
  accountRRRaw: z.number(),
  accountCombatContextFactor: z.number()
});

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
  teamAEconomy: economyTypeSchema,
  teamBEconomy: economyTypeSchema,
  winnerTeamKey: teamKeySchema
});

export const heatmapPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  roundNumber: z.number().int().positive(),
  teamKey: teamKeySchema.nullable(),
  steamId64: z.string().nullable(),
  kind: z.enum(["kill", "death", "grenade"])
});

export const mapViewSchema = z.object({
  name: z.string(),
  radarImageUrl: z.string().nullable(),
  calibrated: z.boolean()
});

export const analysisBundleSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/0.2"),
  sourceSchemaVersion: z.literal("cs2-demo-format/2.0"),
  mapName: z.string(),
  tickrate: z.number().int().positive(),
  teams: z.object({
    teamA: z.object({ name: z.string(), score: z.number().int().nonnegative() }),
    teamB: z.object({ name: z.string(), score: z.number().int().nonnegative() })
  }),
  scoreboard: z.array(playerScoreboardRowSchema),
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

export type Side = z.infer<typeof sideSchema>;
export type TeamKey = z.infer<typeof teamKeySchema>;
export type EconomyType = z.infer<typeof economyTypeSchema>;
export type Vec3 = z.infer<typeof vec3Schema>;
export type DemoPackage = z.infer<typeof demoPackageSchema>;
export type PackagePlayer = z.infer<typeof playerRowSchema>;
export type PackageRound = z.infer<typeof roundRowSchema>;
export type PackageKill = z.infer<typeof killRowSchema>;
export type PackageDamage = z.infer<typeof damageRowSchema>;
export type PackagePlayerEconomy = z.infer<typeof playerEconomyRowSchema>;
export type PackagePlayerStats = z.infer<typeof playerStatsRowSchema>;
export type PackageBlind = z.infer<typeof blindRowSchema>;
export type PackageBomb = z.infer<typeof bombRowSchema>;
export type PackageGrenade = z.infer<typeof grenadeRowSchema>;
export type PackageClutch = z.infer<typeof clutchRowSchema>;
export type PackageShot = z.infer<typeof shotRowSchema>;
export type PackagePosition = z.infer<typeof positionRowSchema>;
export type QaIssue = z.infer<typeof qaIssueSchema>;
export type QaReport = z.infer<typeof qaReportSchema>;
export type PlayerRoundFact = z.infer<typeof playerRoundFactSchema>;
export type PlayerIndicatorRow = z.infer<typeof playerIndicatorRowSchema>;
export type PlayerScoreboardRow = z.infer<typeof playerScoreboardRowSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type EconomyPoint = z.infer<typeof economyPointSchema>;
export type HeatmapPoint = z.infer<typeof heatmapPointSchema>;
export type AnalysisBundle = z.infer<typeof analysisBundleSchema>;
export type DemoViewModel = z.infer<typeof demoViewModelSchema>;
export type Replay = z.infer<typeof replaySchema>;
export type ReplayRound = z.infer<typeof replayRoundSchema>;
export type ReplayPlayerTrack = z.infer<typeof replayPlayerTrackSchema>;
export type { AccountSignalsV2, RRIndicators, RRResult, RRResultV2, PrismResult, ValueAccountsWeights };
