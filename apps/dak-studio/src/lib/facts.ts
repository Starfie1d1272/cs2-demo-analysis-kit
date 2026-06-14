import {
  derivePlayerMechanics,
  derivePlayerWeaponHighlights,
  deriveRRIndicators,
  deriveRRSignals,
  type PlayerMechanicsFact
} from "@cs2dak/core";
import type { SeasonCohortFactRow } from "@cs2dak/cohort";
import type { OpeningPatternCluster } from "@cs2dak/cohort";
import type { DemoPackage, MatchWorkspaceModel, OpeningTrailsModel, Side, TeamKey } from "@cs2dak/contract";
import { FLAG_ALIVE } from "@cs2dak/contract";
import type { TriangleBvh } from "@cs2dak/maps";
import type { LineupGrenadeLike } from "@cs2dak/maps";
import {
  buildMatchWorkspaceModel,
  buildOpeningTrails,
  buildPlayerMechanicsProfileFromRows,
  buildPlayerSeasonInsights,
  extractDuelInsightsFacts,
  extractTeamComparisonFacts,
  extractTournamentFacts,
  displayWeaponName,
  type DuelInsightsFacts,
  type PlayerMechanicsProfile,
  type PlayerSeasonInsights,
  type PlayerWeaponStat,
  type TeamComparisonFacts,
  type TournamentFacts
} from "@cs2dak/presentation";
import { getStorage, type RecordStore, type StorageAdapter } from "./storage";

// ── 事实行基类型（消除 13 个接口中重复的 matchId/playerKey/…//） ──

interface FactBase {
  matchId: string;
}

interface PlayerFactBase extends FactBase {
  playerKey: string;
  steamId64: string;
  playerName: string;
}

interface MatchFactBase extends FactBase {
  mapName: string;
}

