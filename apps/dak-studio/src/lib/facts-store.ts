import type {
  FactsScope,
  FactsStore,
  LineupFact,
  MatchFacts,
  MechanicsSamplesFact,
  PlayerMatchStatsFact,
  PlayerRrFact,
  PlayerWeaponFact,
} from "./fact-types";
import { getStorage, type RecordStore, type StorageAdapter } from "./storage";
import type { PlayerMechanicsFact } from "@cs2dak/core";
import type { CtRotationRoundFact, PlayerPositionRoundFact, TacticalRoundFact, TeamAwpRoundFact, TeamShapeRoundFact } from "@cs2dak/core";
import {
  createProducerManifestStore,
  newProducerGeneration,
  producerGenerationKey,
  type ProducerId,
  PRODUCER_REVISIONS,
} from "./producer-manifest";

export const FACTS_NAMESPACE = "facts";
const FACT_TABLES = [
  "player_match_stats", "player_weapons", "mechanics_samples", "rr_signal_rows", "lineups",
  "tactical_rounds", "player_position_rounds", "team_shape_rounds", "team_awp_rounds", "ct_rotation_rounds",
] as const;
export const FACTS_RECORD_NAMESPACES = FACT_TABLES.map((table) => `${FACTS_NAMESPACE}:${table}`);

const FACT_PRODUCERS: Record<Exclude<ProducerId, "radar-field">, readonly (typeof FACT_TABLES)[number][]> = {
  "base-facts": ["player_match_stats", "player_weapons", "rr_signal_rows"],
  duel: ["mechanics_samples"],
  tactical: ["tactical_rounds"],
  "map-intelligence": ["player_position_rounds", "team_shape_rounds", "team_awp_rounds", "ct_rotation_rounds"],
  utility: ["lineups"],
};

function inScope(row: { matchId: string; playerKey?: string; mapName?: string; steamId64?: string }, scope?: FactsScope): boolean {
  if (!scope) return true;
  if (scope.matchIds && !scope.matchIds.includes(row.matchId)) return false;
  const steamId64 = row.steamId64 ?? "";
  if (scope.playerKeys && scope.steamIds) {
    if ((!row.playerKey || !scope.playerKeys.includes(row.playerKey)) && !scope.steamIds.includes(steamId64)) return false;
  } else {
    if (scope.playerKeys && (!row.playerKey || !scope.playerKeys.includes(row.playerKey))) return false;
    if (scope.steamIds && !scope.steamIds.includes(steamId64)) return false;
  }
  return !scope.mapNames || (row.mapName != null && scope.mapNames.includes(row.mapName));
}

const ROW_KEY_SEP = "\t";
const rowKey = (...parts: string[]): string => parts.join(ROW_KEY_SEP);

type FactTable = (typeof FACT_TABLES)[number];
type FactStores = Record<FactTable, RecordStore>;

function tableRows(facts: MatchFacts): Record<FactTable, Array<[string, { matchId: string }]>> {
  return {
    player_match_stats: facts.playerMatchStats.map((row) => [rowKey(row.matchId, row.playerKey), row]),
    player_weapons: facts.playerWeapons.map((row) => [rowKey(row.matchId, row.playerKey, row.weapon), row]),
    mechanics_samples: facts.mechanicsSamples.map((row) => [rowKey(row.matchId, row.playerKey, row.weapon), row]),
    rr_signal_rows: facts.rrSignalRows.map((row) => [rowKey(row.matchId, row.playerKey), row]),
    lineups: facts.lineups.map((row) => [row.matchId, row]),
    tactical_rounds: facts.tacticalRounds.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.side), row]),
    player_position_rounds: facts.playerPositionRounds.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.teamKey, String(row.playerIndex)), row]),
    team_shape_rounds: facts.teamShapeRounds.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.teamKey), row]),
    team_awp_rounds: facts.teamAwpRounds.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.teamKey), row]),
    ct_rotation_rounds: facts.ctRotationRounds.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.teamKey, String(row.playerIndex)), row]),
  };
}

