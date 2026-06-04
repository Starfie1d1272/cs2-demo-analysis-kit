import { z } from "zod";
import { teamKeySchema, sideSchema, grenadeTypeSchema, teamEconomySchema } from "cs2-demo-format";
import { qaReportSchema } from "./qa.js";
import {
  analysisBundleSchema,
  timelineEventSchema,
  economyPointSchema,
  heatmapPointSchema,
  playerScoreboardRowSchema,
  playerRoundFactSchema,
  mapViewSchema,
} from "./analysis.js";

export const workspaceTabSchema = z.object({
  key: z.enum(["overview", "rounds", "players", "economy", "map", "replay"]),
  label: z.string()
});

export const workspaceKpiSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  detail: z.string()
});

export const workspaceOverviewSchema = z.object({
  kpis: z.array(workspaceKpiSchema),
  story: z.array(z.string())
});

export const workspaceRoundSchema = z.object({
  roundNumber: z.number().int().positive(),
  scoreBefore: z.string(),
  winnerTeamKey: teamKeySchema,
  winnerSide: sideSchema,
  endReason: z.string(),
  teamAEconomy: teamEconomySchema,
  teamBEconomy: teamEconomySchema,
  events: z.array(timelineEventSchema),
  playerFacts: z.array(playerRoundFactSchema)
});

export const workspacePlayerSchema = z.object({
  row: playerScoreboardRowSchema,
  teamName: z.string(),
  summary: z.array(z.string()),
  rrBreakdown: z.array(z.object({
    key: z.enum(["combat", "trade", "clutch", "objective", "utility"]),
    label: z.string(),
    value: z.number()
  })),
  roundFacts: z.array(playerRoundFactSchema)
});

export const workspaceMapModeSchema = z.object({
  key: z.enum(["death", "kill", "grenade", "bomb", "position"]),
  label: z.string(),
  count: z.number().int().nonnegative()
});

export const workspaceSpatialPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  roundNumber: z.number().int().positive(),
  teamKey: teamKeySchema.nullable(),
  steamId64: z.string().nullable(),
  side: sideSchema.nullable(),
  kind: z.enum(["kill", "death", "grenade", "bomb", "position"]),
  grenadeType: grenadeTypeSchema.nullable()
});

export const workspaceMapSchema = z.object({
  view: mapViewSchema,
  modes: z.array(workspaceMapModeSchema),
  points: z.array(workspaceSpatialPointSchema),
  status: z.object({
    hasRadar: z.boolean(),
    hasPositionData: z.boolean(),
    message: z.string().nullable()
  })
});

export const workspaceReplayFrameSchema = z.object({
  tick: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  yaw: z.number(),
  hp: z.number().int().nonnegative().max(100),
  weapon: z.string().nullable(),
  alive: z.boolean(),
  flashed: z.boolean(),
  hasDefuseKit: z.boolean()
});

export const workspaceReplayPlayerSchema = z.object({
  steamId64: z.string(),
  name: z.string(),
  teamKey: teamKeySchema,
  side: sideSchema,
  frames: z.array(workspaceReplayFrameSchema)
});

export const workspaceKillEventSchema = z.object({
  id: z.string(),
  tick: z.number().int().positive(),
  killerName: z.string().nullable(),
  killerTeamKey: teamKeySchema.nullable(),
  victimName: z.string(),
  weapon: z.string(),
  headshot: z.boolean(),
  throughSmoke: z.boolean(),
  noScope: z.boolean(),
  flashAssist: z.boolean(),
  tradeKill: z.boolean()
});

export const workspaceReplayRoundSchema = z.object({
  roundNumber: z.number().int().positive(),
  startTick: z.number().int().positive(),
  tickStep: z.number().int().positive(),
  frameCount: z.number().int().nonnegative(),
  players: z.array(workspaceReplayPlayerSchema),
  kills: z.array(workspaceKillEventSchema)
});

export const workspaceReplaySchema = z.object({
  available: z.boolean(),
  sampleRate: z.number().int().positive().nullable(),
  tickrate: z.number().int().positive().nullable(),
  rounds: z.array(workspaceReplayRoundSchema),
  capabilities: z.object({
    hasDefuseKit: z.boolean(),
    hasBombPosition: z.boolean()
  })
});

export const matchWorkspaceModelSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/workspace-0.1"),
  sourceSchemaVersion: z.literal("cs2-demo-format/2.0"),
  title: z.string(),
  subtitle: z.string(),
  scoreline: z.string(),
  mapName: z.string(),
  teams: analysisBundleSchema.shape.teams,
  tabs: z.array(workspaceTabSchema),
  overview: workspaceOverviewSchema,
  scoreboard: z.array(playerScoreboardRowSchema),
  rounds: z.array(workspaceRoundSchema),
  players: z.array(workspacePlayerSchema),
  economy: z.array(economyPointSchema),
  map: workspaceMapSchema,
  replay: workspaceReplaySchema,
  adminQa: qaReportSchema
});

export type WorkspaceTab = z.infer<typeof workspaceTabSchema>;
export type WorkspaceKpi = z.infer<typeof workspaceKpiSchema>;
export type WorkspaceRound = z.infer<typeof workspaceRoundSchema>;
export type WorkspacePlayer = z.infer<typeof workspacePlayerSchema>;
export type WorkspaceSpatialPoint = z.infer<typeof workspaceSpatialPointSchema>;
export type WorkspaceReplayFrame = z.infer<typeof workspaceReplayFrameSchema>;
export type WorkspaceReplayPlayer = z.infer<typeof workspaceReplayPlayerSchema>;
export type WorkspaceKillEvent = z.infer<typeof workspaceKillEventSchema>;
export type WorkspaceReplayRound = z.infer<typeof workspaceReplayRoundSchema>;
export type MatchWorkspaceModel = z.infer<typeof matchWorkspaceModelSchema>;
