import {
  seasonLeaderboardModelSchema,
  type LeaderboardMetricKey,
  type LeaderboardView,
  type SeasonCohortBundle,
  type SeasonLeaderboardModel
} from "@cs2dak/contract";

/**
 * 排行榜视图定义（信息架构来自 RivalHub StatsLeaderboard，去掉 OCR 副指标与独立 Demo tab）。
 * 标签归 presentation（React 不重复定义标签）。
 */
const LEADERBOARD_VIEWS: LeaderboardView[] = [
  {
    key: "core",
    label: "Core",
    defaultSort: "rivalhubRR",
    columns: [
      { key: "maps", label: "Maps", format: "integer", description: null },
      { key: "rivalhubRR", label: "RR", format: "rating", description: "RivalHub RR（绝对刻度评分）" },
      { key: "hltvRating", label: "Rating 2.0", format: "rating", description: "HLTV Rating 2.0 量纲" },
      { key: "adr", label: "ADR", format: "adr", description: "每回合平均伤害" },
      { key: "kd", label: "K/D", format: "ratio", description: "击杀死亡比" },
      { key: "kpr", label: "KPR", format: "ratio", description: "每回合击杀" },
      { key: "hsPercent", label: "HS%", format: "percent", description: "爆头率" }
    ]
  },
  {
    key: "impact",
    label: "Impact",
    defaultSort: "firstKillPer100",
    columns: [
      { key: "maps", label: "Maps", format: "integer", description: null },
      { key: "rivalhubRR", label: "RR", format: "rating", description: "RivalHub RR（绝对刻度评分）" },
      { key: "hltvRating", label: "Rating 2.0", format: "rating", description: "HLTV Rating 2.0 量纲" },
      { key: "firstKillPer100", label: "FK/100r", format: "ratio", description: "每 100 回合首杀" },
      { key: "multiKillPer100", label: "MK/100r", format: "ratio", description: "每 100 回合多杀回合" },
      { key: "clutchPer100", label: "C/100r", format: "ratio", description: "每 100 回合残局胜利" },
      { key: "openingDuelWinRate", label: "Entry%", format: "percent", description: "首杀对枪胜率" }
    ]
  },
  {
    key: "advanced",
    label: "Advanced",
    defaultSort: "kast",
    columns: [
      { key: "maps", label: "Maps", format: "integer", description: null },
      { key: "rivalhubRR", label: "RR", format: "rating", description: "RivalHub RR（绝对刻度评分）" },
      { key: "hltvRating", label: "Rating 2.0", format: "rating", description: "HLTV Rating 2.0 量纲" },
      { key: "kast", label: "KAST%", format: "percent", description: "有效回合参与率" },
      { key: "utilityDamagePerRound", label: "Util/R", format: "ratio", description: "每回合道具伤害" },
      { key: "awpKillsPerRound", label: "AWP/R", format: "ratio", description: "每回合 AWP 击杀" },
      { key: "awpKillRate", label: "AWP%", format: "percent", description: "AWP 击杀占比" },
      { key: "tradeKillRate", label: "Trade/R", format: "ratio", description: "每回合补枪击杀" },
      { key: "flashAssistPerRound", label: "FA/R", format: "ratio", description: "每回合闪光助攻" }
    ]
  }
];

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 把赛季 cohort 结果转换为产品中立的排行榜展示模型。
 * 纯转换：不重算聚合（cohort 已做 sum counts → recompute rates），不算评分公式。
 */
export function buildSeasonLeaderboardModel(bundle: SeasonCohortBundle): SeasonLeaderboardModel {
  const rows = bundle.players.map((player) => {
    const ind = player.indicators;
    const metrics: Record<LeaderboardMetricKey, number | null> = {
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
    return {
      playerKey: player.playerKey,
      name: player.name,
      steamIds: player.steamIds,
      externalUserId: player.externalUserId,
      teamKeys: player.teamKeys,
      mapCount: player.mapCount,
      confidence: player.confidence,
      metrics,
      prism: player.prism
    };
  });

  return seasonLeaderboardModelSchema.parse({
    version: "cs2-demo-analysis-kit/leaderboard-0.1",
    weightsVersion: bundle.weightsVersion,
    matchCount: bundle.matchCount,
    provenance: bundle.provenance,
    views: LEADERBOARD_VIEWS,
    rows
  });
}
