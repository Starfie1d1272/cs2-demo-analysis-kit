import { buildSeasonCohortFromRows } from "@cs2dak/cohort";
import { buildAllPlayerSeasonProfiles, buildSeasonLeaderboardModel, buildTournamentInsightsFromFacts, type TournamentFacts, type TournamentInsights } from "@cs2dak/analytics";
import { createAnalysisBucket, cachedQuery, readPersistedValue, writePersistedValue } from "./query-cache";
import { assertCurrentFacts } from "../facts-readiness";
import { getFactsStore } from "../facts-store";
import { getDerivedCacheStore } from "../derived-cache";
import type { SeasonCohortBundle } from "@cs2dak/cohort";
import type { PlayerSeasonProfile, SeasonLeaderboardModel } from "@cs2dak/presentation";
import { matchIdForEntry, type StudioDemoEntry } from "../demo-entry";

import type { IdentityOptions } from "../identity";
import { keyOf, allowedTeamKeysByMatch, filterTournamentInsightsByTeam, missingFactsError, withTeamRenames } from "./query-scope";
const SMALL_CACHE_LIMIT = 3;

export interface SeasonSummary {
  bundle: SeasonCohortBundle;
  leaderboard: SeasonLeaderboardModel;
  profiles: PlayerSeasonProfile[];
  insights: TournamentInsights | null;
}

const tournamentInsightsCache = createAnalysisBucket<TournamentInsights | null>();

// Display-name groups are local to this analysis, not canonical team identities.
function groupTournamentTeams(facts: TournamentFacts[], selectedTeams: string[] = []): { facts: TournamentFacts[]; selectedKeys: string[] } {
  const selected = new Set(selectedTeams);
  const selectedKeys = new Set<string>();
  const namesByKey = new Map<string, Set<string>>();
  const grouped = facts.map((fact) => {
    const teamEntityKeys = { ...fact.teamEntityKeys };
    for (const slot of ["teamA", "teamB"] as const) {
      const name = fact.teams[slot];
      if (teamEntityKeys[slot] === `observed-team:${fact.matchId}:${slot}`) {
        const collision = fact.teams.teamA === fact.teams.teamB;
        teamEntityKeys[slot] = collision
          ? `analysis-team-observation:${JSON.stringify([fact.matchId, slot])}`
          : `analysis-team-name:${JSON.stringify(name)}`;
      }
      const key = teamEntityKeys[slot];
      if (selected.has(name)) selectedKeys.add(key);
      const names = namesByKey.get(key) ?? new Set<string>();
      names.add(name);
      namesByKey.set(key, names);
    }
    return { ...fact, teamEntityKeys };
  });
  const keysByName = new Map<string, Set<string>>();
  for (const [key, names] of namesByKey) for (const name of names) {
    const keys = keysByName.get(name) ?? new Set<string>();
    keys.add(key);
    keysByName.set(name, keys);
  }
  return {
    selectedKeys: [...selectedKeys],
    facts: grouped.map((fact) => ({ ...fact, teams: Object.fromEntries((["teamA", "teamB"] as const).map((slot) => {
      const name = fact.teams[slot];
      const key = fact.teamEntityKeys[slot];
      const qualifier = key.startsWith("analysis-team-observation:")
        ? `比赛 ${fact.matchId} · ${slot === "teamA" ? "A" : "B"} 方`
        : key.startsWith("analysis-team-name:") ? "名称分组" : `绑定 ${key}`;
      const label = (keysByName.get(name)?.size ?? 0) > 1 ? `${name} · ${qualifier}` : name;
      return [slot, label];
    })) as TournamentFacts["teams"] })),
  };
}

/** 赛事/经济页面只需要 TournamentInsights，不必冷启动时构建 cohort + profiles + RR/PRISM。 */
export function getTournamentInsights(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<TournamentInsights | null> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:tournament-name-groups-v3`;
  return cachedQuery(tournamentInsightsCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), async (generation) => {
    const persisted = await readPersistedValue<TournamentInsights | null>(key, generation);
    if (persisted !== undefined) return persisted;
    const matchIds = entries.map(matchIdForEntry);
    const { facts, selectedKeys } = groupTournamentTeams(withTeamRenames(await getDerivedCacheStore().getTournament({ matchIds }), identity?.teamRenames), selectedTeams);
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
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:tournament-name-groups-v3`;
  return cachedQuery(seasonSummaryCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), async (generation) => {
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
      const { facts: tournamentFacts } = groupTournamentTeams(withTeamRenames(await getDerivedCacheStore().getTournament({ matchIds }), identity?.teamRenames));
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
