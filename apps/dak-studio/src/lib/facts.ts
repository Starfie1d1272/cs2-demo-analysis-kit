import {
  derivePlayerMechanics,
  derivePlayerWeaponHighlights,
  deriveRRIndicators,
  deriveRRSignals,
  type PlayerMechanicsFact
} from "@cs2dak/core";
import type { SeasonCohortFactRow } from "@cs2dak/cohort";
import type { DemoPackage, RRSignals, TeamKey } from "@cs2dak/contract";
import type { TriangleBvh } from "@cs2dak/maps";
import {
  buildPlayerMechanicsProfileFromRows,
  buildPlayerSeasonInsights,
  displayWeaponName,
  type PlayerMechanicsProfile,
  type PlayerSeasonInsights,
  type PlayerWeaponStat
} from "@cs2dak/presentation";
import { getStorage, type RecordStore, type StorageAdapter } from "./storage";

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
  vsOneCount: number;
  vsOneWonCount: number;
  vsTwoCount: number;
  vsTwoWonCount: number;
  vsThreeCount: number;
  vsThreeWonCount: number;
  vsFourCount: number;
  vsFourWonCount: number;
  vsFiveCount: number;
  vsFiveWonCount: number;
}

export interface PlayerInsightFact {
  version: number;
  matchId: string;
  playerKey: string;
  steamId64: string;
  playerName: string;
  insight: PlayerSeasonInsights;
}

