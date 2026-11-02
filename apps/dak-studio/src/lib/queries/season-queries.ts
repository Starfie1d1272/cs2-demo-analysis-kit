import { buildSeasonCohortFromRows } from "@cs2dak/cohort";
import { buildAllPlayerSeasonProfiles, buildSeasonLeaderboardModel, buildTournamentInsightsFromFacts, type TournamentInsights } from "@cs2dak/analytics";
import { createAnalysisBucket, cachedQuery, readPersistedValue, writePersistedValue } from "./query-cache";
import { assertCurrentFacts } from "../facts-readiness";
import { getFactsStore } from "../facts-store";
import { getDerivedCacheStore } from "../derived-cache";
import type { SeasonCohortBundle } from "@cs2dak/cohort";
import type { PlayerSeasonProfile, SeasonLeaderboardModel } from "@cs2dak/presentation";
import { matchIdForEntry, type StudioDemoEntry } from "../demo-entry";

import type { IdentityOptions } from "../identity";
import { groupAnalysisTeams } from "./tournament-groups";
import { keyOf, allowedTeamKeysByMatch, filterTournamentInsightsByTeam, missingFactsError, withTeamRenames } from "./query-scope";
const SMALL_CACHE_LIMIT = 3;

export interface SeasonSummary {
  bundle: SeasonCohortBundle;
  leaderboard: SeasonLeaderboardModel;
  profiles: PlayerSeasonProfile[];
  insights: TournamentInsights | null;
}

const tournamentInsightsCache = createAnalysisBucket<TournamentInsights | null>();

/** 赛事/经济页面只需要 TournamentInsights，不必冷启动时构建 cohort + profiles + RR/PRISM。 */
export function getTournamentInsights(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<TournamentInsights | null> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:tournament-insights-name-groups-v5`;
  return cachedQuery(tournamentInsightsCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), entries, async (generation) => {
    const persisted = await readPersistedValue<TournamentInsights | null>(key, generation);
    if (persisted !== undefined) return persisted;
    const matchIds = entries.map(matchIdForEntry);
    const { facts, selectedKeys } = groupAnalysisTeams(withTeamRenames(await getDerivedCacheStore().getTournament({ matchIds }), identity?.teamRenames), selectedTeams);
    if (facts.length >= entries.length) {
      const built = facts.length > 0 ? buildTournamentInsightsFromFacts(facts) : null;
      const insights = built ? filterTournamentInsightsByTeam(built, selectedKeys, selectedTeams.length > 0) : null;
      await writePersistedValue(key, insights, generation);
      return insights;
    }
    throw missingFactsError("赛事洞察");
  });
}

const seasonSummaryCache = createAnalysisBucket<SeasonSummary>();

/** 聚合摘要：优先持久缓存命中（不触碰 ZIP），未命中才全量解析并回写。
 *  传入 identity 时将其并入缓存 key，identityMap 作为归并参数传给 buildSeasonCohort。
 *  Tournament 显式身份优先；未绑定队伍按当前显示名分组。 */
export function getSeasonSummary(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<SeasonSummary> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:season-summary-name-groups-v5`;
  return cachedQuery(seasonSummaryCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), entries, async (generation) => {
    const persisted = await readPersistedValue<SeasonSummary>(key, generation);
    if (persisted) return persisted;
    const factsStore = getFactsStore();
    const matchIds = entries.map(matchIdForEntry);
    // 队伍透镜（行级）：不窄化 demo 语料，只按 teamKey 过滤 cohort 行。内层 row.teamKey 新旧 facts 皆有。
    const allowed = allowedTeamKeysByMatch(entries, selectedTeams, identity?.teamRenames);
    const cohortRows = (await factsStore.getRrSignalRows({ matchIds })).filter((row) =>
      !allowed || allowed.get(row.matchId)?.has(row.teamKey),
    );
    if (entries.length === 0 || cohortRows.length > 0) {
      const cohortOpts = identity?.version ? { identityMap: identity.map } : {};
      const bundle = buildSeasonCohortFromRows(cohortRows, { ...cohortOpts, matchCount: entries.length });
      const { facts: tournamentFacts } = groupAnalysisTeams(withTeamRenames(await getDerivedCacheStore().getTournament({ matchIds }), identity?.teamRenames));
      const summary: SeasonSummary = {
        bundle,
        leaderboard: buildSeasonLeaderboardModel(bundle),
        profiles: buildAllPlayerSeasonProfiles(bundle),
        insights: tournamentFacts.length > 0 ? buildTournamentInsightsFromFacts(tournamentFacts) : null
      };
      await writePersistedValue(key, summary, generation);
      return summary;
    }
    throw missingFactsError("赛季聚合");
  });
}
