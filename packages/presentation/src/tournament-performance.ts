import {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  type PlayerRoundPerformanceFacts,
} from "@cs2dak/core";
import type { DemoPackage, TeamKey } from "@cs2dak/contract";
import {
  buildTournamentPerformanceAnalytics,
  type TournamentClutchOpponentCount,
  type TournamentEntityLabels,
  type TournamentPerformanceAnalytics,
  type TournamentPerformanceMapFacts,
  type TournamentPerformancePlayerRoundFact,
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
  performanceFacts: PlayerRoundPerformanceFacts,
): TournamentPerformancePlayerRoundFact[] {
  const roundSeq = new Map(pkg.rounds.map((row, index) => [row.roundNumber, index + 1]));

  return performanceFacts.playerRounds.map((row) => {
    const round = roundSeq.get(row.roundNumber);
    if (round == null) throw new Error(`Cannot adapt player-round fact ${row.roundNumber}:${row.steamId64}`);
    const { grenadesThrown: _grenadesThrown, ...utility } = row.utility;
    return {
      roundSeq: round,
      playerEntityKey: playerEntityKeyFor(row.steamId64, options),
      teamEntityKey: teamEntityKeyFor(matchId, row.teamKey, options),
      side: row.side,
      teamWonRound: row.teamWonRound,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      damage: row.damage,
      headshots: row.headshots,
      survived: row.survived,
      kast: row.kast,
      tradeKills: row.tradeKills,
      tradedDeaths: row.tradedDeaths,
      openingDuel: row.openingDuel,
      clutch: row.clutch ? { opponentCount: clutchOpponentCount(row.clutch.opponentCount), won: row.clutch.won } : null,
      utility,
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
  const performanceFacts = input.performanceFacts ?? buildPlayerRoundPerformanceFacts(pkg);
  const performanceBySteamId = aggregatePlayerRoundPerformanceFacts(performanceFacts);
  const teamEntityKeys = {
    teamA: teamEntityKeyFor(input.matchId, "teamA", options),
    teamB: teamEntityKeyFor(input.matchId, "teamB", options),
  } as const;
  const indexToPlayerKey = new Map(pkg.players.map((player, index) => [index, playerEntityKeyFor(playerSteamId(player), options)]));
  const indexToTeamKey = new Map(pkg.players.map((player, index) => [index, teamEntityKeys[player.teamKey]]));
  const rounds = new Map(pkg.rounds.map((row) => [row.roundNumber, row]));
  const roundSeq = new Map(pkg.rounds.map((row, index) => [row.roundNumber, index + 1]));
  const objectives: TournamentPerformanceMapFacts["objectives"] = pkg.bombs
    .filter((bomb) => bomb.type === "planted" || bomb.type === "defused")
    .map((bomb) => {
      const player = bomb.actorIndex == null ? null : pkg.players[bomb.actorIndex];
      const round = rounds.get(bomb.roundNumber);
      const type = bomb.type === "planted" ? "planted" : "defused";
      return {
        roundSeq: roundSeq.get(bomb.roundNumber) ?? bomb.roundNumber,
        type,
        playerEntityKey: player ? indexToPlayerKey.get(bomb.actorIndex!) ?? null : null,
        teamEntityKey: player ? indexToTeamKey.get(bomb.actorIndex!) ?? null : null,
        side: player && round ? (player.teamKey === "teamA" ? round.teamASide : round.teamBSide) : null,
        teamWonRound: player && round ? round.winnerTeamKey === player.teamKey : null,
      };
    });
  const playerWeapons = pkg.players.flatMap((packagePlayer) => {
    const summary = performanceBySteamId.get(packagePlayer.steamId64);
    return (summary?.weapons ?? []).map((weapon) => ({
      playerEntityKey: playerEntityKeyFor(packagePlayer.steamId64, options),
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
    playerRounds: mapPlayerRounds(input.matchId, pkg, options, performanceFacts),
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
