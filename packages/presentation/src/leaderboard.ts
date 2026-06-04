import {
  seasonLeaderboardModelSchema,
  type SeasonCohortBundle,
  type SeasonLeaderboardModel
} from "@cs2dak/contract";
import { SEASON_STAT_VIEWS, computeSeasonMetrics } from "./season-metrics.js";

/**
 * 把赛季 cohort 结果转换为产品中立的排行榜展示模型。
 * 纯转换：不重算聚合（cohort 已做 sum counts → recompute rates），不算评分公式。
 */
export function buildSeasonLeaderboardModel(bundle: SeasonCohortBundle): SeasonLeaderboardModel {
  const rows = bundle.players.map((player) => ({
    playerKey: player.playerKey,
    name: player.name,
    steamIds: player.steamIds,
    externalUserId: player.externalUserId,
    teamKeys: player.teamKeys,
    mapCount: player.mapCount,
    confidence: player.confidence,
    metrics: computeSeasonMetrics(player),
    prism: player.prism
  }));

  return seasonLeaderboardModelSchema.parse({
    version: "cs2-demo-analysis-kit/leaderboard-0.1",
    weightsVersion: bundle.weightsVersion,
    matchCount: bundle.matchCount,
    provenance: bundle.provenance,
    views: SEASON_STAT_VIEWS,
    rows
  });
}
