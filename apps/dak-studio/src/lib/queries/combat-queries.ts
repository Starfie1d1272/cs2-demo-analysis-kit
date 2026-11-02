import { buildDuelInsightsFromFacts } from "@cs2dak/analytics";
import { createAnalysisBucket, cachedQuery, readPersistedValue, writePersistedValue } from "./query-cache";
import { assertCurrentFacts } from "../facts-readiness";
import { getDerivedCacheStore } from "../derived-cache";
import type { DuelInsightsModel } from "@cs2dak/contract";
import { matchIdForEntry, type StudioDemoEntry } from "../demo-entry";

import type { IdentityOptions } from "../identity";
import { keyOf, missingFactsError } from "./query-scope";
import { getAnalysisTeamSlots } from "./spatial-queries";
const SMALL_CACHE_LIMIT = 3;

const duelInsightsCache = createAnalysisBucket<DuelInsightsModel>();
/** 对枪实验室：DuelInsights 是 LOS-heavy 派生模型，持久化后反复切页不再重跑 tri 判定。 */
const DUEL_CACHE_VER = 4;
export function getDuelInsights(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<DuelInsightsModel> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:duels:v${DUEL_CACHE_VER}`;
  return cachedQuery(duelInsightsCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), entries, async (generation) => {
    const persisted = await readPersistedValue<DuelInsightsModel>(key, generation);
    if (persisted) return persisted;
    const matchIds = entries.map(matchIdForEntry);
    const store = getDerivedCacheStore();
    const [duels, comparisons, allowed] = await Promise.all([store.getDuels({ matchIds }), store.getTeamComparison({ matchIds }), getAnalysisTeamSlots(entries, identity, selectedTeams)]);
    const byMatch = new Map(comparisons.map(row => [row.matchId, row]));
    const duelFacts = duels.map(fact => {
      if (!allowed) return fact;
      const roster = byMatch.get(fact.matchId);
      if (!roster) throw missingFactsError("队伍分组");
      const ids = new Set(roster.players.filter(player => allowed.get(fact.matchId)?.has(player.teamKey)).map(player => player.steamId64));
      const involved = (row: { killerSteamId64: string; victimSteamId64: string }) => ids.has(row.killerSteamId64) || ids.has(row.victimSteamId64);
      return { ...fact, duelRows: fact.duelRows.filter(involved), openingRows: fact.openingRows.filter(involved), mechanicsRows: fact.mechanicsRows.filter(row => ids.has(row.steamId64)) };
    });
    if (duelFacts.length >= entries.length) {
      const model = buildDuelInsightsFromFacts(duelFacts);
      await writePersistedValue(key, model, generation);
      return model;
    }
    throw missingFactsError("对枪实验室");
  });
}