async function rowsForScope<T extends { matchId: string }>(
  store: RecordStore,
  producer: ProducerId,
  scope: FactsScope | undefined,
  generationFor: (matchId: string, producer: ProducerId) => Promise<string | undefined>,
  activeGenerationsFor: (producer: ProducerId) => Promise<Array<{ matchId: string; generation: string }>>,
): Promise<T[]> {
  const matchIds = scope?.matchIds;
  if (!matchIds) {
    const active = await activeGenerationsFor(producer);
    const groups = await Promise.all(active.map(async ({ matchId, generation }) =>
      (await store.getByPrefix<T>(producerGenerationKey(matchId, generation))).map(([, row]) => row)
    ));
    return groups.flat().filter((row) => inScope(row, scope));
  }
  const groups = await Promise.all(matchIds.map(async (matchId) => {
    const generation = await generationFor(matchId, producer);
    if (generation) return (await store.getByPrefix<T>(producerGenerationKey(matchId, generation))).map(([, row]) => row);
    const [exact, nested] = await Promise.all([
      store.get<T>(matchId),
      store.getByPrefix<T>(`${matchId}\t`),
    ]);
    return [
      ...(exact ? [exact] : []),
      ...nested.filter(([key]) => !key.startsWith(`${matchId}\tg:`)).map(([, row]) => row),
    ];
  }));
  return groups.flat().filter((row) => inScope(row, scope));
}

