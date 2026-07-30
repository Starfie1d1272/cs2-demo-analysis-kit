import type { OpeningTrailsModel } from "@cs2dak/contract";
import type { DuelInsightsFacts, PlayerSeasonInsights, TeamComparisonFacts, TournamentFacts, UtilityValueSummary } from "@cs2dak/presentation";
import type { FactsScope } from "./fact-types";
import { getStorage, type RecordStore, type StorageAdapter } from "./storage";
import {
  createProducerManifestStore,
  newProducerGeneration,
  producerGenerationKey,
  type ProducerId,
  PRODUCER_REVISIONS,
} from "./producer-manifest";

export const DERIVED_MATCH_NAMESPACE = "derived:match-v4";
const TABLES = ["player_insights", "tournament", "team_comparison", "duels", "opening_trails", "utility_value"] as const;
export const DERIVED_CACHE_RECORD_NAMESPACES = TABLES.map((table) => `${DERIVED_MATCH_NAMESPACE}:${table}`);
const DERIVED_PRODUCERS: Record<"base-facts" | "duel" | "utility", readonly (typeof TABLES)[number][]> = {
  "base-facts": ["player_insights", "tournament", "team_comparison"],
  duel: ["duels", "opening_trails"],
  utility: ["utility_value"],
};

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
  return !scope.mapNames || (row.mapName != null && scope.mapNames.includes(row.mapName));
}

type DerivedTable = (typeof TABLES)[number];
type DerivedStores = Record<DerivedTable, RecordStore>;
function tableRows(value: MatchDerivedCache): Record<DerivedTable, Array<[string, ScopedRow]>> {
  return {
    player_insights: value.playerInsights.map((row) => [`${row.matchId}\t${row.playerKey}`, row]),
    tournament: value.tournament.map((row) => [row.matchId, row]),
    team_comparison: value.teamComparison.map((row) => [row.matchId, row]),
    duels: value.duels.map((row) => [row.matchId, row]),
    opening_trails: value.openingTrails.map((row) => [`${row.matchId}\t${row.playerKey}`, row]),
    utility_value: value.utilityValue.map((row) => [row.matchId, row]),
  };
}

async function rowsForScope<T extends ScopedRow>(
  store: RecordStore,
  producer: ProducerId,
  scope: FactsScope | undefined,
  generationFor: (matchId: string, producer: ProducerId) => Promise<string | undefined>,
): Promise<T[]> {
  if (!scope?.matchIds) return (await store.getAll<T>()).filter((row) => inScope(row, scope));
  const groups = await Promise.all(scope.matchIds.map(async (matchId) => {
    const generation = await generationFor(matchId, producer);
    if (generation) return (await store.getByPrefix<T>(producerGenerationKey(matchId, generation))).map(([, row]) => row);
    return (await store.getByPrefix<T>(matchId)).filter(([key]) => !key.startsWith(`${matchId}\tg:`)).map(([, row]) => row);
  }));
  return groups.flat().filter((row) => inScope(row, scope));
}

export interface DerivedCacheStore {
  putMatchDerived(value: MatchDerivedCache): Promise<void>;
  stageMatchDerived(value: MatchDerivedCache, producer: keyof typeof DERIVED_PRODUCERS, generation: string): Promise<Record<string, number>>;
  cleanupMatchDerivedGeneration(matchId: string, producer: keyof typeof DERIVED_PRODUCERS, generation: string): Promise<void>;
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
  const stores = Object.fromEntries(TABLES.map((table) => [table, adapter.records(`${namespace}:${table}`)])) as DerivedStores;
  const manifests = createProducerManifestStore(adapter, namespace === DERIVED_MATCH_NAMESPACE ? undefined : `${namespace}:producer-manifests`);
  const generationFor = async (matchId: string, producer: ProducerId) => (await manifests.get(matchId, producer))?.active?.storageGenerations?.derived;
  const legacyStores = namespace === DERIVED_MATCH_NAMESPACE
    ? ["player_insights", "tournament_facts", "team_comparison_facts", "duel_facts", "match_workspace", "opening_trails", "utility_value"].map((table) => adapter.records(`derived:match-v3-map2:${table}`))
    : [];

