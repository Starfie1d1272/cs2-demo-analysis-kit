import {
  buildPlayerRoundFacts,
  buildPlayerRoundUtilityFacts,
  derivePlayerWeaponHighlights,
} from "@cs2dak/core";
import type { DemoPackage, TeamKey } from "@cs2dak/contract";
import {
  buildTournamentPerformanceAnalytics,
  type TournamentClutchOpponentCount,
  type TournamentEntityLabels,
  type TournamentPerformanceAnalytics,
  type TournamentPerformanceMapFacts,
  type TournamentPerformancePlayerRoundFact,
  type TournamentPerformanceUtilityFact,
} from "@cs2dak/tournament";
import type { SeasonInsightsDemo } from "./insights.js";

const TEAM_KEYS = ["teamA", "teamB"] as const satisfies readonly TeamKey[];
const ANALYSIS_VERSION = "cs2-demo-analysis-kit/1.0.1";
const SEMANTIC_PROFILE = "dak-stable/1";

export interface TournamentPerformanceAdapterOptions {
  /** Optional RivalHub or other consumer-owned canonical team identities. */
  teamEntityKeys?: Partial<Record<TeamKey, string>>;
  /** Optional consumer-owned player identities keyed by observed Steam64. */
  playerEntityKeys?: Record<string, string>;
  labels?: TournamentEntityLabels;
}

function teamNameFor(pkg: DemoPackage, teamKey: TeamKey): string {
  return teamKey === "teamA" ? (pkg.match.teamA.name ?? "Team A") : (pkg.match.teamB.name ?? "Team B");
}

function teamEntityKeyFor(matchId: string, teamKey: TeamKey, options: TournamentPerformanceAdapterOptions): string {
  return options.teamEntityKeys?.[teamKey] ?? `observed-team:${matchId}:${teamKey}`;
}

function playerEntityKeyFor(steamId64: string, options: TournamentPerformanceAdapterOptions): string {
  return options.playerEntityKeys?.[steamId64] ?? `steam:${steamId64}`;
}

function emptyUtility(): TournamentPerformanceUtilityFact {
  return {
    flashesThrown: 0,
    enemyBlindSeconds: 0,
    teamBlindSeconds: 0,
    enemyBlindVictims: 0,
    flashAssists: 0,
    heThrows: 0,
    heDamage: 0,
    fireThrows: 0,
    fireDamage: 0,
    smokesThrown: 0,
    utilityKills: 0,
    utilityDamage: 0,
  };
}

function utilityFor(
  utilityByRoundPlayer: Map<string, ReturnType<typeof buildPlayerRoundUtilityFacts>[number]>,
  roundNumber: number,
  steamId64: string,
): TournamentPerformanceUtilityFact {
  const row = utilityByRoundPlayer.get(`${roundNumber}:${steamId64}`);
  return row ? {
    flashesThrown: row.flashesThrown,
    enemyBlindSeconds: row.enemyBlindSeconds,
    teamBlindSeconds: row.teamBlindSeconds,
    enemyBlindVictims: row.enemyBlindVictims,
    flashAssists: row.flashAssists,
    heThrows: row.heThrows,
    heDamage: row.heDamage,
    fireThrows: row.fireThrows,
    fireDamage: row.fireDamage,
    smokesThrown: row.smokesThrown,
    utilityKills: row.utilityKills,
    utilityDamage: row.utilityDamage,
  } : emptyUtility();
}

function mergeLabels(target: TournamentEntityLabels, source: TournamentEntityLabels): void {
  for (const kind of ["teams", "players"] as const) {
    if (!source[kind]) continue;
    const labels = target[kind] ?? (target[kind] = {});
    for (const [entityKey, label] of Object.entries(source[kind]!)) {
      if (labels[entityKey] == null || label.localeCompare(labels[entityKey]!) < 0) labels[entityKey] = label;
    }
  }
}

function observedLabels(matchId: string, pkg: DemoPackage, options: TournamentPerformanceAdapterOptions): TournamentEntityLabels {
  return {
    teams: Object.fromEntries(TEAM_KEYS.map((teamKey) => [teamEntityKeyFor(matchId, teamKey, options), teamNameFor(pkg, teamKey)])),
    players: Object.fromEntries(pkg.players.map((player) => [playerEntityKeyFor(player.steamId64, options), player.name])),
  };
}

function playerSteamId(player: DemoPackage["players"][number]): string {
  return player.steamId64;
}

function clutchOpponentCount(value: number): TournamentClutchOpponentCount {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error(`Invalid clutch opponent count ${value}`);
  return value as TournamentClutchOpponentCount;
}

