import type { LeaderboardView } from './models/leaderboard.js';

/**
 * 赛季指标的共享展示层：格式化与视图（列）定义。
 * 排行榜（SeasonLeaderboardModel）和选手页（PlayerSeasonProfile）共用同一套，
 * 保证两处的口径、标签、格式一致。标签归 presentation（React 不重复定义）。
 *
 * 约定：builder 把所有指标归一化到“展示刻度”，format 只负责精度与单位后缀：
 * - 百分比统一为 0–100；产量家族（FK/MK/C）统一为每 100 回合。
 * - 缺失保持 null，不伪造 0。
 */

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** 百分比格式化：null → "—"，否则 `${value.toFixed(digits)}%`。消除 `value == null ? "—" : `${value.toFixed(1)}%`` 的重复模式。 */
export function formatPercent(value: number | null, digits = 1): string {
  return value == null ? '—' : `${value.toFixed(digits)}%`;
}

/** 视图列定义（信息架构来自 RivalHub StatsLeaderboard，去掉 OCR 副指标与独立 Demo tab）。 */
export const SEASON_STAT_VIEWS: LeaderboardView[] = [
  {
    key: 'core',
    label: 'Core',
    defaultSort: 'rivalhubRR',
    columns: [
      { key: 'maps', label: 'Maps', format: 'integer', description: null },
      {
        key: 'rivalhubRR',
        label: 'RR',
        format: 'rating',
        description: 'RivalHub RR（绝对刻度评分）',
      },
      {
        key: 'hltvRating',
        label: 'Rating 2.0',
        format: 'rating',
        description: 'HLTV Rating 2.0 量纲',
      },
      { key: 'adr', label: 'ADR', format: 'adr', description: '每回合平均伤害' },
      { key: 'kd', label: 'K/D', format: 'ratio', description: '击杀死亡比' },
      { key: 'kpr', label: 'KPR', format: 'ratio', description: '每回合击杀' },
      { key: 'hsPercent', label: 'HS%', format: 'percent', description: '爆头率' },
    ],
  },
  {
    key: 'impact',
    label: 'Impact',
    defaultSort: 'firstKillPer100',
    columns: [
      { key: 'maps', label: 'Maps', format: 'integer', description: null },
      {
        key: 'rivalhubRR',
        label: 'RR',
        format: 'rating',
        description: 'RivalHub RR（绝对刻度评分）',
      },
      {
        key: 'hltvRating',
        label: 'Rating 2.0',
        format: 'rating',
        description: 'HLTV Rating 2.0 量纲',
      },
      { key: 'firstKillPer100', label: 'FK/100r', format: 'ratio', description: '每 100 回合首杀' },
      {
        key: 'multiKillPer100',
        label: 'MK/100r',
        format: 'ratio',
        description: '每 100 回合多杀回合',
      },
      { key: 'clutchPer100', label: 'C/100r', format: 'ratio', description: '每 100 回合残局胜利' },
      {
        key: 'openingDuelWinRate',
        label: 'Entry%',
        format: 'percent',
        description: '首杀对枪胜率',
      },
    ],
  },
  {
    key: 'advanced',
    label: 'Advanced',
    defaultSort: 'kast',
    columns: [
      { key: 'maps', label: 'Maps', format: 'integer', description: null },
      {
        key: 'rivalhubRR',
        label: 'RR',
        format: 'rating',
        description: 'RivalHub RR（绝对刻度评分）',
      },
      {
        key: 'hltvRating',
        label: 'Rating 2.0',
        format: 'rating',
        description: 'HLTV Rating 2.0 量纲',
      },
      { key: 'kast', label: 'KAST%', format: 'percent', description: '有效回合参与率' },
      {
        key: 'utilityDamagePerRound',
        label: 'Util/R',
        format: 'ratio',
        description: '每回合道具伤害',
      },
      { key: 'awpKillsPerRound', label: 'AWP/R', format: 'ratio', description: '每回合 AWP 击杀' },
      { key: 'awpKillRate', label: 'AWP%', format: 'percent', description: 'AWP 击杀占比' },
      { key: 'tradeKillRate', label: 'Trade/R', format: 'ratio', description: '每回合补枪击杀' },
      { key: 'flashAssistPerRound', label: 'FA/R', format: 'ratio', description: '每回合闪光助攻' },
    ],
  },
];
