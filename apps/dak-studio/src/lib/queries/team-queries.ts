import { buildTeamComparisonFromFacts, buildTeamOverviewFromFacts } from "@cs2dak/analytics";
import { type TeamComparisonModel, type TeamOverviewModel } from "@cs2dak/presentation";
import { createAnalysisBucket, cachedQuery, readPersistedValue, writePersistedValue } from "./query-cache";
import { assertCurrentFacts } from "../facts-readiness";
import { getFactsStore } from "../facts-store";
import { getDerivedCacheStore } from "../derived-cache";
import { matchIdForEntry, type StudioDemoEntry } from "../demo-entry";

import type { IdentityOptions } from "../identity";
import { keyOf, missingFactsError, withTeamRenames } from "./query-scope";
import { groupAnalysisTeams } from "./tournament-groups";

async function groupedTeamFacts(matchIds: string[], identity?: IdentityOptions) {
  const store = getDerivedCacheStore();
  const [comparison, tournament] = await Promise.all([store.getTeamComparison({ matchIds }), store.getTournament({ matchIds })]);
  const groups = groupAnalysisTeams(withTeamRenames(tournament, identity?.teamRenames)).facts;
  const byMatch = new Map(groups.map(fact => [fact.matchId, fact]));
  return comparison.map(fact => {
    const group = byMatch.get(fact.matchId);
    if (!group) throw missingFactsError("队伍分组");
    return { ...fact, teams: group.teams, teamEntityKeys: group.teamEntityKeys };
  });
}

const SMALL_CACHE_LIMIT = 3;

const teamComparisonCache = createAnalysisBucket<TeamComparisonModel>();
const teamOverviewCache = createAnalysisBucket<TeamOverviewModel | null>();
/**
 * 队伍对比（赛前侦察）：两队各自跨全部己方比赛聚合，无需互相交手。
 * `pair` 指定要对比的 A/B 两队名（UI 选择）；缺省取场次最多的两队。
 * 返回的 model.availableTeams 供 UI 填充选队下拉。
 */
export async function getTeamComparison(entries: StudioDemoEntry[], identity?: IdentityOptions, pair?: [string, string]): Promise<TeamComparisonModel> {
  const key = `${keyOf(entries, identity?.version)}:team-comparison-groups-v1:${pair ? `${pair[0]}__vs__${pair[1]}` : "auto"}`;
  return cachedQuery(teamComparisonCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), entries, async (generation) => {
    const persisted = await readPersistedValue<TeamComparisonModel>(key, generation);
    if (persisted) return persisted;
    const matchIds = entries.map(matchIdForEntry);
    const facts = await groupedTeamFacts(matchIds, identity);
    if (facts.length >= entries.length) {
      const resolve = (value: string) => {
        const keys = new Set(facts.flatMap(fact => (["teamA", "teamB"] as const).filter(slot => fact.teamEntityKeys[slot] === value || fact.teams[slot] === value).map(slot => fact.teamEntityKeys[slot])));
        return keys.size === 1 ? [...keys][0]! : value;
      };
      const model = buildTeamComparisonFromFacts(facts, pair && [resolve(pair[0]), resolve(pair[1])], await getFactsStore().getRrSignalRows({ matchIds }));
      await writePersistedValue(key, model, generation);
      return model;
    }
    throw missingFactsError("队伍对比");
  });
}

/** 队伍对象页：从可重建 comparison facts 编排摘要，不在页面层重新解析 ZIP。 */
export async function getTeamOverview(entries: StudioDemoEntry[], teamName: string, identity?: IdentityOptions): Promise<TeamOverviewModel | null> {
  const key = `${keyOf(entries, identity?.version)}:team-overview-groups-v1:${teamName}`;
  return cachedQuery(teamOverviewCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), entries, async (generation) => {
    const persisted = await readPersistedValue<TeamOverviewModel | null>(key, generation);
    if (persisted !== undefined) return persisted;
    const matchIds = entries.map(matchIdForEntry);
    const facts = await groupedTeamFacts(matchIds, identity);
    if (facts.length < entries.length) throw missingFactsError("队伍总览");
    const keys = new Set(facts.flatMap(fact => (["teamA", "teamB"] as const).filter(slot => fact.teams[slot] === teamName || fact.teamEntityKeys[slot] === teamName).map(slot => fact.teamEntityKeys[slot])));
    const overview = keys.size === 1 ? buildTeamOverviewFromFacts(facts, [...keys][0]!, [], await getFactsStore().getRrSignalRows({ matchIds })) : null;
    await writePersistedValue(key, overview, generation);
    return overview;
  });
}
