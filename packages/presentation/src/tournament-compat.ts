import type { DemoPackage, TeamKey } from "@cs2dak/contract";
import {
  aggregatePlayerRoundPerformanceFacts,
  assertPlayerStatsParity,
  buildPlayerRoundPerformanceFacts,
  CORE_ANALYSIS_VERSION,
  CORE_SEMANTIC_PROFILE,
  type PlayerRoundManStateFact,
} from "@cs2dak/core";
import {
  buildTournamentAnalytics,
  type TournamentEconomyType,
  type TournamentEntityLabels,
  type TournamentManAdvantage,
  type TournamentMapFacts,
  type TournamentTeamConversionCount,
  type TournamentTeamMapCount,
  type WinLossCount,
} from "@cs2dak/tournament";
import { round } from "./season-metrics.js";
import { displayWeaponName } from "./weapons.js";
import type { SeasonInsightsDemo } from "./insights.js";

// ── Tournament Dashboard legacy view model ─────────────────────────────────

export interface TournamentMapStat {
  mapName: string;
  matches: number;
  tWinRatePercent: number;
  ctWinRatePercent: number;
  pistolTWinRatePercent: number | null;
}

export interface TournamentWeaponStat {
  weapon: string;
  label: string;
  kills: number;
  headshotPercent: number | null;
  topPlayerName: string | null;
  topPlayerKills: number;
}

export interface TournamentTeamPistolStat {
  teamName: string;
  pistolRounds: number;
  pistolWins: number;
  winRatePercent: number | null;
  conversionRounds: number;
  conversionWins: number;
  conversionPercent: number | null;
  /** 反转换机会数：对手赢下手枪局且存在下一回合的次数。 */
  breakRounds: number;
  /** 反转换：对手赢手枪局后，该队赢了下一回合的次数。 */
  breakWins: number;
  breakRatePercent: number | null;
}

/**
 * 经济对位胜率（按高低经济重排，跨场聚合时 A/B 队伍无意义）。
 * 手枪局不入矩阵（见手枪局表）；同档对局对称，lowWinRatePercent 为 null。
 */
export interface TournamentEconomyMatrixCell {
  lowEconomy: string;
  highEconomy: string;
  rounds: number;
  /** 低经济方获胜的原始次数；供非展示 consumer 重建比例。 */
  lowEconomyWins: number;
  lowWinRatePercent: number | null;
}

export interface TournamentEcoUpsetStat {
  teamName: string;
  opportunities: number;
  wins: number;
  winRatePercent: number | null;
}

export interface TournamentManAdvantageStat {
  advantageAlive: number;
  disadvantageAlive: number;
  advantageLabel: string;
  disadvantageLabel: string;
  opportunities: number;
  advantageWins: number;
  advantageConversionPercent: number | null;
  disadvantageWins: number;
  disadvantageConversionPercent: number | null;
}

export interface TournamentTeamManAdvantageState {
  advantageAlive: number;
  disadvantageAlive: number;
  advantageLabel: string;
  disadvantageLabel: string;
  advantageOpportunities: number;
  advantageWins: number;
  advantageConversionPercent: number | null;
  disadvantageOpportunities: number;
  disadvantageWins: number;
  disadvantageConversionPercent: number | null;
}

export interface TournamentTeamManAdvantageStat {
  teamName: string;
  states: TournamentTeamManAdvantageState[];
}

export interface TournamentTeamEconomySummary {
  teamName: string;
  maps: number;
  rounds: number;
  roundWins: number;
  roundWinPercent: number | null;
  pistol: {
    rounds: number;
    wins: number;
    winRatePercent: number | null;
  };
  round2: {
    conversionRounds: number;
    conversionWins: number;
    conversionPercent: number | null;
    breakRounds: number;
    breakWins: number;
    breakRatePercent: number | null;
  };
  manAdvantage: TournamentTeamManAdvantageStat;
  smallBuyUpset: {
    opportunities: number;
    wins: number;
    winRatePercent: number | null;
  };
}

