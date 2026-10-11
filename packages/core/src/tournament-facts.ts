/** Product-neutral frozen Tournament projection. Display labels never determine identity. */
import type { DemoPackage, TeamKey } from "@cs2dak/contract";
import type {
  TournamentClutchOpponentCount, TournamentEconomyType, TournamentManAdvantage,
  TournamentMapFacts, TournamentTeamConversionCount, TournamentTeamMapCount,
  TournamentPerformanceMapFacts, TournamentPerformancePlayerRoundFact, WinLossCount,
} from "@cs2dak/tournament";
import {
  aggregatePlayerRoundPerformanceFacts, buildPlayerRoundPerformanceFacts,
  type PlayerRoundManStateFact, type PlayerRoundPerformanceFacts,
} from "./performance-facts.js";
import { assertPlayerStatsParity } from "./performance-parity.js";
import { CORE_ANALYSIS_VERSION, CORE_SEMANTIC_PROFILE } from "./version.js";

export interface TournamentIdentity {
  teamEntityKeys: Record<TeamKey, string>;
  playerEntityKeys: Record<string, string>;
}
export interface TournamentMapInput {
  matchId: string;
  pkg: DemoPackage;
  performanceFacts?: PlayerRoundPerformanceFacts;
}
function stableKey(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}
export function assertTournamentIdentity(identity: TournamentIdentity, players: readonly { steamId64: string }[]): void {
  if (!identity || !stableKey(identity.teamEntityKeys?.teamA) || !stableKey(identity.teamEntityKeys?.teamB)) {
    throw new Error("Tournament facts require explicit stable team IDs; legacy facts must be rebuilt");
  }
  if (identity.teamEntityKeys.teamA === identity.teamEntityKeys.teamB) throw new Error("Tournament stable teamA and teamB must differ");
  for (const player of players) {
    if (!stableKey(player.steamId64) || !stableKey(identity.playerEntityKeys?.[player.steamId64])) {
      throw new Error("Tournament facts require an explicit stable player ID for every observed Steam64");
    }
  }
}
/** Explicit observation identity for unbound local Demos; never claims cross-map team identity. */
export function observedTournamentIdentity(matchId: string, players: readonly { steamId64: string }[]): TournamentIdentity {
  if (!stableKey(matchId)) throw new Error("Tournament observation requires a stable match ID");
  const identity = {
    teamEntityKeys: { teamA: `observed-team:${matchId}:teamA`, teamB: `observed-team:${matchId}:teamB` },
    playerEntityKeys: Object.fromEntries(players.map(player => [player.steamId64, `steam:${player.steamId64}`])),
  };
  assertTournamentIdentity(identity, players);
  return identity;
}

export interface TournamentSourceFacts extends TournamentIdentity {
  matchId: string;
  mapName: string;
  players: Array<{ steamId64: string; teamKey: TeamKey }>;
  kills: Array<{
    roundNumber: number;
    tick: number;
    killerSteamId64: string | null;
    victimSteamId64: string;
    weapon: string;
    headshot: boolean;
  }>;
  /** Core-owned weapon aggregates; raw kills are retained as event facts. */
  playerWeapons?: Array<{
    playerSteamId64: string;
    weapon: string;
    kills: number;
    headshotKills: number;
  }>;
  rounds: Array<{
    roundNumber: number;
    winnerSide: "t" | "ct";
    winnerTeamKey: TeamKey;
    teamAEconomy: string;
    teamBEconomy: string;
    teamASide?: "t" | "ct";
    teamBSide?: "t" | "ct";
    freezeEndTick?: number;
    endTick?: number;
  }>;
  /** Core-owned ordered manpower state facts; absent only for old hand-built fixtures. */
  manState?: PlayerRoundManStateFact[];
}

const ECONOMY_RANK: Record<string, number> = { eco: 0, semi: 1, force: 2, full: 3 };
const MAN_ADVANTAGE_KEYS = ["5v4", "4v5", "5v3", "3v5"] as const satisfies readonly TournamentManAdvantage[];

