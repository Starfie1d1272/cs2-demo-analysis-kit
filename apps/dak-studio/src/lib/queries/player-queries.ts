import { type PlayerSeasonInsights, type PlayerMechanicsProfile, type PlayerWeaponStat } from "@cs2dak/analytics";
import { createAnalysisBucket, cachedQuery, readPersistedValue, writePersistedValue } from "./query-cache";
import { assertCurrentFacts } from "../facts-readiness";
import { getFactsStore } from "../facts-store";
import { getDerivedCacheStore } from "../derived-cache";
import { type StudioDemoEntry } from "../demo-entry";

import type { IdentityOptions } from "../identity";
import { keyOf, orderedMatchIds, allowedTeamKeysByMatch } from "./query-scope";
const DETAILS_CACHE_LIMIT = 6;
import { buildPlayerSeasonInsightsFromFacts, buildPlayerWeaponStatsFromRows, buildPlayerMechanicsProfileFromRows } from "@cs2dak/analytics";
import type { FactsStore, PlayerSeasonDetailsFactsOptions, PlayerSeasonDetailsFromFacts } from "../fact-types";
import type { DerivedCacheStore } from "../derived-cache";
export async function buildPlayerSeasonDetailsFromFacts(
  store: FactsStore,
  derived: DerivedCacheStore,
  options: PlayerSeasonDetailsFactsOptions,
  allowed: Map<string, Set<"teamA" | "teamB">> | null,
): Promise<PlayerSeasonDetailsFromFacts> {
  const [insights, weapons, mechanics, participation] = await Promise.all([
    derived.getPlayerInsights(options),
    store.getPlayerWeapons(options),
    store.getMechanicsRows(options),
    store.getPlayerMatchStats(options),
  ]);
  const pairKey = (matchId: string, steamId64: string) => JSON.stringify([matchId, steamId64]);
  const participationKeys = new Set(participation.map(row => pairKey(row.matchId, row.steamId64)));
  for (const row of weapons) {
    if (options.steamIds.includes(row.steamId64) && !participationKeys.has(pairKey(row.matchId, row.steamId64))) {
      throw new Error(`Missing participation for weapon row: ${row.matchId}/${row.steamId64}`);
    }
  }
  const eligible = participation.filter(row => !allowed || allowed.get(row.matchId)?.has(row.teamKey));
  const ids = new Set(eligible.map(row => row.matchId));
  const participantKeys = new Set(eligible.map(row => pairKey(row.matchId, row.steamId64)));
  const withinScope = (matchId: string, steamId64: string) => !allowed || participantKeys.has(pairKey(matchId, steamId64));
  const scopedMechanics = mechanics.map(match => ({
    ...match,
    rows: match.rows.filter(row => withinScope(match.matchId, row.steamId64)),
  })).filter(match => match.rows.length > 0);
  return {
    participation: eligible.map(({ matchId, teamKey }) => ({ matchId, teamKey })),
    insights: buildPlayerSeasonInsightsFromFacts(insights.filter(row => withinScope(row.matchId, row.steamId64)).map(row => row.facts), { steamIds: options.steamIds, orderedMatchIds: options.matchIds ?? [] }),
    weaponStats: buildPlayerWeaponStatsFromRows(weapons.filter(row => withinScope(row.matchId, row.steamId64)), { steamIds: options.steamIds, eligibleMatchIds: eligible.map(row => row.matchId) }),
    coverage: { eligibleMatchCount: ids.size, mechanicsMatchCount: new Set(scopedMechanics.map(row => row.matchId)).size },
    mechanics: buildPlayerMechanicsProfileFromRows(scopedMechanics.map(match => match.rows), options.steamIds, scopedMechanics.length),
  };
}


const detailsCache = createAnalysisBucket<PlayerSeasonDetails>();
export interface PlayerSeasonDetails {
  participation: Array<{ matchId: string; teamKey: "teamA" | "teamB" }>;
  insights: PlayerSeasonInsights;
  weaponStats: PlayerWeaponStat[];
  mechanics: PlayerMechanicsProfile;
  coverage: { eligibleMatchCount: number; mechanicsMatchCount: number };
}

/** 选中选手的逐场洞察：只返回小结果，不把全量 DemoPackage 长期放进 React state。 */
export function getPlayerSeasonDetails(entries: StudioDemoEntry[], steamIds: string[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<PlayerSeasonDetails> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:player:v3:${[...steamIds].sort().join(",")}:order=${orderedMatchIds(entries).join(",")}`;
  return cachedQuery(detailsCache, key, DETAILS_CACHE_LIMIT, () => assertCurrentFacts(entries), entries, async (generation) => {
    const persisted = await readPersistedValue<PlayerSeasonDetails>(key, generation);
    if (persisted) return persisted;
    const factsStore = getFactsStore();
    const factsScope = { matchIds: orderedMatchIds(entries), steamIds };
    const derived = getDerivedCacheStore();
    const details = await buildPlayerSeasonDetailsFromFacts(factsStore, derived, factsScope, allowedTeamKeysByMatch(entries, selectedTeams, identity?.teamRenames));
    await writePersistedValue(key, details, generation);
    return details;
  });
}
