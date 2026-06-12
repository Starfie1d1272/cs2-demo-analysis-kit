import { z } from "zod";

export const duelEvidenceSchema = z.object({
  matchId: z.string(),
  roundNumber: z.number().int().positive(),
  tick: z.number().int().positive().optional()
});

export const duelPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
}).nullable();

export const duelFinderRowSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  mapName: z.string(),
  roundNumber: z.number().int().positive(),
  tick: z.number().int().positive(),
  killerSteamId64: z.string(),
  victimSteamId64: z.string(),
  killerName: z.string(),
  victimName: z.string(),
  weapon: z.string(),
  classification: z.enum(["contested_duel", "suppressed_kill", "caught_off_guard"]),
  hpBucket: z.enum(["full_hp", "low_hp"]),
  thirdParty: z.boolean(),
  fullHealth: z.boolean(),
  victimHealthBefore: z.number().min(0).max(100),
  killerHealthBefore: z.number().min(0).max(100).nullable(),
  ttkMs: z.number().nonnegative().nullable(),
  oneShotKill: z.boolean(),
  evidenceTicks: z.object({
    engagementStartTick: z.number().int().positive(),
    engagementEndTick: z.number().int().positive(),
    killerFirstShotTick: z.number().int().positive().nullable(),
    victimResponseTick: z.number().int().positive().nullable(),
    killTick: z.number().int().positive(),
    windowStartTick: z.number().int().positive().optional(),
    windowEndTick: z.number().int().positive().optional()
  }),
  killerPosition: duelPointSchema,
  victimPosition: duelPointSchema,
  evidence: duelEvidenceSchema
});

export const openingDuelRowSchema = duelFinderRowSchema.extend({
  attackerCallout: z.string().nullable(),
  victimCallout: z.string().nullable()
});

export const mechanicsMetricSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  percentileLabel: z.string().nullable()
});

export const reactionPreaimSchema = z.object({
  audioReactionMs: z.number().nonnegative().nullable(),
  visualReactionMs: z.number().nonnegative().nullable(),
  preaimAngleErrorDegrees: z.number().nonnegative().nullable(),
  preaimSuccess: z.boolean().nullable()
});

export const playerMechanicsRowSchema = z.object({
  steamId64: z.string(),
  playerName: z.string(),
  teamName: z.string(),
  weapon: z.string(),
  killCount: z.number().int().nonnegative(),
  shotCount: z.number().int().nonnegative(),
  burstCount: z.number().int().nonnegative(),
  metrics: z.array(mechanicsMetricSchema),
  reaction: reactionPreaimSchema,
  burstLengthBuckets: z.object({
    single: z.number().int().nonnegative(),
    short: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    long: z.number().int().nonnegative()
  }),
  firingPatternRatio: z.object({
    tap: z.number().min(0).max(100),
    burst: z.number().min(0).max(100),
    spray: z.number().min(0).max(100)
  })
});

export const duelInsightsModelSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/duel-insights-0.1"),
  matchCount: z.number().int().nonnegative(),
  duelRows: z.array(duelFinderRowSchema),
  openingRows: z.array(openingDuelRowSchema),
  mechanicsRows: z.array(playerMechanicsRowSchema),
  notes: z.array(z.string())
});

export type DuelEvidence = z.infer<typeof duelEvidenceSchema>;
export type DuelPoint = z.infer<typeof duelPointSchema>;
export type DuelFinderRow = z.infer<typeof duelFinderRowSchema>;
export type OpeningDuelRow = z.infer<typeof openingDuelRowSchema>;
export type MechanicsMetric = z.infer<typeof mechanicsMetricSchema>;
export type ReactionPreaim = z.infer<typeof reactionPreaimSchema>;
export type PlayerMechanicsRow = z.infer<typeof playerMechanicsRowSchema>;
export type DuelInsightsModel = z.infer<typeof duelInsightsModelSchema>;