export interface PlayerWeaponFact {
  version: number;
  matchId: string;
  playerKey: string;
  steamId64: string;
  playerName: string;
  weapon: string;
  kills: number;
  headshots: number;
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

export interface CohortFact {
  version: number;
  matchId: string;
  playerKey: string;
  steamId64: string;
  row: SeasonCohortFactRow;
}

export interface MatchFacts {
  version: number;
  matchId: string;
  mapName: string;
  playerMatchStats: PlayerMatchStatsFact[];
  playerInsights: PlayerInsightFact[];
  playerWeapons: PlayerWeaponFact[];
  mechanicsSamples: MechanicsSamplesFact[];
  rrInputs: RRInputFact[];
  cohortRows: CohortFact[];
}

export interface ExtractMatchFactsOptions {
  matchId: string;
  visibilityFor?: (mapName: string) => TriangleBvh | null;
  playerKeyFor?: (player: { steamId64: string; name: string; teamKey: string }) => string;
}

export interface FactsScope {
  matchIds?: string[];
  playerKeys?: string[];
  steamIds?: string[];
  mapNames?: string[];
}

export interface ProjectedMechanicsRows {
  matchId: string;
  rows: PlayerMechanicsFact[];
}

export interface FactsStore {
  putMatchFacts(facts: MatchFacts): Promise<void>;
  getPlayerMatchStats(scope?: FactsScope): Promise<PlayerMatchStatsFact[]>;
  getPlayerInsights(scope?: FactsScope): Promise<PlayerInsightFact[]>;
  getPlayerWeapons(scope?: FactsScope): Promise<PlayerWeaponFact[]>;
  getMechanicsRows(scope?: FactsScope): Promise<ProjectedMechanicsRows[]>;
  getRRInputs(scope?: FactsScope): Promise<RRInputFact[]>;
  getCohortRows(scope?: FactsScope): Promise<SeasonCohortFactRow[]>;
  deleteMatchFacts(matchId: string): Promise<void>;
}

export interface PlayerSeasonDetailsFactsOptions extends FactsScope {
  steamIds: string[];
}

export interface PlayerSeasonDetailsFromFacts {
  insights: PlayerSeasonInsights;
  weaponStats: PlayerWeaponStat[];
  mechanics: PlayerMechanicsProfile;
}

export interface PlayerFlashSummariesFactsOptions extends FactsScope {
  players: Array<{ playerKey: string; name: string; steamIds: string[] }>;
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
      headshotCount: stats.headshotCount,
      vsOneCount: stats.vsOneCount,
      vsOneWonCount: stats.vsOneWonCount,
      vsTwoCount: stats.vsTwoCount,
      vsTwoWonCount: stats.vsTwoWonCount,
      vsThreeCount: stats.vsThreeCount,
      vsThreeWonCount: stats.vsThreeWonCount,
      vsFourCount: stats.vsFourCount,
      vsFourWonCount: stats.vsFourWonCount,
      vsFiveCount: stats.vsFiveCount,
      vsFiveWonCount: stats.vsFiveWonCount
    } satisfies PlayerMatchStatsFact;
  }).filter((row): row is PlayerMatchStatsFact => row != null);

  const players = playerBySteamId(pkg);
  const rrSignals = deriveRRSignals(pkg);
  const rrIndicators = deriveRRIndicators(pkg);
  const weaponHighlights = derivePlayerWeaponHighlights(pkg);
  const signalBySteamId = new Map(rrSignals.map((row) => [row.steamId64, row]));
  const indicatorBySteamId = new Map(rrIndicators.map((row) => [row.steamId64, row]));
  const weaponBySteamId = new Map(weaponHighlights.map((row) => [row.steamId64, row]));
  const playerInsights = pkg.players.map((player) => ({
    version: MATCH_FACTS_VERSION,
    matchId: options.matchId,
    playerKey: playerKeyFor(player),
    steamId64: player.steamId64,
    playerName: player.name,
    insight: buildPlayerSeasonInsights([{ matchId: options.matchId, pkg }], [player.steamId64])
  } satisfies PlayerInsightFact));

  const weaponCells = new Map<string, PlayerWeaponFact>();
  for (const kill of pkg.kills) {
    if (kill.killerIndex == null) continue;
    const killer = pkg.players[kill.killerIndex];
    if (!killer) continue;
    const weapon = kill.weapon || "unknown";
    const key = rowKey(options.matchId, killer.steamId64, weapon);
    const cell = weaponCells.get(key) ?? {
      version: MATCH_FACTS_VERSION,
      matchId: options.matchId,
      playerKey: playerKeyFor(killer),
      steamId64: killer.steamId64,
      playerName: killer.name,
      weapon,
      kills: 0,
      headshots: 0
    };
    cell.kills += 1;
    if (kill.headshot) cell.headshots += 1;
    weaponCells.set(key, cell);
  }
  const playerWeapons = [...weaponCells.values()];

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

  const rrInputs = rrSignals.map((signals) => {
    const player = players.get(signals.steamId64);
    return {
      version: MATCH_FACTS_VERSION,
      matchId: options.matchId,
      playerKey: player ? playerKeyFor(player) : defaultPlayerKey(signals),
      steamId64: signals.steamId64,
      signals
    } satisfies RRInputFact;
  });

  const cohortRows = pkg.players.map((player): CohortFact | null => {
    const signals = signalBySteamId.get(player.steamId64);
    const indicators = indicatorBySteamId.get(player.steamId64);
    if (!signals || !indicators) return null;
    return {
      version: MATCH_FACTS_VERSION,
      matchId: options.matchId,
      playerKey: playerKeyFor(player),
      steamId64: player.steamId64,
      row: {
        matchId: options.matchId,
        sourceDemoHash: pkg.manifest.demo?.hash ?? null,
        steamId64: player.steamId64,
        playerName: player.name,
        teamKey: player.teamKey,
        signals,
        indicators,
        weaponHighlight: weaponBySteamId.get(player.steamId64) ?? null
      }
    };
  }).filter((row): row is CohortFact => row != null);

  return {
    version: MATCH_FACTS_VERSION,
    matchId: options.matchId,
    mapName: pkg.match.mapName,
    playerMatchStats: playerStats,
    playerInsights,
    playerWeapons,
    mechanicsSamples,
    rrInputs,
    cohortRows
  };
}

