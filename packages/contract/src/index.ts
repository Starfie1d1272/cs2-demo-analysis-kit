import type { RRIndicators, RRResult, PrismResult } from "@rivalhub/rival-rating";
import { z } from "zod";

export const sideSchema = z.enum(["t", "ct"]);
export const teamKeySchema = z.enum(["teamA", "teamB"]);
export const economyTypeSchema = z.enum(["pistol", "eco", "semi", "force", "full"]);

export const vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});

const steamIdSchema = z.string().regex(/^\d{17}$/);

export const packageManifestSchema = z.object({
  schemaVersion: z.literal("cs2-demo-format/2.0"),
  mapName: z.string().min(1),
  tickrate: z.number().int().positive(),
  exporter: z.object({
    name: z.string().min(1),
    version: z.string().min(1)
  }).optional(),
  parser: z.object({
    name: z.string().min(1),
    version: z.string().min(1)
  }).optional()
});

export const packageMatchSchema = z.object({
  mapName: z.string().min(1),
  tickrate: z.number().int().positive(),
  durationSeconds: z.number().positive().optional(),
  teamA: z.object({
    teamKey: z.literal("teamA"),
    name: z.string().nullable(),
    score: z.number().int().nonnegative()
  }),
  teamB: z.object({
    teamKey: z.literal("teamB"),
    name: z.string().nullable(),
    score: z.number().int().nonnegative()
  })
});

export const packagePlayerSchema = z.object({
  steamId64: steamIdSchema,
  name: z.string().min(1),
  teamKey: teamKeySchema
});

export const packageRoundSchema = z.object({
  roundNumber: z.number().int().positive(),
  startTick: z.number().int().positive(),
  freezeEndTick: z.number().int().positive(),
  endTick: z.number().int().positive(),
  teamASide: sideSchema,
  teamBSide: sideSchema,
  teamAScoreBefore: z.number().int().nonnegative(),
  teamBScoreBefore: z.number().int().nonnegative(),
  teamAEconomy: economyTypeSchema,
  teamBEconomy: economyTypeSchema,
  winnerTeamKey: teamKeySchema,
  winnerSide: sideSchema,
  endReason: z.string().min(1)
});

export const packagePlayerEconomySchema = z.object({
  roundNumber: z.number().int().positive(),
  steamId64: steamIdSchema,
  teamKey: teamKeySchema,
  side: sideSchema,
  startMoney: z.number().int().nonnegative(),
  moneySpent: z.number().int().nonnegative(),
  equipmentValue: z.number().int().nonnegative(),
  type: economyTypeSchema,
  hasArmor: z.boolean().optional(),
  hasHelmet: z.boolean().optional(),
  hasDefuseKit: z.boolean().optional(),
  primaryWeapon: z.string().nullable().optional(),
  secondaryWeapon: z.string().nullable().optional(),
  grenadeCount: z.number().int().nonnegative().optional()
});

export const packageKillSchema = z.object({
  roundNumber: z.number().int().positive(),
  tick: z.number().int().positive(),
  killerSteamId64: steamIdSchema.nullable(),
  victimSteamId64: steamIdSchema,
  assisterSteamId64: steamIdSchema.nullable().optional(),
  flashAssisterSteamId64: steamIdSchema.nullable().optional(),
  killerTeamKey: teamKeySchema.nullable(),
  victimTeamKey: teamKeySchema,
  killerSide: sideSchema.nullable(),
  victimSide: sideSchema,
  weapon: z.string().min(1),
  headshot: z.boolean(),
  flashAssist: z.boolean().optional(),
  tradeKill: z.boolean().optional(),
  tradeDeath: z.boolean().optional(),
  throughSmoke: z.boolean().optional(),
  noScope: z.boolean().optional(),
  penetratedObjects: z.number().int().nonnegative().optional(),
  killerPosition: vec3Schema.nullable().optional(),
  victimPosition: vec3Schema
});

export const packageDamageSchema = z.object({
  roundNumber: z.number().int().positive(),
  tick: z.number().int().positive(),
  attackerSteamId64: steamIdSchema.nullable(),
  victimSteamId64: steamIdSchema,
  attackerTeamKey: teamKeySchema.nullable(),
  victimTeamKey: teamKeySchema,
  attackerSide: sideSchema.nullable(),
  victimSide: sideSchema,
  weapon: z.string().min(1),
  healthDamage: z.number().int().nonnegative(),
  healthDamageRaw: z.number().int().nonnegative().optional(),
  hitgroup: z.string().optional(),
  attackerPosition: vec3Schema.nullable().optional(),
  victimPosition: vec3Schema.optional()
});

