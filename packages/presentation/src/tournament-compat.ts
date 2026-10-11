import type { TeamKey } from "@cs2dak/contract";
import {
  buildPlayerRoundPerformanceFacts, extractTournamentSourceFacts, projectTournamentMapFacts,
  observedTournamentIdentity, type TournamentIdentity, type TournamentSourceFacts,
} from "@cs2dak/core";
import {
  buildTournamentAnalytics,
  type TournamentEntityLabels,
  type TournamentMapFacts,
  type TournamentManAdvantage,
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
  teamEntityKey: string;
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
  teamEntityKey: string;
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
  teamEntityKey: string;
  teamName: string;
  states: TournamentTeamManAdvantageState[];
}

export interface TournamentTeamEconomySummary {
  teamEntityKey: string;
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
export interface TournamentFacts extends TournamentSourceFacts {
  teams: Record<TeamKey, string>;
  players: Array<{ steamId64: string; name: string; teamKey: TeamKey }>;
}

export function extractTournamentFacts(
  input: SeasonInsightsDemo,
  suppliedPerformanceFacts?: ReturnType<typeof buildPlayerRoundPerformanceFacts>,
  identity: TournamentIdentity = input.tournamentIdentity ?? observedTournamentIdentity(input.matchId, input.pkg.players),
): TournamentFacts {
  const facts = extractTournamentSourceFacts(input, identity, suppliedPerformanceFacts);
  return {
    ...facts,
    teams: { teamA: input.pkg.match.teamA.name ?? "Team A", teamB: input.pkg.match.teamB.name ?? "Team B" },
    players: input.pkg.players.map(player => ({ steamId64: player.steamId64, name: player.name, teamKey: player.teamKey })),
  };
}

function toTournamentMapFacts(facts: TournamentFacts): { facts: TournamentMapFacts; labels: TournamentEntityLabels } {
  const projected = projectTournamentMapFacts(facts);
  return {
    facts: projected,
    labels: {
      teams: { [facts.teamEntityKeys.teamA]: facts.teams.teamA, [facts.teamEntityKeys.teamB]: facts.teams.teamB },
      players: Object.fromEntries(facts.players.map(player => [facts.playerEntityKeys[player.steamId64]!, player.name])),
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
  return { teamEntityKey: analyticsTeam.team.entityKey, teamName, states };
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
      teamEntityKey: team.team.entityKey,
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
      teamEntityKey: team.team.entityKey,
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
      teamEntityKey: team.team.entityKey,
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