export interface PlayerMatchStatsFact extends PlayerFactBase {
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

export interface PlayerInsightFact extends PlayerFactBase {
  insight: PlayerSeasonInsights;
}

export interface PlayerWeaponFact extends PlayerFactBase {
  weapon: string;
  kills: number;
  headshots: number;
}

export interface MechanicsSamplesFact extends PlayerFactBase {
  weapon: string;
  row: PlayerMechanicsFact;
}

export interface CohortFact extends PlayerFactBase {
  row: SeasonCohortFactRow;
}

export interface TournamentFact extends MatchFactBase {
  row: TournamentFacts;
}

export interface TeamComparisonFact extends MatchFactBase {
  row: TeamComparisonFacts;
}

export interface DuelFact extends MatchFactBase {
  row: DuelInsightsFacts;
}

export interface MatchWorkspaceFact extends MatchFactBase {
  row: MatchWorkspaceModel;
}

export interface OpeningTrailFact extends MatchFactBase {
  playerKey: string;
  steamId64: string;
  row: OpeningTrailsModel;
}

export interface LineupFact extends MatchFactBase {
  grenades: LineupGrenadeLike[];
  roundWinners: Array<[string, string]>;
  tickrate: number;
}

export interface OpeningPatternFact extends MatchFactBase {
  side: Side;
  windowSeconds: number;
  basis: string;
  grenadeSequence: string[];
  roundNumber: number;
  won: boolean;
}

export interface MatchFacts {
  matchId: string;
  mapName: string;
  playerMatchStats: PlayerMatchStatsFact[];
  playerInsights: PlayerInsightFact[];
  playerWeapons: PlayerWeaponFact[];
  mechanicsSamples: MechanicsSamplesFact[];
  cohortRows: CohortFact[];
  tournamentFacts: TournamentFact[];
  teamComparisonFacts: TeamComparisonFact[];
  duelFacts: DuelFact[];
  matchWorkspace: MatchWorkspaceFact[];
  openingTrails: OpeningTrailFact[];
  lineups: LineupFact[];
  openingPatterns: OpeningPatternFact[];
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
  getCohortRows(scope?: FactsScope): Promise<SeasonCohortFactRow[]>;
  getTournamentFacts(scope?: FactsScope): Promise<TournamentFacts[]>;
  getTeamComparisonFacts(scope?: FactsScope): Promise<TeamComparisonFacts[]>;
  getDuelFacts(scope?: FactsScope): Promise<DuelInsightsFacts[]>;
  getMatchWorkspaces(scope?: FactsScope): Promise<MatchWorkspaceFact[]>;
  getOpeningTrails(scope?: FactsScope): Promise<OpeningTrailFact[]>;
  getLineups(scope?: FactsScope): Promise<LineupFact[]>;
  getOpeningPatterns(scope?: FactsScope): Promise<OpeningPatternFact[]>;
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

function sideOf(pkg: DemoPackage, playerIndex: number, roundNumber: number): Side | null {
  const player = pkg.players[playerIndex];
  const round = pkg.rounds.find((row) => row.roundNumber === roundNumber);
  if (!player || !round) return null;
  return player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
}

function throwerPlaceAt(pkg: DemoPackage, roundNumber: number, playerIndex: number, tick: number): string | null {
  const replay = pkg.replay;
  if (!replay) return null;
  const replayRound = replay.rounds.find((row) => row.roundNumber === roundNumber);
  if (!replayRound) return null;
  const track = replayRound.players.find((player) => player.playerIndex === playerIndex);
  if (!track) return null;
  const frameIndex = Math.max(
    0,
    Math.min(replayRound.frameCount - 1, Math.round((tick - replayRound.startTick) / replayRound.tickStep))
  );
  const placeIndex = track.place[frameIndex];
  if (placeIndex == null || placeIndex < 0 || placeIndex >= replay.placeDict.length) return null;
  return replay.placeDict[placeIndex] || null;
}

function extractLineupFact(pkg: DemoPackage, matchId: string): LineupFact {
  const roundsByNumber = new Map(pkg.rounds.map((round) => [round.roundNumber, round]));
  return {    matchId,
    mapName: pkg.match.mapName,
    tickrate: pkg.match.tickrate || 64,
    roundWinners: pkg.rounds.map((round) => [`${matchId}:${round.roundNumber}`, round.winnerTeamKey]),
    grenades: (pkg.grenades ?? []).map((grenade) => {
      const round = roundsByNumber.get(grenade.roundNumber);
      const player = pkg.players[grenade.throwerIndex];
      return {
        roundNumber: grenade.roundNumber,
        grenade: grenade.grenade,
        throwerIndex: grenade.throwerIndex,
        throwTick: grenade.throwTick,
        throwPosition: grenade.throwPosition,
        effectPosition: grenade.effectPosition,
        entryId: matchId,
        freezeEndTick: round?.freezeEndTick ?? 0,
        throwerPlaceName: throwerPlaceAt(pkg, grenade.roundNumber, grenade.throwerIndex, grenade.throwTick),
        side: sideOf(pkg, grenade.throwerIndex, grenade.roundNumber),
        teamKey: player?.teamKey ?? null
      };
    })
  };
}

function distributionKey(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, count]) => `${label}:${count}`).join("|");
}

function replayLabelsAt(pkg: DemoPackage, roundNumber: number, side: Side, sampleTick: number): string[] {
  const replay = pkg.replay;
  const round = pkg.rounds.find((row) => row.roundNumber === roundNumber);
  const replayRound = replay?.rounds.find((row) => row.roundNumber === roundNumber);
  if (!replay || !round || !replayRound) return [];
  const labels: string[] = [];
  for (const track of replayRound.players) {
    const player = pkg.players[track.playerIndex];
    if (!player) continue;
    const playerSide = player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
    if (playerSide !== side) continue;
    const frameIndex = Math.max(
      0,
      Math.min(replayRound.frameCount - 1, Math.round((sampleTick - replayRound.startTick) / replayRound.tickStep))
    );
    if (((track.flags[frameIndex] ?? 0) & FLAG_ALIVE) === 0) continue;
    const place = replay.placeDict?.[track.place[frameIndex] ?? -1];
    if (place) labels.push(place);
  }
  return labels.sort();
}