export function createFactsStore(adapter: StorageAdapter, namespace = FACTS_NAMESPACE): FactsStore {
  const stores = Object.fromEntries(FACT_TABLES.map((table) => [table, adapter.records(`${namespace}:${table}`)])) as FactStores;
  const manifests = createProducerManifestStore(adapter, namespace === FACTS_NAMESPACE ? undefined : `${namespace}:producer-manifests`);
  const generationFor = async (matchId: string, producer: ProducerId) => (await manifests.get(matchId, producer))?.active?.storageGenerations?.facts;
  const activeGenerationsFor = async (producer: ProducerId) => (await manifests.getAll())
    .filter((record) => record.producer === producer && record.active?.storageGenerations?.facts)
    .map((record) => ({
      matchId: record.matchId,
      generation: record.active!.storageGenerations!.facts!,
    }));

  async function stage(facts: MatchFacts, producer: Exclude<ProducerId, "radar-field">, generation: string): Promise<Record<string, number>> {
    const rows = tableRows(facts);
    const tables = FACT_PRODUCERS[producer];
    const counts = Object.fromEntries(tables.map((table) => [table, rows[table].length]));
    await Promise.all(tables.map(async (table) => {
      const candidate = rows[table].map(([key, row]) => [producerGenerationKey(facts.matchId, generation) + key, row] as [string, typeof row]);
      await stores[table].putMany(candidate);
      const written = await stores[table].getByPrefix<{ matchId: string }>(producerGenerationKey(facts.matchId, generation));
      if (written.length !== candidate.length || written.some(([, row]) => row.matchId !== facts.matchId)) {
        throw new Error(`${producer}/${table}: candidate generation validation failed`);
      }
    }));
    return counts;
  }

  async function activateStandalone(facts: MatchFacts, producer: Exclude<ProducerId, "radar-field">): Promise<void> {
    const startedAt = Date.now();
    const generation = newProducerGeneration();
    const previous = await manifests.get(facts.matchId, producer);
    try {
      const rowCounts = await stage(facts, producer, generation);
      await manifests.activate(facts.matchId, producer, {
        generation,
        producerRevision: PRODUCER_REVISIONS[producer],
        sourcePackageHash: `manual:${facts.matchId}`,
        rowCounts,
        storageGenerations: { facts: generation },
        startedAt,
      });
      const oldGeneration = previous?.active?.storageGenerations?.facts;
      if (oldGeneration && oldGeneration !== generation) {
        await Promise.all(FACT_PRODUCERS[producer].map((table) => stores[table].deleteByPrefix(producerGenerationKey(facts.matchId, oldGeneration))));
      }
    } catch (error) {
      await Promise.allSettled([
        ...FACT_PRODUCERS[producer].map((table) =>
          stores[table].deleteByPrefix(producerGenerationKey(facts.matchId, generation))
        ),
      ]);
      await manifests.fail(facts.matchId, producer, PRODUCER_REVISIONS[producer], startedAt, error);
      throw error;
    }
  }

  return {
    async putMatchFacts(facts) {
      for (const producer of Object.keys(FACT_PRODUCERS) as Array<Exclude<ProducerId, "radar-field">>) await activateStandalone(facts, producer);
    },
    stageMatchFacts: stage,
    async cleanupMatchFactsGeneration(matchId, producer, generation) {
      await Promise.all(FACT_PRODUCERS[producer].map((table) => stores[table].deleteByPrefix(producerGenerationKey(matchId, generation))));
    },
    async getPlayerMatchStats(scope) { return (await rowsForScope<PlayerMatchStatsFact>(stores.player_match_stats, "base-facts", scope, generationFor, activeGenerationsFor)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerName.localeCompare(b.playerName)); },
    async getPlayerWeapons(scope) { return (await rowsForScope<PlayerWeaponFact>(stores.player_weapons, "base-facts", scope, generationFor, activeGenerationsFor)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.weapon.localeCompare(b.weapon)); },
    async getMechanicsRows(scope) {
      const byMatch = new Map<string, PlayerMechanicsFact[]>();
      for (const row of (await rowsForScope<MechanicsSamplesFact>(stores.mechanics_samples, "duel", scope, generationFor, activeGenerationsFor)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey) || a.weapon.localeCompare(b.weapon))) {
        const bucket = byMatch.get(row.matchId) ?? []; bucket.push(row.row); byMatch.set(row.matchId, bucket);
      }
      return [...byMatch.entries()].map(([matchId, rows]) => ({ matchId, rows }));
    },
    async getRrSignalRows(scope) { return (await rowsForScope<PlayerRrFact>(stores.rr_signal_rows, "base-facts", scope, generationFor, activeGenerationsFor)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey)); },
    async getLineups(scope) { return (await rowsForScope<LineupFact>(stores.lineups, "utility", scope, generationFor, activeGenerationsFor)).sort((a, b) => a.matchId.localeCompare(b.matchId)); },
    async getTacticalRounds(scope) { return (await rowsForScope<TacticalRoundFact>(stores.tactical_rounds, "tactical", scope, generationFor, activeGenerationsFor)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber || a.side.localeCompare(b.side)); },
    async getPlayerPositionRounds(scope) { return (await rowsForScope<PlayerPositionRoundFact>(stores.player_position_rounds, "map-intelligence", scope, generationFor, activeGenerationsFor)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber || a.teamKey.localeCompare(b.teamKey) || a.playerIndex - b.playerIndex); },
    async getTeamShapeRounds(scope) { return (await rowsForScope<TeamShapeRoundFact>(stores.team_shape_rounds, "map-intelligence", scope, generationFor, activeGenerationsFor)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber || a.teamKey.localeCompare(b.teamKey)); },
    async getTeamAwpRounds(scope) { return (await rowsForScope<TeamAwpRoundFact>(stores.team_awp_rounds, "map-intelligence", scope, generationFor, activeGenerationsFor)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber || a.teamKey.localeCompare(b.teamKey)); },
    async getCtRotationRounds(scope) { return (await rowsForScope<CtRotationRoundFact>(stores.ct_rotation_rounds, "map-intelligence", scope, generationFor, activeGenerationsFor)).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber || a.teamKey.localeCompare(b.teamKey) || a.playerIndex - b.playerIndex); },
    async deleteMatchFacts(matchId) {
      await Promise.all(Object.values(stores).flatMap((store) => [
        store.delete(matchId),
        store.deleteByPrefix(`${matchId}\t`),
      ]));
    },
  };
}

let factsStore: FactsStore | null = null;
export function getFactsStore(): FactsStore { return (factsStore ??= createFactsStore(getStorage())); }
