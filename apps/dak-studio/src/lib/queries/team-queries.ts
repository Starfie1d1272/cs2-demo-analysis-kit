import { buildTeamComparisonFromFacts, buildTeamOverviewFromFacts } from "@cs2dak/analytics";
import { type TeamComparisonModel, type TeamOverviewModel } from "@cs2dak/presentation";
import { createAnalysisBucket, cachedQuery, readPersistedValue, writePersistedValue } from "./query-cache";
import { assertCurrentFacts } from "../facts-readiness";
import { getFactsStore } from "../facts-store";
import { getDerivedCacheStore } from "../derived-cache";
import { matchIdForEntry, type StudioDemoEntry } from "../demo-entry";

import type { IdentityOptions } from "../identity";
import { keyOf, missingFactsError, withTeamRenames } from "./query-scope";
const SMALL_CACHE_LIMIT = 3;

const teamComparisonCache = createAnalysisBucket<TeamComparisonModel>();
const teamOverviewCache = createAnalysisBucket<TeamOverviewModel | null>();
/**
 * 队伍对比（赛前侦察）：两队各自跨全部己方比赛聚合，无需互相交手。
 * `pair` 指定要对比的 A/B 两队名（UI 选择）；缺省取场次最多的两队。
 * 返回的 model.availableTeams 供 UI 填充选队下拉。
 */
export async function getTeamComparison(entries: StudioDemoEntry[], identity?: IdentityOptions, pair?: [string, string]): Promise<TeamComparisonModel> {
  const key = `${keyOf(entries, identity?.version)}:team-comparison-v2:${pair ? `${pair[0]}__vs__${pair[1]}` : "auto"}`;
  return cachedQuery(teamComparisonCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), async (generation) => {
    const persisted = await readPersistedValue<TeamComparisonModel>(key, generation);
    if (persisted) return persisted;
    const matchIds = entries.map(matchIdForEntry);
    const facts = withTeamRenames(await getDerivedCacheStore().getTeamComparison({ matchIds }), identity?.teamRenames);
    if (facts.length >= entries.length) {
      const model = buildTeamComparisonFromFacts(facts, pair, await getFactsStore().getRrSignalRows({ matchIds }));
      await writePersistedValue(key, model, generation);
      return model;
    }
    throw missingFactsError("队伍对比");
  });
}

/** 队伍对象页：从可重建 comparison facts 编排摘要，不在页面层重新解析 ZIP。 */
export async function getTeamOverview(entries: StudioDemoEntry[], teamName: string, identity?: IdentityOptions): Promise<TeamOverviewModel | null> {
  const key = `${keyOf(entries, identity?.version)}:team-overview-v3:${teamName}`;
  return cachedQuery(teamOverviewCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), async (generation) => {
    const persisted = await readPersistedValue<TeamOverviewModel | null>(key, generation);
    if (persisted !== undefined) return persisted;
    const matchIds = entries.map(matchIdForEntry);
    const facts = withTeamRenames(await getDerivedCacheStore().getTeamComparison({ matchIds }), identity?.teamRenames);
    if (facts.length < entries.length) throw missingFactsError("队伍总览");
    const overview = buildTeamOverviewFromFacts(facts, teamName, [], await getFactsStore().getRrSignalRows({ matchIds }));
    await writePersistedValue(key, overview, generation);
    return overview;
  });
}
