import type { PrismResult } from "@rivalhub/rival-rating";
import { z } from "zod";
import { teamKeySchema } from "cs2-demo-format";
import { seasonCohortBundleSchema } from "./cohort.js";

/**
 * 赛季排行榜展示模型。由 @cs2dak/presentation 从 SeasonCohortBundle 派生，
 * 吸收 RivalHub 排行榜的产品信息架构（分栏、标签、默认排序），但：
 * - 不含数据库/权限/路由语义（规则 8）；身份用中立的 playerKey/teamKeys。
 * - 缺失指标保持 null，不伪造 0（规则 6）。
 * - 不计算评分公式；rrV1/accountRR/prism 均来自 cohort 已接线的 rival-rating 结果（规则 5）。
 */

/** 排行榜可展示的指标 key。值统一存原始量纲，缩放与单位由 format 决定。 */
export const leaderboardMetricKeySchema = z.enum([
  "maps",
  // 评分门面
  "rivalhubRR", // accountRR（绝对刻度 RivalHub RR）
  "hltvRating", // rrV1（HLTV Rating 2.0 量纲，已被逆向验证）
  // core
  "adr",
  "kd",
  "kpr",
  "hsPercent",
  // impact（产量家族：每 100 回合 X 次）
  "firstKillPer100",
  "multiKillPer100",
  "clutchPer100",
  "openingDuelWinRate",
  // advanced
  "kast",
  "utilityDamagePerRound",
  "awpKillsPerRound",
  "awpKillRate",
  "flashAssistPerRound",
  "tradeKillRate"
]);

/**
 * 渲染格式。所有百分比类指标在 builder 中已统一为 0–100 刻度，故只有一个 percent 格式：
 * - integer: 整数
 * - rating:  2 位小数（RR / HLTV）
 * - adr:     1 位小数
 * - ratio:   2 位小数（K/D、KPR、每 100 回合产量 FK/MK/C、每回合计数）
 * - percent: 值已是 0–100，1 位小数 + %（HS% / KAST% / Entry% / AWP%）
 */
export const leaderboardFormatSchema = z.enum([
  "integer",
  "rating",
  "adr",
  "ratio",
  "percent"
]);

export const leaderboardColumnSchema = z.object({
  key: leaderboardMetricKeySchema,
  label: z.string(),
  format: leaderboardFormatSchema,
  /** 列说明 / tooltip；无则 null。 */
  description: z.string().nullable()
});

export const leaderboardViewKeySchema = z.enum(["core", "impact", "advanced"]);

export const leaderboardViewSchema = z.object({
  key: leaderboardViewKeySchema,
  label: z.string(),
  /** 默认排序列（始终降序）。 */
  defaultSort: leaderboardMetricKeySchema,
  columns: z.array(leaderboardColumnSchema)
});

export const seasonLeaderboardRowSchema = z.object({
  playerKey: z.string(),
  name: z.string(),
  steamIds: z.array(z.string()),
  externalUserId: z.string().nullable(),
  teamKeys: z.array(teamKeySchema),
  mapCount: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  /** 每个指标 key 都有值；不可得为 null（不伪造 0）。 */
  metrics: z.record(leaderboardMetricKeySchema, z.number().nullable()),
  /** PRISM 风格画像，仅表达风格，不进入排序；缺失为 null。 */
  prism: z.custom<PrismResult>().nullable()
});

export const seasonLeaderboardModelSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/leaderboard-0.1"),
  weightsVersion: z.string(),
  matchCount: z.number().int().nonnegative(),
  provenance: seasonCohortBundleSchema.shape.provenance,
  views: z.array(leaderboardViewSchema),
  rows: z.array(seasonLeaderboardRowSchema)
});

export type LeaderboardMetricKey = z.infer<typeof leaderboardMetricKeySchema>;
export type LeaderboardFormat = z.infer<typeof leaderboardFormatSchema>;
export type LeaderboardColumn = z.infer<typeof leaderboardColumnSchema>;
export type LeaderboardViewKey = z.infer<typeof leaderboardViewKeySchema>;
export type LeaderboardView = z.infer<typeof leaderboardViewSchema>;
export type SeasonLeaderboardRow = z.infer<typeof seasonLeaderboardRowSchema>;
export type SeasonLeaderboardModel = z.infer<typeof seasonLeaderboardModelSchema>;