export const packageGrenadeSchema = z.object({
  roundNumber: z.number().int().positive(),
  tick: z.number().int().positive(),
  steamId64: steamIdSchema.nullable(),
  teamKey: teamKeySchema.nullable(),
  side: sideSchema.nullable(),
  grenadeType: z.string().min(1),
  eventType: z.string().min(1),
  position: vec3Schema.nullable().optional()
});

export const packagePlayerStatsSchema = z.object({
  steamId64: steamIdSchema,
  teamKey: teamKeySchema,
  rounds: z.number().int().nonnegative(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  damageHealth: z.number().int().nonnegative().default(0),
  utilityDamage: z.number().int().nonnegative().default(0),
  headshotCount: z.number().int().nonnegative().default(0),
  firstKillCount: z.number().int().nonnegative().default(0),
  firstDeathCount: z.number().int().nonnegative().default(0),
  tradeKillCount: z.number().int().nonnegative().default(0),
  tradeDeathCount: z.number().int().nonnegative().default(0),
  oneKillCount: z.number().int().nonnegative().default(0),
  twoKillCount: z.number().int().nonnegative().default(0),
  threeKillCount: z.number().int().nonnegative().default(0),
  fourKillCount: z.number().int().nonnegative().default(0),
  fiveKillCount: z.number().int().nonnegative().default(0),
  vsOneCount: z.number().int().nonnegative().default(0),
  vsOneWonCount: z.number().int().nonnegative().default(0),
  vsTwoCount: z.number().int().nonnegative().default(0),
  vsTwoWonCount: z.number().int().nonnegative().default(0),
  vsThreeCount: z.number().int().nonnegative().default(0),
  vsThreeWonCount: z.number().int().nonnegative().default(0),
  vsFourCount: z.number().int().nonnegative().default(0),
  vsFourWonCount: z.number().int().nonnegative().default(0),
  vsFiveCount: z.number().int().nonnegative().default(0),
  vsFiveWonCount: z.number().int().nonnegative().default(0),
  kast_rounds: z.number().int().nonnegative().optional(),
  adr: z.number().nonnegative().optional(),
  kast: z.number().min(0).max(100).optional(),
  averageUtilityDamagePerRound: z.number().nonnegative().optional()
}).passthrough();

export const packageBlindSchema = z.object({
  roundNumber: z.number().int().nonnegative(),
  tick: z.number().int().nonnegative(),
  flasherSteamId64: steamIdSchema.nullable(),
  flashedSteamId64: steamIdSchema.nullable(),
  flasherTeamKey: teamKeySchema.nullable(),
  flashedTeamKey: teamKeySchema.nullable(),
  durationSeconds: z.number().nonnegative()
}).passthrough();

export const packageClutchSchema = z.object({
  roundNumber: z.number().int().positive(),
  tick: z.number().int().nonnegative(),
  clutcherSteamId64: steamIdSchema,
  clutcherTeamKey: teamKeySchema,
  opponentCount: z.number().int().min(1).max(5),
  won: z.boolean(),
  survived: z.boolean().optional(),
  killCount: z.number().int().nonnegative().optional()
}).passthrough();

export const demoPackageSchema = z.object({
  manifest: packageManifestSchema,
  match: packageMatchSchema,
  players: z.array(packagePlayerSchema),
  rounds: z.array(packageRoundSchema),
  playerEconomies: z.array(packagePlayerEconomySchema).default([]),
  playerStats: z.array(packagePlayerStatsSchema).default([]),
  kills: z.array(packageKillSchema).default([]),
  damages: z.array(packageDamageSchema).default([]),
  grenades: z.array(packageGrenadeSchema).default([]),
  blinds: z.array(packageBlindSchema).default([]),
  clutches: z.array(packageClutchSchema).default([])
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
  rrPercentile: z.number().min(0).max(100)
});

export const timelineEventSchema = z.object({
  id: z.string(),
  roundNumber: z.number().int().positive(),
  tick: z.number().int().positive(),
  timeSeconds: z.number().nonnegative(),
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
export type PackagePlayer = z.infer<typeof packagePlayerSchema>;
export type PackageRound = z.infer<typeof packageRoundSchema>;
export type PackageKill = z.infer<typeof packageKillSchema>;
export type PackageDamage = z.infer<typeof packageDamageSchema>;
export type PackagePlayerEconomy = z.infer<typeof packagePlayerEconomySchema>;
export type PackagePlayerStats = z.infer<typeof packagePlayerStatsSchema>;
export type PackageBlind = z.infer<typeof packageBlindSchema>;
export type PackageClutch = z.infer<typeof packageClutchSchema>;
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
export type { RRIndicators, RRResult, PrismResult };