export function extractTournamentSourceFacts(
  input: TournamentMapInput,
  identity: TournamentIdentity,
  suppliedPerformanceFacts?: ReturnType<typeof buildPlayerRoundPerformanceFacts>,
): TournamentSourceFacts {
  const { pkg } = input;
  assertTournamentIdentity(identity, pkg.players);
  const performanceFacts = suppliedPerformanceFacts ?? input.performanceFacts ?? buildPlayerRoundPerformanceFacts(pkg);
  assertPlayerStatsParity(pkg, performanceFacts);
  const performanceBySteamId = aggregatePlayerRoundPerformanceFacts(performanceFacts);
  return {
    teamEntityKeys: { ...identity.teamEntityKeys },
    playerEntityKeys: { ...identity.playerEntityKeys },
    matchId: input.matchId,
    mapName: pkg.match.mapName,
    players: pkg.players.map((player) => ({
      steamId64: player.steamId64,
      teamKey: player.teamKey
    })),
    kills: pkg.kills.map((kill) => ({
      roundNumber: kill.roundNumber,
      tick: kill.tick,
      killerSteamId64: kill.killerIndex != null ? (pkg.players[kill.killerIndex]?.steamId64 ?? null) : null,
      victimSteamId64: pkg.players[kill.victimIndex]?.steamId64 ?? "",
      weapon: kill.weapon || "unknown",
      headshot: kill.headshot
    })).filter((kill) => kill.victimSteamId64 !== ""),
    playerWeapons: pkg.players.flatMap((player) => performanceBySteamId.get(player.steamId64)?.weapons.map((weapon) => ({
      playerSteamId64: player.steamId64,
      weapon: weapon.weapon,
      kills: weapon.kills,
      headshotKills: weapon.headshotKills,
    })) ?? []),
    rounds: pkg.rounds.map((roundRow) => ({
      roundNumber: roundRow.roundNumber,
      winnerSide: roundRow.winnerSide,
      winnerTeamKey: roundRow.winnerTeamKey,
      teamAEconomy: roundRow.teamAEconomy,
      teamBEconomy: roundRow.teamBEconomy,
      teamASide: roundRow.teamASide,
      teamBSide: roundRow.teamBSide,
      freezeEndTick: roundRow.freezeEndTick,
      endTick: roundRow.endTick,
    })),
    manState: performanceFacts.manState,
  };
}

function zeroCount(): WinLossCount {
  return { opportunities: 0, wins: 0 };
}

function zeroTeamMaps(): TournamentTeamMapCount {
  return { rounds: 0, roundWins: 0, tRounds: 0, tWins: 0, ctRounds: 0, ctWins: 0 };
}

function zeroTeamConversions(): TournamentTeamConversionCount {
  return {
    pistol: zeroCount(),
    round2: { conversion: zeroCount(), break: zeroCount() },
    ecoSemiUpset: zeroCount(),
    manAdvantage: Object.fromEntries(MAN_ADVANTAGE_KEYS.map((key) => [key, zeroCount()])) as Record<TournamentManAdvantage, WinLossCount>,
  };
}

function addCount(target: WinLossCount, won: boolean): void {
  target.opportunities += 1;
  if (won) target.wins += 1;
}

function otherTeam(teamKey: TeamKey): TeamKey {
  return teamKey === "teamA" ? "teamB" : "teamA";
}

function roundSides(roundRow: TournamentSourceFacts["rounds"][number]): Record<TeamKey, "t" | "ct"> {
  if (roundRow.teamASide && roundRow.teamBSide) {
    return { teamA: roundRow.teamASide, teamB: roundRow.teamBSide };
  }
  const tTeam = roundRow.winnerSide === "t" ? roundRow.winnerTeamKey : otherTeam(roundRow.winnerTeamKey);
  return { teamA: tTeam === "teamA" ? "t" : "ct", teamB: tTeam === "teamB" ? "t" : "ct" };
}

function addTeamRound(
  teamMaps: Record<TeamKey, TournamentTeamMapCount>,
  row: TournamentSourceFacts["rounds"][number],
): void {
  const sides = roundSides(row);
  for (const teamKey of ["teamA", "teamB"] as const) {
    const team = teamMaps[teamKey];
    team.rounds += 1;
    if (row.winnerTeamKey === teamKey) team.roundWins += 1;
    if (sides[teamKey] === "t") {
      team.tRounds += 1;
      if (row.winnerTeamKey === teamKey) team.tWins += 1;
    } else {
      team.ctRounds += 1;
      if (row.winnerTeamKey === teamKey) team.ctWins += 1;
    }
  }
}

