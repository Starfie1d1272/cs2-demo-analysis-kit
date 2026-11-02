import { buildDuelInsightsFromFacts } from "@cs2dak/analytics";
import { createAnalysisBucket, cachedQuery, readPersistedValue, writePersistedValue } from "./query-cache";
import { assertCurrentFacts } from "../facts-readiness";
import { getDerivedCacheStore } from "../derived-cache";
import type { DuelInsightsModel } from "@cs2dak/contract";
import { matchIdForEntry, type StudioDemoEntry } from "../library";

import type { IdentityOptions } from "../identity";
import { keyOf, filterDuelFactsByTeam, missingFactsError } from "./query-scope";
const SMALL_CACHE_LIMIT = 3;

const duelInsightsCache = createAnalysisBucket<DuelInsightsModel>();
/** 对枪实验室：DuelInsights 是 LOS-heavy 派生模型，持久化后反复切页不再重跑 tri 判定。 */
const DUEL_CACHE_VER = 3;
export function getDuelInsights(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<DuelInsightsModel> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:duels:v${DUEL_CACHE_VER}`;
  return cachedQuery(duelInsightsCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), async (generation) => {
    const persisted = await readPersistedValue<DuelInsightsModel>(key, generation);
    if (persisted) return persisted;
    const matchIds = entries.map(matchIdForEntry);
    const duelFacts = filterDuelFactsByTeam(await getDerivedCacheStore().getDuels({ matchIds }), selectedTeams, identity?.teamRenames);
    if (duelFacts.length >= entries.length) {
      const model = buildDuelInsightsFromFacts(duelFacts);
      await writePersistedValue(key, model, generation);
      return model;
    }
    throw missingFactsError("对枪实验室");
  });
}