export interface TournamentInsights {
  matchCount: number;
  roundCount: number;
  maps: TournamentMapStat[];
  weaponKills: TournamentWeaponStat[];
  teamPistols: TournamentTeamPistolStat[];
  economyMatrix: TournamentEconomyMatrixCell[];
  ecoUpsets: TournamentEcoUpsetStat[];
  manAdvantageConversions: TournamentManAdvantageStat[];
  teamManAdvantageConversions: TournamentTeamManAdvantageStat[];
  teamEconomySummaries: TournamentTeamEconomySummary[];
  /** 全部回合的 T / CT 胜率（0-100）。 */
  tWinRatePercent: number;
  ctWinRatePercent: number;
  /** 手枪局赢家把下一回合也拿下的比率。 */
  pistolConversionPercent: number | null;
}

/**
 * Studio 旧 derived-cache 中保存的单图原始事实。新代码只在这里把它
 * 适配为 frozen sufficient facts；跨图 merge 由 @cs2dak/tournament 负责。
 */
export interface TournamentFacts {
  matchId: string;
  mapName: string;
  teams: Record<TeamKey, string>;
  players: Array<{ steamId64: string; name: string; teamKey: TeamKey }>;
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

function teamNameForTournament(pkg: DemoPackage, teamKey: TeamKey): string {
  return teamKey === "teamA" ? (pkg.match.teamA.name ?? "Team A") : (pkg.match.teamB.name ?? "Team B");
}

export function extractTournamentFacts(
  input: SeasonInsightsDemo,
  suppliedPerformanceFacts?: ReturnType<typeof buildPlayerRoundPerformanceFacts>,
): TournamentFacts {
  const { pkg } = input;
  const performanceFacts = suppliedPerformanceFacts ?? input.performanceFacts ?? buildPlayerRoundPerformanceFacts(pkg);
  assertPlayerStatsParity(pkg, performanceFacts);
  const performanceBySteamId = aggregatePlayerRoundPerformanceFacts(performanceFacts);
  return {
    matchId: input.matchId,
    mapName: pkg.match.mapName,
    teams: {
      teamA: teamNameForTournament(pkg, "teamA"),
      teamB: teamNameForTournament(pkg, "teamB")
    },
    players: pkg.players.map((player) => ({
      steamId64: player.steamId64,
      name: player.name,
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

function roundSides(roundRow: TournamentFacts["rounds"][number]): Record<TeamKey, "t" | "ct"> {
  if (roundRow.teamASide && roundRow.teamBSide) {
    return { teamA: roundRow.teamASide, teamB: roundRow.teamBSide };
  }
  const tTeam = roundRow.winnerSide === "t" ? roundRow.winnerTeamKey : otherTeam(roundRow.winnerTeamKey);
  return { teamA: tTeam === "teamA" ? "t" : "ct", teamB: tTeam === "teamB" ? "t" : "ct" };
}

function addTeamRound(
  teamMaps: Record<TeamKey, TournamentTeamMapCount>,
  row: TournamentFacts["rounds"][number],
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
  facts: TournamentFacts,
  row: TournamentFacts["rounds"][number],
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

function toTournamentMapFacts(facts: TournamentFacts): { facts: TournamentMapFacts; labels: TournamentEntityLabels } {
  const orderedRounds = [...facts.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const teamEntityKeys = {
    teamA: `legacy-team:${facts.teams.teamA}`,
    teamB: `legacy-team:${facts.teams.teamB}`,
  } as const;
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
      playerEntityKey: `steam:${weapon.playerSteamId64}`,
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
    facts: {
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
    },
    labels: {
      teams: {
        [teamEntityKeys.teamA]: facts.teams.teamA,
        [teamEntityKeys.teamB]: facts.teams.teamB,
      },
      players: Object.fromEntries(facts.players.map((player) => [`steam:${player.steamId64}`, player.name])),
    },
  };
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

function percent(value: number | null): number | null {
  return value == null ? null : round(value * 100, 1);
}

function teamManAdvantageState(
  advantage: TournamentMapFacts["teamConversions"]["teamA"]["manAdvantage"]["5v4"],
  disadvantage: TournamentMapFacts["teamConversions"]["teamA"]["manAdvantage"]["4v5"],
  advantageAlive: number,
  disadvantageAlive: number,
): TournamentTeamManAdvantageState {
  return {
    advantageAlive,
    disadvantageAlive,
    advantageLabel: `${advantageAlive}v${disadvantageAlive}`,
    disadvantageLabel: `${disadvantageAlive}v${advantageAlive}`,
    advantageOpportunities: advantage.opportunities,
    advantageWins: advantage.wins,
    advantageConversionPercent: percent(advantage.opportunities > 0 ? advantage.wins / advantage.opportunities : null),
    disadvantageOpportunities: disadvantage.opportunities,
    disadvantageWins: disadvantage.wins,
    disadvantageConversionPercent: percent(disadvantage.opportunities > 0 ? disadvantage.wins / disadvantage.opportunities : null),
  };
}

function legacyManAdvantageRows(analytics: ReturnType<typeof buildTournamentAnalytics>): TournamentManAdvantageStat[] {
  return ([
    ["5v4", 5, 4],
    ["5v3", 5, 3],
  ] as const).filter(([key]) => analytics.totals.manAdvantage[key].opportunities > 0).map(([key, advantageAlive, disadvantageAlive]) => {
    const advantage = analytics.totals.manAdvantage[key];
    const disadvantage = analytics.totals.manAdvantage[`${disadvantageAlive}v${advantageAlive}` as TournamentManAdvantage];
    return {
      advantageAlive,
      disadvantageAlive,
      advantageLabel: `${advantageAlive}v${disadvantageAlive}`,
      disadvantageLabel: `${disadvantageAlive}v${advantageAlive}`,
      opportunities: advantage.opportunities,
      advantageWins: advantage.wins,
      advantageConversionPercent: percent(advantage.rate),
      disadvantageWins: disadvantage.wins,
      disadvantageConversionPercent: percent(disadvantage.rate),
    };
  });
}

function legacyTeamManAdvantage(teamName: string, analyticsTeam: ReturnType<typeof buildTournamentAnalytics>["teams"][number]): TournamentTeamManAdvantageStat {
  const states: TournamentTeamManAdvantageState[] = [];
  const state54 = teamManAdvantageState(analyticsTeam.manAdvantage["5v4"], analyticsTeam.manAdvantage["4v5"], 5, 4);
  const state53 = teamManAdvantageState(analyticsTeam.manAdvantage["5v3"], analyticsTeam.manAdvantage["3v5"], 5, 3);
  if (state54.advantageOpportunities > 0 || state54.disadvantageOpportunities > 0) states.push(state54);
  if (state53.advantageOpportunities > 0 || state53.disadvantageOpportunities > 0) states.push(state53);
  return { teamName, states };
}

function buildLegacyInsights(analytics: ReturnType<typeof buildTournamentAnalytics>): TournamentInsights {
  const maps = analytics.maps.map((map) => ({
    mapName: map.mapName,
    matches: map.mapCount,
    tWinRatePercent: percent(map.t.rate) ?? 0,
    ctWinRatePercent: percent(map.ct.rate) ?? 0,
    pistolTWinRatePercent: percent(map.pistolT.rate),
  }));
  const teamPistols = analytics.teams
    .filter((team) => team.pistol.opportunities > 0)
    .map((team) => ({
      teamName: team.team.displayName,
      pistolRounds: team.pistol.opportunities,
      pistolWins: team.pistol.wins,
      winRatePercent: percent(team.pistol.rate),
      conversionRounds: team.round2.conversion.opportunities,
      conversionWins: team.round2.conversion.wins,
      conversionPercent: percent(team.round2.conversion.rate),
      breakRounds: team.round2.break.opportunities,
      breakWins: team.round2.break.wins,
      breakRatePercent: percent(team.round2.break.rate),
    }))
    .sort((a, b) => b.pistolWins - a.pistolWins || a.teamName.localeCompare(b.teamName));
  const economyMatrix = analytics.economyMatrix
    .map((cell) => ({
      lowEconomy: cell.lowEconomy,
      highEconomy: cell.highEconomy,
      rounds: cell.rounds,
      lowEconomyWins: cell.lowEconomyWins,
      lowWinRatePercent: percent(cell.lowWinRate),
    }))
    .sort((a, b) => b.rounds - a.rounds || a.lowEconomy.localeCompare(b.lowEconomy) || a.highEconomy.localeCompare(b.highEconomy));
  const ecoUpsets = analytics.teams
    .map((team) => ({
      teamName: team.team.displayName,
      opportunities: team.ecoSemiUpset.opportunities,
      wins: team.ecoSemiUpset.wins,
      winRatePercent: percent(team.ecoSemiUpset.rate),
    }))
    .filter((row) => row.opportunities > 0)
    .sort((a, b) => b.wins - a.wins || b.opportunities - a.opportunities || a.teamName.localeCompare(b.teamName));
  const teamManAdvantageConversions = analytics.teams
    .map((team) => legacyTeamManAdvantage(team.team.displayName, team))
    .filter((team) => team.states.length > 0)
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
  const teamEconomySummaries = analytics.teams
    .map((team) => ({
      teamName: team.team.displayName,
      maps: team.mapCount,
      rounds: team.rounds,
      roundWins: team.roundWins,
      roundWinPercent: percent(team.roundWinRate),
      pistol: {
        rounds: team.pistol.opportunities,
        wins: team.pistol.wins,
        winRatePercent: percent(team.pistol.rate),
      },
      round2: {
        conversionRounds: team.round2.conversion.opportunities,
        conversionWins: team.round2.conversion.wins,
        conversionPercent: percent(team.round2.conversion.rate),
        breakRounds: team.round2.break.opportunities,
        breakWins: team.round2.break.wins,
        breakRatePercent: percent(team.round2.break.rate),
      },
      manAdvantage: legacyTeamManAdvantage(team.team.displayName, team),
      smallBuyUpset: {
        opportunities: team.ecoSemiUpset.opportunities,
        wins: team.ecoSemiUpset.wins,
        winRatePercent: percent(team.ecoSemiUpset.rate),
      },
    }))
    .sort((a, b) => (b.roundWinPercent ?? -1) - (a.roundWinPercent ?? -1) || a.teamName.localeCompare(b.teamName));
  const weaponKills = analytics.weapons.slice(0, 10).map((weapon) => ({
    weapon: weapon.weapon,
    label: displayWeaponName(weapon.weapon),
    kills: weapon.kills,
    headshotPercent: percent(weapon.headshotRate),
    topPlayerName: weapon.topPlayer?.displayName ?? null,
    topPlayerKills: weapon.topPlayer?.kills ?? 0,
  }));
  return {
    matchCount: analytics.totals.mapCount,
    roundCount: analytics.totals.roundCount,
    maps,
    weaponKills,
    teamPistols,
    economyMatrix,
    ecoUpsets,
    manAdvantageConversions: legacyManAdvantageRows(analytics),
    teamManAdvantageConversions,
    teamEconomySummaries,
    tWinRatePercent: percent(analytics.totals.t.rate) ?? 0,
    ctWinRatePercent: percent(analytics.totals.ct.rate) ?? 0,
    pistolConversionPercent: percent(analytics.totals.round2Conversion.rate),
  };
}

export function buildTournamentInsightsFromFacts(demos: TournamentFacts[]): TournamentInsights {
  const labels: TournamentEntityLabels = {};
  const mapFacts = demos.map((demo) => {
    const adapted = toTournamentMapFacts(demo);
    mergeLabels(labels, adapted.labels);
    return adapted.facts;
  });
  return buildLegacyInsights(buildTournamentAnalytics(mapFacts, { labels }));
}

export function buildTournamentInsights(demos: SeasonInsightsDemo[]): TournamentInsights {
  return buildTournamentInsightsFromFacts(demos.map((demo) => extractTournamentFacts(demo)));
}
