import { derivePlayerMechanics, deriveRRSignals, type PlayerMechanicsFact } from "@cs2dak/core";
import type { DemoPackage, RRSignals, TeamKey } from "@cs2dak/contract";
import type { TriangleBvh } from "@cs2dak/maps";
import type { RecordStore, StorageAdapter } from "./storage";

export const MATCH_FACTS_VERSION = 1;

export interface PlayerMatchStatsFact {
  version: number;
  matchId: string;
  playerKey: string;
  steamId64: string;
  playerName: string;
  teamKey: TeamKey;
  mapName: string;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  damageHealth: number;
  kastRounds: number;
  firstKillCount: number;
  firstDeathCount: number;
  flashAssistCount: number;
  enemyFlashDurationSeconds: number;
  teamFlashDurationSeconds: number;
  utilityDamage: number;
  tradeKillCount: number;
  tradeDeathCount: number;
  headshotCount: number;
}

export interface MechanicsSamplesFact {
  version: number;
  matchId: string;
  playerKey: string;
  steamId64: string;
  weapon: string;
  row: PlayerMechanicsFact;
}

export interface RRInputFact {
  version: number;
  matchId: string;
  playerKey: string;
  steamId64: string;
  signals: RRSignals;
}

export interface MatchFacts {
  version: number;
  matchId: string;
  mapName: string;
  playerMatchStats: PlayerMatchStatsFact[];
  mechanicsSamples: MechanicsSamplesFact[];
  rrInputs: RRInputFact[];
}

export interface ExtractMatchFactsOptions {
  matchId: string;
  visibilityFor?: (mapName: string) => TriangleBvh | null;
  playerKeyFor?: (player: { steamId64: string; name: string; teamKey: string }) => string;
}

export interface FactsScope {
  matchIds?: string[];
  playerKeys?: string[];
  mapNames?: string[];
}

export interface ProjectedMechanicsRows {
  matchId: string;
  rows: PlayerMechanicsFact[];
}

export interface FactsStore {
  putMatchFacts(facts: MatchFacts): Promise<void>;
  getPlayerMatchStats(scope?: FactsScope): Promise<PlayerMatchStatsFact[]>;
  getMechanicsRows(scope?: FactsScope): Promise<ProjectedMechanicsRows[]>;
  getRRInputs(scope?: FactsScope): Promise<RRInputFact[]>;
  deleteMatchFacts(matchId: string): Promise<void>;
}

function defaultPlayerKey(player: { steamId64: string }): string {
  return `steam:${player.steamId64}`;
}

function playerBySteamId(pkg: DemoPackage): Map<string, DemoPackage["players"][number]> {
  return new Map(pkg.players.map((player) => [player.steamId64, player]));
}

export function extractMatchFacts(pkg: DemoPackage, options: ExtractMatchFactsOptions): MatchFacts {
  const playerKeyFor = options.playerKeyFor ?? defaultPlayerKey;
  const playerStats = pkg.playerStats.map((stats): PlayerMatchStatsFact | null => {
    const player = pkg.players[stats.playerIndex];
    if (!player) return null;
    return {
      version: MATCH_FACTS_VERSION,
      matchId: options.matchId,
      playerKey: playerKeyFor(player),
      steamId64: player.steamId64,
      playerName: player.name,
      teamKey: player.teamKey,
      mapName: pkg.match.mapName,
      rounds: stats.rounds,
      kills: stats.kills,
      deaths: stats.deaths,
      assists: stats.assists,
      damageHealth: stats.damageHealth,
      kastRounds: stats.kastRounds,
      firstKillCount: stats.firstKillCount,
      firstDeathCount: stats.firstDeathCount,
      flashAssistCount: stats.flashAssistCount,
      enemyFlashDurationSeconds: stats.enemyFlashDurationSeconds,
      teamFlashDurationSeconds: stats.teamFlashDurationSeconds,
      utilityDamage: stats.utilityDamage,
      tradeKillCount: stats.tradeKillCount,
      tradeDeathCount: stats.tradeDeathCount,
      headshotCount: stats.headshotCount
    } satisfies PlayerMatchStatsFact;
  }).filter((row): row is PlayerMatchStatsFact => row != null);

  const players = playerBySteamId(pkg);
  const mechanicsSamples = derivePlayerMechanics(pkg, {
    visibility: options.visibilityFor?.(pkg.match.mapName) ?? null
  }).map((row) => {
    const player = players.get(row.steamId64);
    return {
      version: MATCH_FACTS_VERSION,
      matchId: options.matchId,
      playerKey: player ? playerKeyFor(player) : defaultPlayerKey(row),
      steamId64: row.steamId64,
      weapon: row.weapon,
      row
    } satisfies MechanicsSamplesFact;
  });

  const rrInputs = deriveRRSignals(pkg).map((signals) => {
    const player = players.get(signals.steamId64);
    return {
      version: MATCH_FACTS_VERSION,
      matchId: options.matchId,
      playerKey: player ? playerKeyFor(player) : defaultPlayerKey(signals),
      steamId64: signals.steamId64,
      signals
    } satisfies RRInputFact;
  });

  return {
    version: MATCH_FACTS_VERSION,
    matchId: options.matchId,
    mapName: pkg.match.mapName,
    playerMatchStats: playerStats,
    mechanicsSamples,
    rrInputs
  };
}

