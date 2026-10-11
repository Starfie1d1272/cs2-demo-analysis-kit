import { deleteMatchRows, settleWrites } from "./storage/match-rows";
import type { OpeningTrailsModel } from "@cs2dak/contract";
import type { DuelInsightsFacts, PlayerSeasonInsights, TeamComparisonFacts, TournamentFacts, UtilityValueSummary } from "@cs2dak/presentation";
import type { FactsScope } from "./fact-types";
import { getStorage, type RecordStore, type StorageAdapter } from "./storage";

// v6 requires explicit stable Tournament identities. Old label-derived rows
// are rebuilt locally; raw Demo packages and immutable remote evidence are untouched.
export const DERIVED_MATCH_NAMESPACE = "derived:match-v6";
const TABLES = ["player_insights", "tournament", "team_comparison", "duels", "opening_trails", "utility_value"] as const;
export const DERIVED_CACHE_RECORD_NAMESPACES = TABLES.map((table) => `${DERIVED_MATCH_NAMESPACE}:${table}`);
export const LEGACY_DERIVED_RECORD_NAMESPACES = [
  ...TABLES.map((table) => `derived:match-v5:${table}`),
  ...TABLES.map((table) => `derived:match-v4:${table}`),
  ...["player_insights", "tournament_facts", "team_comparison_facts", "duel_facts", "match_workspace", "opening_trails", "utility_value"].map((table) => `derived:match-v3-map2:${table}`),
];

interface ScopedRow { matchId: string; playerKey?: string; steamId64?: string; mapName?: string }
export interface DerivedPlayerInsight extends ScopedRow { playerKey: string; steamId64: string; playerName: string; insight: PlayerSeasonInsights }
export interface DerivedTournament extends ScopedRow { mapName: string; row: TournamentFacts }
export interface DerivedTeamComparison extends ScopedRow { mapName: string; row: TeamComparisonFacts }
export interface DerivedDuel extends ScopedRow { mapName: string; row: DuelInsightsFacts }
export interface DerivedOpeningTrail extends ScopedRow { mapName: string; playerKey: string; steamId64: string; row: OpeningTrailsModel }
export interface DerivedUtilityValue extends ScopedRow { mapName: string; row: UtilityValueSummary }

export interface MatchDerivedCache {
  matchId: string;
  playerInsights: DerivedPlayerInsight[];
  tournament: DerivedTournament[];
  teamComparison: DerivedTeamComparison[];
  duels: DerivedDuel[];
  openingTrails: DerivedOpeningTrail[];
  utilityValue: DerivedUtilityValue[];
}

function inScope(row: ScopedRow, scope?: FactsScope): boolean {
  if (!scope) return true;
  if (scope.matchIds && !scope.matchIds.includes(row.matchId)) return false;
  if (scope.playerKeys && scope.steamIds) {
    if ((!row.playerKey || !scope.playerKeys.includes(row.playerKey)) && (!row.steamId64 || !scope.steamIds.includes(row.steamId64))) return false;
  } else {
    if (scope.playerKeys && (!row.playerKey || !scope.playerKeys.includes(row.playerKey))) return false;
    if (scope.steamIds && (!row.steamId64 || !scope.steamIds.includes(row.steamId64))) return false;
  }
  if (scope.mapNames && (!row.mapName || !scope.mapNames.includes(row.mapName))) return false;
  return true;
}

async function replaceRows<T extends ScopedRow>(store: RecordStore, rows: Array<[string, T]>, matchId: string): Promise<void> {
  await deleteMatchRows(store, matchId);
  await settleWrites(rows.map(([key, row]) => store.put(key, row)));
}

export interface DerivedCacheStore {
  putMatchDerived(value: MatchDerivedCache): Promise<void>;
  getPlayerInsights(scope?: FactsScope): Promise<DerivedPlayerInsight[]>;
  getTournament(scope?: FactsScope): Promise<TournamentFacts[]>;
  getTeamComparison(scope?: FactsScope): Promise<TeamComparisonFacts[]>;
  getDuels(scope?: FactsScope): Promise<DuelInsightsFacts[]>;
  getOpeningTrails(scope?: FactsScope): Promise<DerivedOpeningTrail[]>;
  getUtilityValue(scope?: FactsScope): Promise<UtilityValueSummary[]>;
  getUtilityValueMatchIds(scope?: FactsScope): Promise<string[]>;
  deleteMatch(matchId: string): Promise<void>;
}

export function createDerivedCacheStore(adapter: StorageAdapter, namespace = DERIVED_MATCH_NAMESPACE): DerivedCacheStore {
  const stores = Object.fromEntries(TABLES.map((table) => [table, adapter.records(`${namespace}:${table}`)])) as Record<(typeof TABLES)[number], RecordStore>;
  const legacyStores = namespace === DERIVED_MATCH_NAMESPACE
    ? LEGACY_DERIVED_RECORD_NAMESPACES.map((table) => adapter.records(table))
    : [];
  return {
    async putMatchDerived(value) {
      await settleWrites([
        replaceRows(stores.player_insights, value.playerInsights.map((row) => [`${row.matchId}\t${row.playerKey}`, row]), value.matchId),
        replaceRows(stores.tournament, value.tournament.map((row) => [row.matchId, row]), value.matchId),
        replaceRows(stores.team_comparison, value.teamComparison.map((row) => [row.matchId, row]), value.matchId),
        replaceRows(stores.duels, value.duels.map((row) => [row.matchId, row]), value.matchId),
        replaceRows(stores.opening_trails, value.openingTrails.map((row) => [`${row.matchId}\t${row.playerKey}`, row]), value.matchId),
        replaceRows(stores.utility_value, value.utilityValue.map((row) => [row.matchId, row]), value.matchId),
        ...legacyStores.map((store) => deleteMatchRows(store, value.matchId)),
      ]);
    },
    async getPlayerInsights(scope) { return (await stores.player_insights.getAll<DerivedPlayerInsight>()).filter((row) => inScope(row, scope)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerName.localeCompare(b.playerName)); },
    async getTournament(scope) { return (await stores.tournament.getAll<DerivedTournament>()).filter((row) => inScope(row, scope)).sort((a, b) => a.matchId.localeCompare(b.matchId)).map((row) => row.row); },
    async getTeamComparison(scope) { return (await stores.team_comparison.getAll<DerivedTeamComparison>()).filter((row) => inScope(row, scope)).sort((a, b) => a.matchId.localeCompare(b.matchId)).map((row) => row.row); },
    async getDuels(scope) { return (await stores.duels.getAll<DerivedDuel>()).filter((row) => inScope(row, scope)).sort((a, b) => a.matchId.localeCompare(b.matchId)).map((row) => row.row); },
    async getOpeningTrails(scope) { return (await stores.opening_trails.getAll<DerivedOpeningTrail>()).filter((row) => inScope(row, scope)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey)); },
    async getUtilityValue(scope) { return (await stores.utility_value.getAll<DerivedUtilityValue>()).filter((row) => inScope(row, scope)).sort((a, b) => a.matchId.localeCompare(b.matchId)).map((row) => row.row); },
    async getUtilityValueMatchIds(scope) { return [...new Set((await stores.utility_value.getAll<DerivedUtilityValue>()).filter((row) => inScope(row, scope)).map((row) => row.matchId))].sort(); },
    async deleteMatch(matchId) { await settleWrites([...Object.values(stores), ...legacyStores].map((store) => deleteMatchRows(store, matchId))); },
  };
}

let derivedCache: DerivedCacheStore | null = null;
export function getDerivedCacheStore(): DerivedCacheStore { return (derivedCache ??= createDerivedCacheStore(getStorage())); }