function mapPlayerRounds(
  matchId: string,
  pkg: DemoPackage,
  options: TournamentPerformanceAdapterOptions,
): TournamentPerformancePlayerRoundFact[] {
  const utilityByRoundPlayer = new Map(buildPlayerRoundUtilityFacts(pkg).map((row) => [`${row.roundNumber}:${row.steamId64}`, row]));
  const clutchByRoundPlayer = new Map<string, DemoPackage["clutches"][number]>();
  for (const clutch of pkg.clutches) {
    const player = pkg.players[clutch.clutcherIndex];
    if (!player) continue;
    const key = `${clutch.roundNumber}:${playerSteamId(player)}`;
    if (!clutchByRoundPlayer.has(key)) clutchByRoundPlayer.set(key, clutch);
  }
  const rounds = new Map(pkg.rounds.map((row) => [row.roundNumber, row]));
  // Keep the per-round Core facts as the source for this DTO. playerStats is a
  // separate aggregate/#381 scoreboard projection and cannot be allocated back
  // to side-aware rounds without inventing facts.
  const coreFacts = buildPlayerRoundFacts(pkg);

  return coreFacts.map((row) => {
    const player = pkg.players.find((candidate) => playerSteamId(candidate) === row.steamId64);
    const round = rounds.get(row.roundNumber);
    if (!player || !round) throw new Error(`Cannot adapt player-round fact ${row.roundNumber}:${row.steamId64}`);
    const clutch = clutchByRoundPlayer.get(`${row.roundNumber}:${row.steamId64}`);
    return {
      roundSeq: row.roundNumber,
      playerEntityKey: playerEntityKeyFor(row.steamId64, options),
      teamEntityKey: teamEntityKeyFor(matchId, row.teamKey, options),
      side: row.side,
      teamWonRound: round.winnerTeamKey === row.teamKey,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      damage: row.damage,
      headshots: pkg.kills.filter((kill) => kill.roundNumber === row.roundNumber && kill.killerIndex === pkg.players.indexOf(player) && kill.headshot).length,
      survived: row.survived,
      kast: row.kastTags.length > 0,
      tradeKills: row.tradeKills,
      tradedDeaths: row.tradedDeaths,
      openingDuel: row.openingDuel,
      clutch: clutch ? { opponentCount: clutchOpponentCount(clutch.opponentCount), won: clutch.won } : null,
      utility: utilityFor(utilityByRoundPlayer, row.roundNumber, row.steamId64),
    };
  });
}

/**
 * Adapt the existing Core single-map facts into the public tournament frozen
 * sufficient-fact contract. No detection is reimplemented here: opening,
 * trade, KAST, damage, utility and weapon values come from Core outputs or
 * the already validated package event projection.
 */
export function extractTournamentPerformanceMapFacts(
  input: SeasonInsightsDemo,
  options: TournamentPerformanceAdapterOptions = {},
): TournamentPerformanceMapFacts {
  const { pkg } = input;
  const teamEntityKeys = {
    teamA: teamEntityKeyFor(input.matchId, "teamA", options),
    teamB: teamEntityKeyFor(input.matchId, "teamB", options),
  } as const;
  const indexToPlayerKey = new Map(pkg.players.map((player, index) => [index, playerEntityKeyFor(playerSteamId(player), options)]));
  const indexToTeamKey = new Map(pkg.players.map((player, index) => [index, teamEntityKeys[player.teamKey]]));
  const rounds = new Map(pkg.rounds.map((row) => [row.roundNumber, row]));
  const objectives: TournamentPerformanceMapFacts["objectives"] = pkg.bombs
    .filter((bomb) => bomb.type === "planted" || bomb.type === "defused")
    .map((bomb) => {
      const player = bomb.actorIndex == null ? null : pkg.players[bomb.actorIndex];
      const round = rounds.get(bomb.roundNumber);
      const type = bomb.type === "planted" ? "planted" : "defused";
      return {
        roundSeq: bomb.roundNumber,
        type,
        playerEntityKey: player ? indexToPlayerKey.get(bomb.actorIndex!) ?? null : null,
        teamEntityKey: player ? indexToTeamKey.get(bomb.actorIndex!) ?? null : null,
        side: player && round ? (player.teamKey === "teamA" ? round.teamASide : round.teamBSide) : null,
        teamWonRound: player && round ? round.winnerTeamKey === player.teamKey : null,
      };
    });
  const playerWeapons = derivePlayerWeaponHighlights(pkg).flatMap((player) => {
    const packagePlayer = pkg.players.find((candidate) => playerSteamId(candidate) === player.steamId64);
    if (!packagePlayer) return [];
    return player.weapons.map((weapon) => ({
      playerEntityKey: playerEntityKeyFor(player.steamId64, options),
      teamEntityKey: teamEntityKeys[packagePlayer.teamKey],
      weapon: weapon.weapon,
      kills: weapon.kills,
      headshotKills: weapon.headshotKills,
    }));
  });

  return {
    semanticProfile: SEMANTIC_PROFILE,
    analysisVersion: ANALYSIS_VERSION,
    mapKey: `legacy-map:${input.matchId}:${pkg.match.mapName}`,
    matchKey: input.matchId,
    mapName: pkg.match.mapName,
    teamEntityKeys,
    playerRounds: mapPlayerRounds(input.matchId, pkg, options),
    objectives,
    playerWeapons,
  };
}

export function buildTournamentPerformanceAnalyticsFromDemos(
  demos: SeasonInsightsDemo[],
  options: TournamentPerformanceAdapterOptions = {},
): TournamentPerformanceAnalytics {
  const labels: TournamentEntityLabels = {};
  const mapFacts = demos.map((demo) => {
    const facts = extractTournamentPerformanceMapFacts(demo, options);
    mergeLabels(labels, observedLabels(demo.matchId, demo.pkg, options));
    return facts;
  });
  mergeLabels(labels, options.labels ?? {});
  return buildTournamentPerformanceAnalytics(mapFacts, { labels });
}
