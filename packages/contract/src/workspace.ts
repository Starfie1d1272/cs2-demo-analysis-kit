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

/** 回合筛选与时间轴用的派生事实（v0.2 query-first），由 presentation 从
 *  kills/bombs/clutches 一次性算好，React 端只做谓词匹配。 */
export const workspaceRoundFacetsSchema = z.object({
  /** 下包点；该回合未下包为 null。 */
  bombSite: z.enum(["a", "b"]).nullable(),
  bombPlantTick: z.number().int().positive().nullable(),
  bombDefuseTick: z.number().int().positive().nullable(),
  firstKillTick: z.number().int().positive().nullable(),
  firstKillSteamId64: z.string().nullable(),
  firstKillTeamKey: teamKeySchema.nullable(),
  /** 该回合的残局（若有）：clutch start tick 作时间轴锚点。 */
  clutch: z.object({
    steamId64: z.string(),
    teamKey: teamKeySchema,
    opponentCount: z.number().int().min(1).max(5),
    won: z.boolean(),
    tick: z.number().int().positive()
  }).nullable(),
  /** 单人单回合最高击杀数（≥3 即多杀回合）。 */
  maxKillsByOnePlayer: z.number().int().nonnegative(),
  wallbangKills: z.number().int().nonnegative(),
  throughSmokeKills: z.number().int().nonnegative()
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
  playerFacts: z.array(playerRoundFactSchema),
  /** 旧模型可缺省；缺省时回合筛选器自动隐藏对应维度。 */
  facets: workspaceRoundFacetsSchema.optional()
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

export const workspaceReplayLoadoutSchema = z.object({
  /** 回合 freeze time 的主武器；手枪/eco 局可能为 null。 */
  primaryWeapon: z.string().nullable(),
  /** 回合 freeze time 的副武器；极少数丢枪/拾枪状态可能为 null。 */
  secondaryWeapon: z.string().nullable(),
  grenadeCount: z.number().int().nonnegative(),
  /** 具体持有道具类型；旧 v3 导出包只有 grenadeCount，此数组为空。 */
  grenades: z.array(grenadeTypeSchema).default([])
});

export const workspaceReplayFrameSchema = z.object({
  tick: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  yaw: z.number(),
  hp: z.number().int().nonnegative().max(100),
  /** 护甲值 0–100；旧模型缺省 0。 */
  armor: z.number().int().nonnegative().max(100).optional().default(0),
  weapon: z.string().nullable(),
  /** 当前帧真实持有道具；旧导出包缺省为空，UI 可回退到 loadout。 */
  grenades: z.array(grenadeTypeSchema).optional().default([]),
  alive: z.boolean(),
  flashed: z.boolean(),
  hasDefuseKit: z.boolean(),
  hasBomb: z.boolean(),
  /** 本回合是否有头盔（player-economies 查表，非逐帧变化）。 */
  hasHelmet: z.boolean().optional().default(false)
});

export const workspaceReplayPlayerSchema = z.object({
  steamId64: z.string(),
  name: z.string(),
  teamKey: teamKeySchema,
  side: sideSchema,
  loadout: workspaceReplayLoadoutSchema.optional().default({
    primaryWeapon: null,
    secondaryWeapon: null,
    grenadeCount: 0,
    grenades: []
  }),
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
  tradeKill: z.boolean(),
  /** 击杀连线图层用的 world 坐标；旧模型缺省 null（连线图层降级隐藏）。 */
  killerX: z.number().nullable().optional().default(null),
  killerY: z.number().nullable().optional().default(null),
  killerZ: z.number().nullable().optional().default(null),
  victimX: z.number().nullable().optional().default(null),
  victimY: z.number().nullable().optional().default(null),
  victimZ: z.number().nullable().optional().default(null)
});

/** 回合内一颗道具的完整生命周期（world 坐标），来自 grenades.json。 */
export const workspaceReplayGrenadeSchema = z.object({
  grenade: grenadeTypeSchema,
  /** 投掷者在该回合的阵营；烟雾边框按 T/CT 着色，而不是固定 teamA/teamB。 */
  throwerSide: sideSchema.nullable().optional().default(null),
  throwTick: z.number().int().positive(),
  effectTick: z.number().int().positive(),
  /** 效果消失 tick；导出包缺失时 null，渲染端按道具类型取默认时长。 */
  destroyTick: z.number().int().positive().nullable(),
  throwX: z.number(),
  throwY: z.number(),
  effectX: z.number(),
  effectY: z.number(),
  /** 效果点 z 高度，双层地图按层过滤用；旧模型缺省 0（恒判上层兜底）。 */
  effectZ: z.number().optional().default(0)
});

/** 道具飞行轨迹（v2.3+ 导出包才有），与玩家帧同一时间网格。 */
export const workspaceReplayProjectileSchema = z.object({
  grenade: grenadeTypeSchema,
  startTick: z.number().int().positive(),
  x: z.array(z.number()),
  y: z.array(z.number()),
  /** 与 x/y 同长的 z 高度序列；旧模型缺省空数组。 */
  z: z.array(z.number()).optional().default([])
});

/** C4 掉落期间（world 坐标）：从 dropped 到被捡起/安放之间的地面标记。 */
export const workspaceReplayGroundBombSchema = z.object({
  startTick: z.number().int().positive(),
  endTick: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  z: z.number().optional().default(0)
});

/** C4 事件锚点（world 坐标）：plant 之后在落点定格显示。 */
export const workspaceReplayBombSchema = z.object({
  plantTick: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  z: z.number().optional().default(0),
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
  bomb: workspaceReplayBombSchema.nullable(),
  /** C4 掉落在地上的区间（掉落→捡起/安放）。数组可能为空。 */
  groundBombs: z.array(workspaceReplayGroundBombSchema).default([]),
  /** 回合官方结束 tick（rounds.json endTick），scrubber 末尾对齐用。旧缓存缺省。 */
  officialEndTick: z.number().int().positive().optional()
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
  sourceSchemaVersion: z.literal("cs2-demo-format/3.0"),
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
export type WorkspaceRoundFacets = z.infer<typeof workspaceRoundFacetsSchema>;
export type WorkspaceKpi = z.infer<typeof workspaceKpiSchema>;
export type WorkspaceRound = z.infer<typeof workspaceRoundSchema>;
export type WorkspaceWeaponRow = z.infer<typeof workspaceWeaponRowSchema>;
export type WorkspaceDuels = z.infer<typeof workspaceDuelsSchema>;
export type WorkspacePlayer = z.infer<typeof workspacePlayerSchema>;
export type WorkspaceSpatialPoint = z.infer<typeof workspaceSpatialPointSchema>;
export type WorkspaceReplayLoadout = z.infer<typeof workspaceReplayLoadoutSchema>;
export type WorkspaceReplayFrame = z.infer<typeof workspaceReplayFrameSchema>;
export type WorkspaceReplayPlayer = z.infer<typeof workspaceReplayPlayerSchema>;
export type WorkspaceKillEvent = z.infer<typeof workspaceKillEventSchema>;
export type WorkspaceReplayGrenade = z.infer<typeof workspaceReplayGrenadeSchema>;
export type WorkspaceReplayProjectile = z.infer<typeof workspaceReplayProjectileSchema>;
export type WorkspaceReplayGroundBomb = z.infer<typeof workspaceReplayGroundBombSchema>;
export type WorkspaceReplayBomb = z.infer<typeof workspaceReplayBombSchema>;
export type WorkspaceReplayRound = z.infer<typeof workspaceReplayRoundSchema>;
export type MatchWorkspaceModel = z.infer<typeof matchWorkspaceModelSchema>;