function extractOpeningPatternFacts(pkg: DemoPackage, matchId: string, windowSeconds = 15): OpeningPatternFact[] {
  const tickrate = pkg.match.tickrate || 64;
  return pkg.rounds.flatMap((round) => {
    const sampleTick = round.freezeEndTick + windowSeconds * tickrate;
    return (["t", "ct"] as const).flatMap((side) => {
      const labels = replayLabelsAt(pkg, round.roundNumber, side, sampleTick);
      if (labels.length === 0) return [];
      const grenades = pkg.grenades
        .filter((grenade) =>
          grenade.roundNumber === round.roundNumber &&
          grenade.throwTick >= round.freezeEndTick &&
          grenade.throwTick <= sampleTick &&
          sideOf(pkg, grenade.throwerIndex, round.roundNumber) === side
        )
        .sort((a, b) => a.throwTick - b.throwTick)
        .map((grenade) => grenade.grenade);
      return [{        matchId,
        mapName: pkg.match.mapName,
        side,
        windowSeconds,
        basis: distributionKey(labels),
        grenadeSequence: grenades,
        roundNumber: round.roundNumber,
        won: round.winnerSide === side
      }];
    });
  });
}

export function extractMatchFacts(pkg: DemoPackage, options: ExtractMatchFactsOptions): MatchFacts {
  const playerKeyFor = options.playerKeyFor ?? defaultPlayerKey;
  const playerStats = pkg.playerStats.map((stats): PlayerMatchStatsFact | null => {
    const player = pkg.players[stats.playerIndex];
    if (!player) return null;
    return {      matchId: options.matchId,
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
  const playerInsights = pkg.players.map((player) => ({    matchId: options.matchId,
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
    const cell = weaponCells.get(key) ?? {      matchId: options.matchId,
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
    return {      matchId: options.matchId,
      playerKey: player ? playerKeyFor(player) : defaultPlayerKey(row),
      steamId64: row.steamId64,
      playerName: player?.name ?? row.steamId64,
      weapon: row.weapon,
      row
    } satisfies MechanicsSamplesFact;
  });

  const cohortRows = pkg.players.map((player): CohortFact | null => {
    const signals = signalBySteamId.get(player.steamId64);
    const indicators = indicatorBySteamId.get(player.steamId64);
    if (!signals || !indicators) return null;
    return {      matchId: options.matchId,
      playerKey: playerKeyFor(player),
      steamId64: player.steamId64,
      playerName: player.name,
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
  const mapName = pkg.match.mapName;
  const visibilityFor = options.visibilityFor?.(mapName) ?? null;
  const input = { matchId: options.matchId, pkg };
  const matchWorkspace = buildMatchWorkspaceModel(pkg);
  const openingTrails = pkg.players.map((player) => ({    matchId: options.matchId,
    mapName,
    playerKey: playerKeyFor(player),
    steamId64: player.steamId64,
    row: buildOpeningTrails(pkg, options.matchId, player.steamId64, { windowSeconds: 30 })
  } satisfies OpeningTrailFact));

  return {    matchId: options.matchId,
    mapName,
    playerMatchStats: playerStats,
    playerInsights,
    playerWeapons,
    mechanicsSamples,
    cohortRows,
    tournamentFacts: [{      matchId: options.matchId,
      mapName,
      row: extractTournamentFacts(input)
    }],
    teamComparisonFacts: [{      matchId: options.matchId,
      mapName,
      row: extractTeamComparisonFacts(input)
    }],
    duelFacts: [{      matchId: options.matchId,
      mapName,
      row: extractDuelInsightsFacts(input, { visibilityFor: () => visibilityFor })
    }],
    matchWorkspace: [{      matchId: options.matchId,
      mapName,
      row: matchWorkspace
    }],
    openingTrails,
    lineups: [extractLineupFact(pkg, options.matchId)],
    openingPatterns: extractOpeningPatternFacts(pkg, options.matchId)
  };
}

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
  const cohortRows = adapter.records(`${namespace}:cohort_rows`);
  const tournamentFacts = adapter.records(`${namespace}:tournament_facts`);
  const teamComparisonFacts = adapter.records(`${namespace}:team_comparison_facts`);
  const duelFacts = adapter.records(`${namespace}:duel_facts`);
  const matchWorkspace = adapter.records(`${namespace}:match_workspace`);
  const openingTrails = adapter.records(`${namespace}:opening_trails`);
  const lineups = adapter.records(`${namespace}:lineups`);
  const openingPatterns = adapter.records(`${namespace}:opening_patterns`);

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
          cohortRows,
          facts.cohortRows.map((row) => [rowKey(row.matchId, row.playerKey), row]),
          facts.matchId
        ),
        replaceRows(
          tournamentFacts,
          facts.tournamentFacts.map((row) => [row.matchId, row]),
          facts.matchId
        ),
        replaceRows(
          teamComparisonFacts,
          facts.teamComparisonFacts.map((row) => [row.matchId, row]),
          facts.matchId
        ),
        replaceRows(
          duelFacts,
          facts.duelFacts.map((row) => [row.matchId, row]),
          facts.matchId
        ),
        replaceRows(
          matchWorkspace,
          facts.matchWorkspace.map((row) => [row.matchId, row]),
          facts.matchId
        ),
        replaceRows(
          openingTrails,
          facts.openingTrails.map((row) => [rowKey(row.matchId, row.playerKey), row]),
          facts.matchId
        ),
        replaceRows(
          lineups,
          facts.lineups.map((row) => [row.matchId, row]),
          facts.matchId
        ),
        replaceRows(
          openingPatterns,
          facts.openingPatterns.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.side), row]),
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
    async getCohortRows(scope) {
      return (await cohortRows.getAll<CohortFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey))
        .map((row) => row.row);
    },
    async getTournamentFacts(scope) {
      return (await tournamentFacts.getAll<TournamentFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId))
        .map((row) => row.row);
    },
    async getTeamComparisonFacts(scope) {
      return (await teamComparisonFacts.getAll<TeamComparisonFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId))
        .map((row) => row.row);
    },
    async getDuelFacts(scope) {
      return (await duelFacts.getAll<DuelFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId))
        .map((row) => row.row);
    },
    async getMatchWorkspaces(scope) {
      return (await matchWorkspace.getAll<MatchWorkspaceFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId));
    },
    async getOpeningTrails(scope) {
      return (await openingTrails.getAll<OpeningTrailFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey));
    },
    async getLineups(scope) {
      return (await lineups.getAll<LineupFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId));
    },
    async getOpeningPatterns(scope) {
      return (await openingPatterns.getAll<OpeningPatternFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber || a.side.localeCompare(b.side));
    },
    async deleteMatchFacts(matchId) {
      await Promise.all(
        [playerStats, playerInsights, playerWeapons, mechanics,
         cohortRows, tournamentFacts, teamComparisonFacts, duelFacts,
         matchWorkspace, openingTrails, lineups, openingPatterns]
          .map((store) => replaceRows(store as RecordStore, [], matchId))
      );
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
  const [insights, weapons, mechanics] = await Promise.all([
    store.getPlayerInsights(options),
    store.getPlayerWeapons(options),
    store.getMechanicsRows(options)
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

export function buildOpeningPatternClustersFromFacts(rows: OpeningPatternFact[]): OpeningPatternCluster[] {
  const clusters = new Map<string, OpeningPatternCluster>();
  for (const row of rows) {
    const key = `${row.mapName}:${row.side}:${row.windowSeconds}:${row.basis}:${row.grenadeSequence.join(">")}`;
    const cluster = clusters.get(key) ?? {
      id: key,
      mapName: row.mapName,
      side: row.side,
      windowSeconds: row.windowSeconds as 15 | 20 | 30,
      basis: row.basis,
      roundCount: 0,
      winRatePercent: null,
      grenadeSequence: row.grenadeSequence,
      rounds: []
    };
    cluster.roundCount += 1;
    cluster.rounds.push({ matchId: row.matchId, roundNumber: row.roundNumber, won: row.won });
    clusters.set(key, cluster);
  }
  return [...clusters.values()]
    .map((cluster) => {
      const wins = cluster.rounds.filter((round) => round.won).length;
      return { ...cluster, winRatePercent: cluster.roundCount > 0 ? round1((wins / cluster.roundCount) * 100) : null };
    })
    .sort((a, b) => b.roundCount - a.roundCount || a.id.localeCompare(b.id));
}
