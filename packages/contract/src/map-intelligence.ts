import { z } from "zod";
import { playerIndexSchema, sideSchema, steamId64Schema, teamKeySchema } from "./upstream.js";

/** Bump when the compact map-intelligence producer changes its factual meaning. */
export const MAP_INTELLIGENCE_FACT_VERSION = 3;
export const OPENING_RESPONSIBILITY_WINDOW_VERSION = 1;

const availabilitySchema = z.enum(["available", "degraded", "missing"]);

export const mapIntelligenceAvailabilitySchema = z.object({
  replay: availabilitySchema,
  nav: availabilitySchema,
  callouts: availabilitySchema,
  shots: availabilitySchema,
});

export const positionGroupDwellSchema = z.object({
  positionGroupId: z.string().min(1),
  seconds: z.number().nonnegative(),
  share: z.number().min(0).max(1),
});

export const responsibilityWindowSchema = z.object({
  version: z.literal(OPENING_RESPONSIBILITY_WINDOW_VERSION),
  startTick: z.number().int().nonnegative(),
  endTick: z.number().int().nonnegative(),
  configuredSeconds: z.number().positive(),
});

export const openingPathPointSchema = z.object({
  tick: z.number().int().nonnegative(),
  callout: z.string().nullable(),
  positionGroupId: z.string().nullable(),
  x: z.number(), y: z.number(), z: z.number(),
});

/** A compact, locatable period where a player was separated from their team component. */
export const isolationSegmentSchema = z.object({
  startTick: z.number().int().nonnegative(),
  endTick: z.number().int().nonnegative(),
  seconds: z.number().nonnegative(),
});

export const playerPositionRoundFactSchema = z.object({
  analysisVersion: z.literal(MAP_INTELLIGENCE_FACT_VERSION),
  matchId: z.string().min(1),
  mapName: z.string().min(1),
  roundNumber: z.number().int().positive(),
  teamKey: teamKeySchema,
  side: sideSchema,
  playerIndex: playerIndexSchema,
  steamId64: steamId64Schema,
  economyType: z.enum(["pistol", "eco", "semi", "force", "full"]).nullable(),
  openingWindow: responsibilityWindowSchema.nullable(),
  openingEligibleSeconds: z.number().nonnegative().nullable(),
  openingPositionGroupDwell: z.array(positionGroupDwellSchema),
  openingMeanComponentSize: z.number().positive().nullable(),
  openingIsolationSeconds: z.number().nonnegative().nullable(),
  openingUtilityUseCount: z.number().int().nonnegative(),
  openingPath: z.array(openingPathPointSchema).max(8),
  /** Full-round movement/action coverage, from freeze end until death or round end. */
  eligibleSeconds: z.number().nonnegative().nullable(),
  positionGroupDwell: z.array(positionGroupDwellSchema),
  unresolvedCalloutSeconds: z.number().nonnegative().nullable(),
  calloutCoverage: z.number().min(0).max(1).nullable(),
  meanNearestTeammateDistance: z.number().nonnegative().nullable(),
  meanTeamCentroidDistance: z.number().nonnegative().nullable(),
  meanComponentSize: z.number().positive().nullable(),
  isolationSegments: z.array(isolationSegmentSchema),
  rejoinTicks: z.array(z.number().int().nonnegative()),
  movementSync: z.number().min(-1).max(1).nullable(),
  utilityUseCount: z.number().int().nonnegative(),
  freezeAwpOwnership: z.boolean().nullable(),
  activeAwpSeconds: z.number().nonnegative().nullable(),
  awpShots: z.number().int().nonnegative().nullable(),
  awpKills: z.number().int().nonnegative().nullable(),
  availability: mapIntelligenceAvailabilitySchema,
});

export const teamShapeWindowSchema = z.object({
  startTick: z.number().int().nonnegative(),
  endTick: z.number().int().nonnegative(),
  coverageSeconds: z.number().nonnegative(),
  /** Descending component sizes, e.g. [4, 1] for a 4+1. */
  componentSizes: z.array(z.number().int().positive()).min(1),
  partition: z.string().min(1),
  componentPlayerIndices: z.array(z.array(playerIndexSchema).min(1)).min(1),
});

export const teamShapeRoundFactSchema = z.object({
  analysisVersion: z.literal(MAP_INTELLIGENCE_FACT_VERSION),
  matchId: z.string().min(1),
  mapName: z.string().min(1),
  roundNumber: z.number().int().positive(),
  teamKey: teamKeySchema,
  side: sideSchema,
  openingWindow: responsibilityWindowSchema.nullable(),
  openingWindows: z.array(teamShapeWindowSchema),
  /** Full-round component continuity windows. */
  coverageSeconds: z.number().nonnegative().nullable(),
  windows: z.array(teamShapeWindowSchema),
  availability: mapIntelligenceAvailabilitySchema,
});

export const teamAwpRoundFactSchema = z.object({
  analysisVersion: z.literal(MAP_INTELLIGENCE_FACT_VERSION),
  matchId: z.string().min(1),
  mapName: z.string().min(1),
  roundNumber: z.number().int().positive(),
  teamKey: teamKeySchema,
  side: sideSchema,
  economyType: z.enum(["pistol", "eco", "semi", "force", "full"]),
  opponentEconomyType: z.enum(["pistol", "eco", "semi", "force", "full"]),
  scorePhase: z.enum(["first_half", "second_half", "overtime"]),
  won: z.boolean(),
  roundStartAwpPlayerIndices: z.array(playerIndexSchema),
  doubleAwpActiveSeconds: z.number().nonnegative().nullable(),
  awpActiveSeconds: z.number().nonnegative().nullable(),
  awpShots: z.number().int().nonnegative().nullable(),
  awpKills: z.number().int().nonnegative().nullable(),
  awpDamage: z.number().nonnegative().nullable(),
  openingKills: z.number().int().nonnegative(),
  openingDeaths: z.number().int().nonnegative(),
  savedAwpPlayerIndices: z.array(playerIndexSchema),
  availability: mapIntelligenceAvailabilitySchema,
});

/** Compact per-match replay-derived map facts. It intentionally contains no role conclusion. */
export const matchMapIntelligenceFactsSchema = z.object({
  analysisVersion: z.literal(MAP_INTELLIGENCE_FACT_VERSION),
  matchId: z.string().min(1),
  mapName: z.string().min(1),
  playerPositionRounds: z.array(playerPositionRoundFactSchema),
  teamShapeRounds: z.array(teamShapeRoundFactSchema),
  teamAwpRounds: z.array(teamAwpRoundFactSchema),
});

export type MapIntelligenceAvailability = z.infer<typeof mapIntelligenceAvailabilitySchema>;
export type PositionGroupDwell = z.infer<typeof positionGroupDwellSchema>;
export type ResponsibilityWindow = z.infer<typeof responsibilityWindowSchema>;
export type IsolationSegment = z.infer<typeof isolationSegmentSchema>;
export type PlayerPositionRoundFact = z.infer<typeof playerPositionRoundFactSchema>;
export type TeamShapeWindow = z.infer<typeof teamShapeWindowSchema>;
export type TeamShapeRoundFact = z.infer<typeof teamShapeRoundFactSchema>;
export type TeamAwpRoundFact = z.infer<typeof teamAwpRoundFactSchema>;
export type MatchMapIntelligenceFacts = z.infer<typeof matchMapIntelligenceFactsSchema>;
