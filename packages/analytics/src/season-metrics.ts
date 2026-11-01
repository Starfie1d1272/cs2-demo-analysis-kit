import type { SeasonPlayerRow } from "@cs2dak/contract";
import type { LeaderboardMetricKey } from "@cs2dak/presentation";
import { round } from "@cs2dak/presentation";
export { round } from "@cs2dak/presentation";

/**
 * 把一行赛季 cohort 结果转换为展示指标。纯转换：不重算聚合（cohort 已 sum→recompute），
 * 不算评分公式。缺失保持 null。
 */
export function computeSeasonMetrics(player: SeasonPlayerRow): Record<LeaderboardMetricKey, number | null> {
  const ind = player.indicators;
  return {
    maps: player.mapCount,
    rivalhubRR: player.accountRR,
    hltvRating: player.rrV1,
    adr: ind.adr,
    kd: ind.deaths > 0 ? round(ind.kills / ind.deaths, 2) : null,
    kpr: ind.kpr,
    hsPercent: ind.hsPercent, // 已是 0–100
    // 产量家族：每 100 回合 X 次
    firstKillPer100: round(ind.firstKillRate * 100, 2),
    multiKillPer100: round(ind.multiKillRate * 100, 2),
    clutchPer100: round((ind.clutchWins / ind.totalRounds) * 100, 2),
    // 百分比统一为 0–100（cohort 中以 0–1 存储的需 ×100）
    openingDuelWinRate: round(ind.openingDuelWinRate * 100, 2),
    kast: ind.kast, // 已是 0–100
    utilityDamagePerRound: ind.utilityDamagePerRound,
    awpKillsPerRound: ind.awpKillsPerRound,
    awpKillRate: round(ind.awpKillRate * 100, 2),
    flashAssistPerRound: ind.flashAssistPerRound,
    tradeKillRate: ind.tradeKillRate
  };
}