function collectManAdvantage(
  teamConversions: Record<TeamKey, TournamentTeamConversionCount>,
  facts: TournamentSourceFacts,
  row: TournamentSourceFacts["rounds"][number],
): void {
  const seen = new Set<string>();
  for (const state of (facts.manState ?? [])
    .filter((candidate) => candidate.roundNumber === row.roundNumber)
    .sort((a, b) => a.tick - b.tick)) {
    if (state.advantageTeamKey == null) continue;
    const advantageAlive = state.advantageAlive;
    const disadvantageAlive = state.disadvantageAlive;
    const key = `${advantageAlive}v${disadvantageAlive}` as TournamentManAdvantage;
    if (!MAN_ADVANTAGE_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    const advantageTeam = state.advantageTeamKey;
    const disadvantageTeam = otherTeam(advantageTeam);
    addCount(teamConversions[advantageTeam].manAdvantage[key], row.winnerTeamKey === advantageTeam);
    const disadvantageKey = `${disadvantageAlive}v${advantageAlive}` as TournamentManAdvantage;
    addCount(teamConversions[disadvantageTeam].manAdvantage[disadvantageKey], row.winnerTeamKey === disadvantageTeam);
  }
}

export function projectTournamentMapFacts(facts: TournamentSourceFacts): TournamentMapFacts {
  assertTournamentIdentity(facts, facts.players);
  const orderedRounds = [...facts.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const teamEntityKeys = facts.teamEntityKeys;
  const teamMaps = { teamA: zeroTeamMaps(), teamB: zeroTeamMaps() };
  const teamConversions = { teamA: zeroTeamConversions(), teamB: zeroTeamConversions() };
  const pistolSides = { t: zeroCount(), ct: zeroCount() };
  const economyMatrix = new Map<string, { lowEconomy: TournamentEconomyType; highEconomy: TournamentEconomyType; rounds: number; lowEconomyWins: number }>();

  for (let index = 0; index < orderedRounds.length; index += 1) {
    const row = orderedRounds[index]!;
    addTeamRound(teamMaps, row);
    const next = orderedRounds[index + 1];
    const isPistolEconomy = row.teamAEconomy === "pistol" || row.teamBEconomy === "pistol";
    const isPistol = row.roundNumber === 1 || row.roundNumber === 13 || isPistolEconomy;
    if (isPistolEconomy) {
      addCount(pistolSides.t, row.winnerSide === "t");
      addCount(pistolSides.ct, row.winnerSide === "ct");
    }
    if (isPistol) {
      addCount(teamConversions.teamA.pistol, row.winnerTeamKey === "teamA");
      addCount(teamConversions.teamB.pistol, row.winnerTeamKey === "teamB");
      if (next) {
        addCount(teamConversions[row.winnerTeamKey].round2.conversion, next.winnerTeamKey === row.winnerTeamKey);
        const loserTeamKey = otherTeam(row.winnerTeamKey);
        addCount(teamConversions[loserTeamKey].round2.break, next.winnerTeamKey === loserTeamKey);
      }
    }

    const rankA = ECONOMY_RANK[row.teamAEconomy];
    const rankB = ECONOMY_RANK[row.teamBEconomy];
    if (rankA != null && rankB != null) {
      const lowIsA = rankA <= rankB;
      const lowEconomy = (lowIsA ? row.teamAEconomy : row.teamBEconomy) as TournamentEconomyType;
      const highEconomy = (lowIsA ? row.teamBEconomy : row.teamAEconomy) as TournamentEconomyType;
      const key = `${lowEconomy}:${highEconomy}`;
      const cell = economyMatrix.get(key) ?? { lowEconomy, highEconomy, rounds: 0, lowEconomyWins: 0 };
      cell.rounds += 1;
      if (row.winnerTeamKey === (lowIsA ? "teamA" : "teamB")) cell.lowEconomyWins += 1;
      economyMatrix.set(key, cell);
    }

    const aWeak = row.teamAEconomy === "eco" || row.teamAEconomy === "semi";
    const bWeak = row.teamBEconomy === "eco" || row.teamBEconomy === "semi";
    if (aWeak && row.teamBEconomy === "full") addCount(teamConversions.teamA.ecoSemiUpset, row.winnerTeamKey === "teamA");
    if (bWeak && row.teamAEconomy === "full") addCount(teamConversions.teamB.ecoSemiUpset, row.winnerTeamKey === "teamB");

    collectManAdvantage(teamConversions, facts, row);
  }

  const playerTeamKeys = new Map(facts.players.map((player) => [player.steamId64, teamEntityKeys[player.teamKey]]));
  const playerWeapons = new Map<string, {
    playerEntityKey: string;
    teamEntityKey: string;
    weapon: string;
    kills: number;
    headshotKills: number;
  }>();
  for (const weapon of facts.playerWeapons ?? []) {
    const teamEntityKey = playerTeamKeys.get(weapon.playerSteamId64);
    if (!teamEntityKey) continue;
    const key = `${weapon.playerSteamId64}:${weapon.weapon}`;
    const cell = playerWeapons.get(key) ?? {
      playerEntityKey: facts.playerEntityKeys[weapon.playerSteamId64]!,
      teamEntityKey,
      weapon: weapon.weapon,
      kills: 0,
      headshotKills: 0,
    };
    cell.kills += weapon.kills;
    cell.headshotKills += weapon.headshotKills;
    playerWeapons.set(key, cell);
  }

  return {
    semanticProfile: CORE_SEMANTIC_PROFILE,
    analysisVersion: CORE_ANALYSIS_VERSION,
    mapKey: `legacy-map:${facts.matchId}:${facts.mapName}`,
    matchKey: facts.matchId,
    mapName: facts.mapName,
    teamEntityKeys,
    teamMaps,
    teamConversions,
    economyMatrix: [...economyMatrix.values()],
    pistolSides,
    playerWeapons: [...playerWeapons.values()],
  };
}

function clutchOpponentCount(value: number): TournamentClutchOpponentCount {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error(`Invalid clutch opponent count ${value}`);
  return value as TournamentClutchOpponentCount;
}

function mapPlayerRounds(
  pkg: DemoPackage,
  identity: TournamentIdentity,
  performanceFacts: PlayerRoundPerformanceFacts,
): TournamentPerformancePlayerRoundFact[] {
  const roundSeq = new Map(pkg.rounds.map((row, index) => [row.roundNumber, index + 1]));

  return performanceFacts.playerRounds.map((row) => {
    const round = roundSeq.get(row.roundNumber);
    if (round == null) throw new Error(`Cannot adapt player-round fact ${row.roundNumber}:${row.steamId64}`);
    const { grenadesThrown: _grenadesThrown, ...utility } = row.utility;
    return {
      roundSeq: round,
      playerEntityKey: identity.playerEntityKeys[row.steamId64]!,
      teamEntityKey: identity.teamEntityKeys[row.teamKey],
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
export function projectTournamentPerformanceMapFacts(
  input: TournamentMapInput,
  identity: TournamentIdentity,
): TournamentPerformanceMapFacts {
  const { pkg } = input;
  assertTournamentIdentity(identity, pkg.players);
  const performanceFacts = input.performanceFacts ?? buildPlayerRoundPerformanceFacts(pkg);
  assertPlayerStatsParity(pkg, performanceFacts);
  const performanceBySteamId = aggregatePlayerRoundPerformanceFacts(performanceFacts);
  const teamEntityKeys = {
    teamA: identity.teamEntityKeys.teamA,
    teamB: identity.teamEntityKeys.teamB,
  } as const;
  const indexToPlayerKey = new Map(pkg.players.map((player, index) => [index, identity.playerEntityKeys[player.steamId64]!]));
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
      playerEntityKey: identity.playerEntityKeys[packagePlayer.steamId64]!,
      teamEntityKey: teamEntityKeys[packagePlayer.teamKey],
      weapon: weapon.weapon,
      kills: weapon.kills,
      headshotKills: weapon.headshotKills,
    }));
  });

  return {
    semanticProfile: CORE_SEMANTIC_PROFILE,
    analysisVersion: CORE_ANALYSIS_VERSION,
    mapKey: `legacy-map:${input.matchId}:${pkg.match.mapName}`,
    matchKey: input.matchId,
    mapName: pkg.match.mapName,
    teamEntityKeys,
    playerRounds: mapPlayerRounds(pkg, identity, performanceFacts),
    objectives,
    playerWeapons,
  };
}

