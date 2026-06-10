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
  key: z.enum(["overview", "rounds", "players", "economy", "weapons", "duels", "map", "replay"]),
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
    key: z.enum(["combat", "trade", "mapControl", "clutch", "objective", "utility"]),
    label: z.string(),
    value: z.number()
  })),
  roundFacts: z.array(playerRoundFactSchema)
});

/** 武器统计行（比赛级，按击杀数降序）。 */
export const workspaceWeaponRowSchema = z.object({
  weapon: z.string(),
  label: z.string(),
  kills: z.number().int().nonnegative(),
  headshotPercent: z.number().min(0).max(100).nullable(),
  /** 有效生命伤害合计（healthDamage 口径，与 ADR 一致）。 */
  damage: z.number().int().nonnegative(),
  wallbangKills: z.number().int().nonnegative(),
  noScopeKills: z.number().int().nonnegative(),
  throughSmokeKills: z.number().int().nonnegative(),
  topKillerName: z.string().nullable(),
  topKillerKills: z.number().int().nonnegative()
});

export const workspaceDuelPlayerSchema = z.object({
  steamId64: z.string(),
  name: z.string(),
  teamKey: teamKeySchema
});

/** 对位：击杀矩阵 + 开局对枪统计。players 顺序 = teamA 在前。 */
export const workspaceDuelsSchema = z.object({
  players: z.array(workspaceDuelPlayerSchema),
  /** matrix[i][j] = players[i] 击杀 players[j] 的次数（含队友误伤致死）。 */
  matrix: z.array(z.array(z.number().int().nonnegative())),
  openings: z.array(z.object({
    steamId64: z.string(),
    name: z.string(),
    teamKey: teamKeySchema,
    openingKills: z.number().int().nonnegative(),
    openingDeaths: z.number().int().nonnegative(),
    /** 开局对枪胜率（0–100）；无开局对枪时 null。 */
    winRatePercent: z.number().min(0).max(100).nullable()
  }))
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
  hasDefuseKit: z.boolean(),
  hasBomb: z.boolean()
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

/** 回合内一颗道具的完整生命周期（world 坐标），来自 grenades.json。 */
export const workspaceReplayGrenadeSchema = z.object({
  grenade: grenadeTypeSchema,
  throwTick: z.number().int().positive(),
  effectTick: z.number().int().positive(),
  /** 效果消失 tick；导出包缺失时 null，渲染端按道具类型取默认时长。 */
  destroyTick: z.number().int().positive().nullable(),
  throwX: z.number(),
  throwY: z.number(),
  effectX: z.number(),
  effectY: z.number()
});

/** 道具飞行轨迹（v2.3+ 导出包才有），与玩家帧同一时间网格。 */
export const workspaceReplayProjectileSchema = z.object({
  grenade: grenadeTypeSchema,
  startTick: z.number().int().positive(),
  x: z.array(z.number()),
  y: z.array(z.number())
});

/** C4 事件锚点（world 坐标）：plant 之后在落点定格显示。 */
export const workspaceReplayBombSchema = z.object({
  plantTick: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  defuseTick: z.number().int().positive().nullable(),
  explodeTick: z.number().int().positive().nullable()
});

export const workspaceReplayRoundSchema = z.object({
  roundNumber: z.number().int().positive(),
  startTick: z.number().int().positive(),
  tickStep: z.number().int().positive(),
  frameCount: z.number().int().nonnegative(),
  players: z.array(workspaceReplayPlayerSchema),
  kills: z.array(workspaceKillEventSchema),
  grenades: z.array(workspaceReplayGrenadeSchema),
  projectiles: z.array(workspaceReplayProjectileSchema),
  /** 该回合未下包时 null。 */
  bomb: workspaceReplayBombSchema.nullable()
});

export const workspaceReplaySchema = z.object({
  available: z.boolean(),
  sampleRate: z.number().int().positive().nullable(),
  tickrate: z.number().int().positive().nullable(),
  rounds: z.array(workspaceReplayRoundSchema),
  capabilities: z.object({
    hasDefuseKit: z.boolean()
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
  weapons: z.array(workspaceWeaponRowSchema),
  duels: workspaceDuelsSchema,
  map: workspaceMapSchema,
  replay: workspaceReplaySchema,
  adminQa: qaReportSchema
});

export type WorkspaceTab = z.infer<typeof workspaceTabSchema>;
export type WorkspaceKpi = z.infer<typeof workspaceKpiSchema>;
export type WorkspaceRound = z.infer<typeof workspaceRoundSchema>;
export type WorkspaceWeaponRow = z.infer<typeof workspaceWeaponRowSchema>;
export type WorkspaceDuels = z.infer<typeof workspaceDuelsSchema>;
export type WorkspacePlayer = z.infer<typeof workspacePlayerSchema>;
export type WorkspaceSpatialPoint = z.infer<typeof workspaceSpatialPointSchema>;
export type WorkspaceReplayFrame = z.infer<typeof workspaceReplayFrameSchema>;
export type WorkspaceReplayPlayer = z.infer<typeof workspaceReplayPlayerSchema>;
export type WorkspaceKillEvent = z.infer<typeof workspaceKillEventSchema>;
export type WorkspaceReplayGrenade = z.infer<typeof workspaceReplayGrenadeSchema>;
export type WorkspaceReplayProjectile = z.infer<typeof workspaceReplayProjectileSchema>;
export type WorkspaceReplayBomb = z.infer<typeof workspaceReplayBombSchema>;
export type WorkspaceReplayRound = z.infer<typeof workspaceReplayRoundSchema>;
export type MatchWorkspaceModel = z.infer<typeof matchWorkspaceModelSchema>;