function inScope(row: { matchId: string; playerKey: string; mapName?: string }, scope?: FactsScope): boolean {
  if (!scope) return true;
  if (scope.matchIds && !scope.matchIds.includes(row.matchId)) return false;
  if (scope.playerKeys && !scope.playerKeys.includes(row.playerKey)) return false;
  if (scope.mapNames && (!row.mapName || !scope.mapNames.includes(row.mapName))) return false;
  return true;
}

async function replaceRows<T extends { matchId: string }>(
  store: RecordStore,
  rows: Array<[string, T]>,
  matchId: string
): Promise<void> {
  const existing = await store.entries<T>();
  await Promise.all(existing.filter(([, row]) => row.matchId === matchId).map(([key]) => store.delete(key)));
  await Promise.all(rows.map(([key, row]) => store.put(key, row)));
}

function rowKey(...parts: string[]): string {
  return parts.join("\t");
}

export function createFactsStore(adapter: StorageAdapter, namespace = "facts"): FactsStore {
  const playerStats = adapter.records(`${namespace}:player_match_stats`);
  const mechanics = adapter.records(`${namespace}:mechanics_samples`);
  const rrInputs = adapter.records(`${namespace}:rr_inputs`);

  return {
    async putMatchFacts(facts) {
      await Promise.all([
        replaceRows(
          playerStats,
          facts.playerMatchStats.map((row) => [rowKey(row.matchId, row.playerKey), row]),
          facts.matchId
        ),
        replaceRows(
          mechanics,
          facts.mechanicsSamples.map((row) => [rowKey(row.matchId, row.playerKey, row.weapon), row]),
          facts.matchId
        ),
        replaceRows(
          rrInputs,
          facts.rrInputs.map((row) => [rowKey(row.matchId, row.playerKey), row]),
          facts.matchId
        )
      ]);
    },
    async getPlayerMatchStats(scope) {
      return (await playerStats.getAll<PlayerMatchStatsFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerName.localeCompare(b.playerName));
    },
    async getMechanicsRows(scope) {
      const rows = (await mechanics.getAll<MechanicsSamplesFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey) || a.weapon.localeCompare(b.weapon));
      const byMatch = new Map<string, PlayerMechanicsFact[]>();
      for (const row of rows) {
        const bucket = byMatch.get(row.matchId) ?? [];
        bucket.push(row.row);
        byMatch.set(row.matchId, bucket);
      }
      return [...byMatch.entries()].map(([matchId, matchRows]) => ({ matchId, rows: matchRows }));
    },
    async getRRInputs(scope) {
      return (await rrInputs.getAll<RRInputFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey));
    },
    async deleteMatchFacts(matchId) {
      await Promise.all([
        replaceRows(playerStats, [], matchId),
        replaceRows(mechanics, [], matchId),
        replaceRows(rrInputs, [], matchId)
      ]);
    }
  };
}