  async function stage(value: MatchDerivedCache, producer: keyof typeof DERIVED_PRODUCERS, generation: string): Promise<Record<string, number>> {
    const rows = tableRows(value);
    const tables = DERIVED_PRODUCERS[producer];
    const counts = Object.fromEntries(tables.map((table) => [table, rows[table].length]));
    await Promise.all(tables.map(async (table) => {
      const candidate = rows[table].map(([key, row]) => [producerGenerationKey(value.matchId, generation) + key, row] as [string, ScopedRow]);
      await stores[table].putMany(candidate);
      const written = await stores[table].getByPrefix<ScopedRow>(producerGenerationKey(value.matchId, generation));
      if (written.length !== candidate.length || written.some(([, row]) => row.matchId !== value.matchId)) throw new Error(`${producer}/${table}: candidate generation validation failed`);
    }));
    return counts;
  }

  async function activateStandalone(value: MatchDerivedCache, producer: keyof typeof DERIVED_PRODUCERS): Promise<void> {
    const startedAt = Date.now();
    const generation = newProducerGeneration();
    const previous = await manifests.get(value.matchId, producer);
    try {
      const rowCounts = await stage(value, producer, generation);
      await manifests.activate(value.matchId, producer, {
        generation, producerRevision: PRODUCER_REVISIONS[producer], sourcePackageHash: `manual:${value.matchId}`,
        rowCounts, storageGenerations: { derived: generation }, startedAt,
      });
      const oldGeneration = previous?.active?.storageGenerations?.derived;
      if (oldGeneration && oldGeneration !== generation) await Promise.all(DERIVED_PRODUCERS[producer].map((table) => stores[table].deleteByPrefix(producerGenerationKey(value.matchId, oldGeneration))));
    } catch (error) {
      await manifests.fail(value.matchId, producer, PRODUCER_REVISIONS[producer], startedAt, error);
      throw error;
    }
  }

  return {
    async putMatchDerived(value) {
      for (const producer of Object.keys(DERIVED_PRODUCERS) as Array<keyof typeof DERIVED_PRODUCERS>) await activateStandalone(value, producer);
      await Promise.all(legacyStores.map((store) => store.deleteByPrefix(value.matchId)));
    },
    stageMatchDerived: stage,
    async cleanupMatchDerivedGeneration(matchId, producer, generation) {
      await Promise.all(DERIVED_PRODUCERS[producer].map((table) => stores[table].deleteByPrefix(producerGenerationKey(matchId, generation))));
    },
    async getPlayerInsights(scope) { return (await rowsForScope<DerivedPlayerInsight>(stores.player_insights, "base-facts", scope, generationFor)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerName.localeCompare(b.playerName)); },
    async getTournament(scope) { return (await rowsForScope<DerivedTournament>(stores.tournament, "base-facts", scope, generationFor)).sort((a, b) => a.matchId.localeCompare(b.matchId)).map((row) => row.row); },
    async getTeamComparison(scope) { return (await rowsForScope<DerivedTeamComparison>(stores.team_comparison, "base-facts", scope, generationFor)).sort((a, b) => a.matchId.localeCompare(b.matchId)).map((row) => row.row); },
    async getDuels(scope) { return (await rowsForScope<DerivedDuel>(stores.duels, "duel", scope, generationFor)).sort((a, b) => a.matchId.localeCompare(b.matchId)).map((row) => row.row); },
    async getOpeningTrails(scope) { return (await rowsForScope<DerivedOpeningTrail>(stores.opening_trails, "duel", scope, generationFor)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey)); },
    async getUtilityValue(scope) { return (await rowsForScope<DerivedUtilityValue>(stores.utility_value, "utility", scope, generationFor)).sort((a, b) => a.matchId.localeCompare(b.matchId)).map((row) => row.row); },
    async getUtilityValueMatchIds(scope) { return [...new Set((await rowsForScope<DerivedUtilityValue>(stores.utility_value, "utility", scope, generationFor)).map((row) => row.matchId))].sort(); },
    async deleteMatch(matchId) { await Promise.all([...Object.values(stores), ...legacyStores].map((store) => store.deleteByPrefix(matchId))); },
  };
}

let derivedCache: DerivedCacheStore | null = null;
export function getDerivedCacheStore(): DerivedCacheStore { return (derivedCache ??= createDerivedCacheStore(getStorage())); }
