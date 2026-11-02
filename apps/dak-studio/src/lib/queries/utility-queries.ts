import { type PlayerFlashSummary, type PlayerSeasonInsights, type UtilityValueSummary } from "@cs2dak/analytics";
import { createAnalysisBucket, cachedQuery, readPersistedValue, writePersistedValue } from "./query-cache";
import { assertCurrentFacts } from "../facts-readiness";
import { getDerivedCacheStore } from "../derived-cache";
import { matchIdForEntry, type StudioDemoEntry } from "../demo-entry";

import type { IdentityOptions } from "../identity";
import { keyOf, orderedMatchIds, allowedTeamKeysByMatch, missingFactsError } from "./query-scope";
const SMALL_CACHE_LIMIT = 3;
import { buildPlayerSeasonInsightsFromFacts, mergeUtilityValueSummaries } from "@cs2dak/analytics";
import type { PlayerFlashSummariesFactsOptions, UtilityValueFactsOptions } from "../fact-types";
import type { DerivedPlayerInsight } from "../derived-cache";
function buildPlayerFlashSummariesFromFacts(
  rows: readonly DerivedPlayerInsight[],
  options: PlayerFlashSummariesFactsOptions,
  allowed: Map<string, Set<"teamA" | "teamB">> | null,
): Array<{
  playerKey: string;
  name: string;
  flashesThrown: number;
  enemyBlindSeconds: number;
  teamBlindSeconds: number;
  enemyBlindVictims: number;
  enemySecondsPerFlash: number | null;
  netSecondsPerFlash: number | null;
  flashAssists: number;
  worstTeamFlashes: PlayerSeasonInsights["flash"]["worstTeamFlashes"];
  bestEnemyFlashes: PlayerSeasonInsights["flash"]["bestEnemyFlashes"];
}> {
  return options.players.map((player) => {
    const merged = buildPlayerSeasonInsightsFromFacts(rows.filter(row => !allowed || allowed.get(row.matchId)?.has(row.facts.performance.teamKey)).map(row => row.facts), { steamIds: player.steamIds, orderedMatchIds: options.matchIds ?? [] });
    return {
      playerKey: player.playerKey,
      name: player.name,
      ...merged.flash,
    };
  });
}

function buildUtilityValueSummaryFromFacts(
  facts: UtilityValueSummary[],
  options: UtilityValueFactsOptions,
): UtilityValueSummary {
  const summary = mergeUtilityValueSummaries(facts, {
    players: options.players,
    teamRenames: options.teamRenames,
  });
  return options.selectedTeams && options.selectedTeams.length > 0
    ? { ...summary, teams: summary.teams.filter((row) => options.selectedTeams!.includes(row.name)) }
    : summary;
}

const flashCache = createAnalysisBucket<PlayerFlashSummary[]>();
const utilityValueCache = createAnalysisBucket<UtilityValueSummary>();
/** 道具页多人 Flash Value：单次扫描所有 demo，避免每个选手重复扫全量 events。 */
export function getPlayerFlashSummaries(
  entries: StudioDemoEntry[],
  players: Array<{ playerKey: string; name: string; steamIds: string[] }>,
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<PlayerFlashSummary[]> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:flash:v2:order=${orderedMatchIds(entries).join(",")}:${players.map((p) => `${p.playerKey}=${p.steamIds.join(",")}`).sort().join("|")}`;
  return cachedQuery(flashCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), entries, async (generation) => {
    const persisted = await readPersistedValue<PlayerFlashSummary[]>(key, generation);
    if (persisted) return persisted;
    const matchIds = entries.map(matchIdForEntry);
    const derived = getDerivedCacheStore();
    const factRows = await derived.getPlayerInsights({ matchIds });
    if (entries.length === 0 || factRows.length > 0) {
      const summaries = buildPlayerFlashSummariesFromFacts(factRows, { matchIds: orderedMatchIds(entries), players }, allowedTeamKeysByMatch(entries, selectedTeams, identity?.teamRenames));
      await writePersistedValue(key, summaries, generation);
      return summaries;
    }
    throw missingFactsError("Flash Value");
  });
}

export function getUtilityValueSummary(
  entries: StudioDemoEntry[],
  players: Array<{ playerKey: string; name: string; steamIds: string[] }>,
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<UtilityValueSummary> {
  const playerKey = players.map((p) => `${p.playerKey}=${p.steamIds.join(",")}`).sort().join("|");
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:utility-value:v2:${playerKey}`;
  return cachedQuery(utilityValueCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), entries, async (generation) => {
    const persisted = await readPersistedValue<UtilityValueSummary>(key, generation);
    if (persisted) return persisted;
    const matchIds = entries.map(matchIdForEntry);
    const derived = getDerivedCacheStore();
    const facts = await derived.getUtilityValue({ matchIds });
    if (facts.length >= entries.length) {
      const summary = buildUtilityValueSummaryFromFacts(facts, {
        matchIds,
        players,
        teamRenames: identity?.teamRenames,
        selectedTeams
      });
      await writePersistedValue(key, summary, generation);
      return summary;
    }
    throw missingFactsError("道具价值");
  });
}