function inScope(row: { matchId: string; playerKey: string; mapName?: string }, scope?: FactsScope): boolean {
  if (!scope) return true;
  if (scope.matchIds && !scope.matchIds.includes(row.matchId)) return false;
  const steamId64 = (row as { steamId64?: string }).steamId64 ?? "";
  if (scope.playerKeys && scope.steamIds) {
    if (!scope.playerKeys.includes(row.playerKey) && !scope.steamIds.includes(steamId64)) return false;
  } else {
    if (scope.playerKeys && !scope.playerKeys.includes(row.playerKey)) return false;
    if (scope.steamIds && !scope.steamIds.includes(steamId64)) return false;
  }
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
  const playerInsights = adapter.records(`${namespace}:player_insights`);
  const playerWeapons = adapter.records(`${namespace}:player_weapons`);
  const mechanics = adapter.records(`${namespace}:mechanics_samples`);
  const rrInputs = adapter.records(`${namespace}:rr_inputs`);
  const cohortRows = adapter.records(`${namespace}:cohort_rows`);

  return {
    async putMatchFacts(facts) {
      await Promise.all([
        replaceRows(
          playerStats,
          facts.playerMatchStats.map((row) => [rowKey(row.matchId, row.playerKey), row]),
          facts.matchId
        ),
        replaceRows(
          playerInsights,
          facts.playerInsights.map((row) => [rowKey(row.matchId, row.playerKey), row]),
          facts.matchId
        ),
        replaceRows(
          playerWeapons,
          facts.playerWeapons.map((row) => [rowKey(row.matchId, row.playerKey, row.weapon), row]),
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
        ),
        replaceRows(
          cohortRows,
          facts.cohortRows.map((row) => [rowKey(row.matchId, row.playerKey), row]),
          facts.matchId
        )
      ]);
    },
    async getPlayerMatchStats(scope) {
      return (await playerStats.getAll<PlayerMatchStatsFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerName.localeCompare(b.playerName));
    },
    async getPlayerInsights(scope) {
      return (await playerInsights.getAll<PlayerInsightFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerName.localeCompare(b.playerName));
    },
    async getPlayerWeapons(scope) {
      return (await playerWeapons.getAll<PlayerWeaponFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.weapon.localeCompare(b.weapon));
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
    async getCohortRows(scope) {
      return (await cohortRows.getAll<CohortFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey))
        .map((row) => row.row);
    },
    async deleteMatchFacts(matchId) {
      await Promise.all([
        replaceRows(playerStats, [], matchId),
        replaceRows(playerInsights, [], matchId),
        replaceRows(playerWeapons, [], matchId),
        replaceRows(mechanics, [], matchId),
        replaceRows(rrInputs, [], matchId),
        replaceRows(cohortRows, [], matchId)
      ]);
    }
  };
}

let factsStore: FactsStore | null = null;

export function getFactsStore(): FactsStore {
  return (factsStore ??= createFactsStore(getStorage()));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyInsights(): PlayerSeasonInsights {
  return {
    trend: [],
    flash: {
      flashesThrown: 0,
      enemyBlindSeconds: 0,
      teamBlindSeconds: 0,
      enemyBlindVictims: 0,
      enemySecondsPerFlash: null,
      netSecondsPerFlash: null,
      flashAssists: 0,
      worstTeamFlashes: []
    },
    mistakes: {
      lowBuyFirstDeaths: { count: 0, attempts: 0, evidence: [] },
      fullBuyFirstDeaths: { count: 0, attempts: 0, evidence: [] },
      antiEcoFirstDeaths: { count: 0, attempts: 0, evidence: [] },
      deathTiming: { early: 0, mid: 0, late: 0, total: 0 },
      clutchLosses: { count: 0, evidence: [] }
    }
  };
}

function mergeInsights(rows: PlayerInsightFact[]): PlayerSeasonInsights {
  if (rows.length === 1) return rows[0]!.insight;
  const out = emptyInsights();
  for (const row of rows) {
    const insight = row.insight;
    out.trend.push(...insight.trend);
    out.flash.flashesThrown += insight.flash.flashesThrown;
    out.flash.enemyBlindSeconds += insight.flash.enemyBlindSeconds;
    out.flash.teamBlindSeconds += insight.flash.teamBlindSeconds;
    out.flash.enemyBlindVictims += insight.flash.enemyBlindVictims;
    out.flash.flashAssists += insight.flash.flashAssists;
    out.flash.worstTeamFlashes.push(...insight.flash.worstTeamFlashes);
    for (const key of ["lowBuyFirstDeaths", "fullBuyFirstDeaths", "antiEcoFirstDeaths"] as const) {
      out.mistakes[key].count += insight.mistakes[key].count;
      out.mistakes[key].attempts += insight.mistakes[key].attempts;
      out.mistakes[key].evidence.push(...insight.mistakes[key].evidence);
    }
    out.mistakes.deathTiming.early += insight.mistakes.deathTiming.early;
    out.mistakes.deathTiming.mid += insight.mistakes.deathTiming.mid;
    out.mistakes.deathTiming.late += insight.mistakes.deathTiming.late;
    out.mistakes.deathTiming.total += insight.mistakes.deathTiming.total;
    out.mistakes.clutchLosses.count += insight.mistakes.clutchLosses.count;
    out.mistakes.clutchLosses.evidence.push(...insight.mistakes.clutchLosses.evidence);
  }
  out.trend.sort((a, b) => a.matchId.localeCompare(b.matchId));
  out.flash.enemyBlindSeconds = round1(out.flash.enemyBlindSeconds);
  out.flash.teamBlindSeconds = round1(out.flash.teamBlindSeconds);
  out.flash.enemySecondsPerFlash = out.flash.flashesThrown > 0
    ? round2(out.flash.enemyBlindSeconds / out.flash.flashesThrown)
    : null;
  out.flash.netSecondsPerFlash = out.flash.flashesThrown > 0
    ? round2((out.flash.enemyBlindSeconds - out.flash.teamBlindSeconds) / out.flash.flashesThrown)
    : null;
  out.flash.worstTeamFlashes = out.flash.worstTeamFlashes.sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 10);
  out.mistakes.lowBuyFirstDeaths.evidence = out.mistakes.lowBuyFirstDeaths.evidence.slice(0, 10);
  out.mistakes.fullBuyFirstDeaths.evidence = out.mistakes.fullBuyFirstDeaths.evidence.slice(0, 10);
  out.mistakes.antiEcoFirstDeaths.evidence = out.mistakes.antiEcoFirstDeaths.evidence.slice(0, 10);
  out.mistakes.clutchLosses.evidence = out.mistakes.clutchLosses.evidence.slice(0, 10);
  return out;
}

