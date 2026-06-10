import { z } from "zod";
import { sideSchema, teamEconomySchema, grenadeTypeSchema } from "cs2-demo-format";

/**
 * 开局动线：单选手在指定经济类型回合（默认长枪局）开局窗口内的
 * 走位轨迹 + 道具投掷。由 @cs2dak/presentation 从 replay/rounds/grenades 派生，
 * 坐标保持 world 坐标系，radar 投影由渲染端（@cs2dak/maps）完成。
 */

export const trailPointSchema = z.object({
  /** 距 freeze 结束的秒数。 */
  t: z.number().nonnegative(),
  x: z.number(),
  y: z.number()
});

export const trailGrenadeSchema = z.object({
  /** 投掷时刻（距 freeze 结束的秒数）。 */
  t: z.number().nonnegative(),
  x: z.number(),
  y: z.number(),
  grenade: grenadeTypeSchema,
  /** 生效时刻（距 freeze 结束的秒数）。 */
  effectT: z.number().nonnegative(),
  /** 效果消失时刻；导出包缺失时 null，渲染端按道具类型取默认时长。 */
  destroyT: z.number().nonnegative().nullable(),
  /** 落点（world 坐标）。 */
  effectX: z.number(),
  effectY: z.number()
});

export const openingTrailRoundSchema = z.object({
  matchId: z.string(),
  roundNumber: z.number().int().positive(),
  side: sideSchema,
  economyType: teamEconomySchema,
  points: z.array(trailPointSchema),
  grenades: z.array(trailGrenadeSchema)
});

export const openingTrailsModelSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/opening-trails-0.2"),
  matchId: z.string(),
  mapName: z.string(),
  steamId64: z.string(),
  playerName: z.string(),
  /** 该导出包是否含回放流；false 时 rounds 为空。 */
  available: z.boolean(),
  windowSeconds: z.number().positive(),
  rounds: z.array(openingTrailRoundSchema)
});

export type TrailPoint = z.infer<typeof trailPointSchema>;
export type TrailGrenade = z.infer<typeof trailGrenadeSchema>;
export type OpeningTrailRound = z.infer<typeof openingTrailRoundSchema>;
export type OpeningTrailsModel = z.infer<typeof openingTrailsModelSchema>;