function mergeWeaponStats(rows: PlayerWeaponFact[], matchCount: number): PlayerWeaponStat[] {
  const byWeapon = new Map<string, { weapon: string; kills: number; headshots: number }>();
  for (const row of rows) {
    const cell = byWeapon.get(row.weapon) ?? { weapon: row.weapon, kills: 0, headshots: 0 };
    cell.kills += row.kills;
    cell.headshots += row.headshots;
    byWeapon.set(row.weapon, cell);
  }
  const denominator = Math.max(1, matchCount);
  return [...byWeapon.values()]
    .map((row) => ({
      weapon: row.weapon,
      label: displayWeaponName(row.weapon),
      kills: row.kills,
      headshotPercent: row.kills > 0 ? round1((row.headshots / row.kills) * 100) : null,
      killsPerMatch: round2(row.kills / denominator)
    }))
    .sort((a, b) => b.kills - a.kills || a.label.localeCompare(b.label));
}

export async function buildPlayerSeasonDetailsFromFacts(
  store: FactsStore,
  options: PlayerSeasonDetailsFactsOptions
): Promise<PlayerSeasonDetailsFromFacts> {
  const scope: FactsScope = {
    matchIds: options.matchIds,
    playerKeys: options.playerKeys,
    steamIds: options.steamIds,
    mapNames: options.mapNames
  };
  const [insights, weapons, mechanics] = await Promise.all([
    store.getPlayerInsights(scope),
    store.getPlayerWeapons(scope),
    store.getMechanicsRows(scope)
  ]);
  return {
    insights: mergeInsights(insights),
    weaponStats: mergeWeaponStats(weapons, mechanics.length),
    mechanics: buildPlayerMechanicsProfileFromRows(mechanics.map((match) => match.rows), options.steamIds, mechanics.length)
  };
}

export async function buildPlayerFlashSummariesFromFacts(
  store: FactsStore,
  options: PlayerFlashSummariesFactsOptions
): Promise<Array<{
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
}>> {
  return Promise.all(options.players.map(async (player) => {
    const merged = mergeInsights(await store.getPlayerInsights({
      matchIds: options.matchIds,
      mapNames: options.mapNames,
      playerKeys: [player.playerKey],
      steamIds: player.steamIds
    }));
    return {
      playerKey: player.playerKey,
      name: player.name,
      ...merged.flash
    };
  }));
}
