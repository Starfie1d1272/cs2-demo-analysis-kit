import { PRISM_AXIS_ORDER, type PrismAxisKey } from "@rivalhub/rival-rating";
import {
  teamCohortSummarySchema,
  type LeaderboardMetricKey,
  type SeasonCohortBundle,
  type TeamCohortSummary,
  type TeamMemberSummary,
  type TeamRosterInput
} from "@cs2dak/contract";
import { buildAllPlayerSeasonProfiles } from "./player.js";
import { computeSeasonMetrics, round } from "./season-metrics.js";
import { displayWeaponName } from "./weapons.js";
import type { DemoPackage } from "@cs2dak/contract";

const AXIS_LABEL: Record<PrismAxisKey, string> = {
  firepower: "火力",
  opening: "首杀",
  clutch: "残局",
  sniping: "狙击",
  survival: "生存",
  utility: "道具",
  trading: "补枪",
  entry: "突破"
};

const LEADERS: Array<{ metric: "rivalhubRR" | "adr" | "kast" | "firstKillPer100"; label: string }> = [
  { metric: "rivalhubRR", label: "RR" },
  { metric: "adr", label: "ADR" },
  { metric: "kast", label: "KAST%" },
  { metric: "firstKillPer100", label: "FK/100r" }
];

function average(values: number[]): number {
  return values.length === 0 ? 0 : round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

function memberSummary(player: SeasonCohortBundle["players"][number]): TeamMemberSummary {
  return {
    playerKey: player.playerKey,
    name: player.name,
    mapCount: player.mapCount,
    confidence: player.confidence,
    metrics: computeSeasonMetrics(player)
  };
}

function metricValues(members: TeamMemberSummary[], key: LeaderboardMetricKey): number[] {
  return members.map((member) => member.metrics[key]).filter((value): value is number => value != null);
}

export function buildTeamCohortSummary(
  bundle: SeasonCohortBundle,
  roster: TeamRosterInput
): TeamCohortSummary {
  if (roster.playerKeys.length === 0) throw new Error("team roster requires at least one playerKey");

  const byKey = new Map(bundle.players.map((player) => [player.playerKey, player]));
  const players = roster.playerKeys.map((playerKey) => {
    const player = byKey.get(playerKey);
    if (!player) throw new Error(`playerKey not found in cohort: ${playerKey}`);
    return player;
  });
  const members = players.map(memberSummary);
  const firstKills = players.reduce((sum, player) => sum + player.indicators.firstKillCount, 0);
  const firstDeaths = players.reduce((sum, player) => sum + player.indicators.firstDeathCount, 0);
  const clutchAttempts = players.reduce((sum, player) => sum + player.indicators.clutchAttempts, 0);
  const clutchWins = players.reduce((sum, player) => sum + player.indicators.clutchWins, 0);
  const profilesByKey = new Map(buildAllPlayerSeasonProfiles(bundle).map((profile) => [profile.playerKey, profile]));
  const styled = players
    .map((player) => profilesByKey.get(player.playerKey)!)
    .filter((profile) => profile.style != null);

  const teamAxes = styled.length === 0
    ? null
    : PRISM_AXIS_ORDER.map((key) => ({
        key,
        label: AXIS_LABEL[key],
        percentile: average(styled.map((profile) => profile.style!.axes.find((axis) => axis.key === key)!.percentile))
      }));

  const specialists = styled.length === 0
    ? []
    : PRISM_AXIS_ORDER.map((key) => {
        const top = styled
          .map((profile) => ({
            playerKey: profile.playerKey,
            name: profile.name,
            percentile: profile.style!.axes.find((axis) => axis.key === key)!.percentile
          }))
          .sort((a, b) => b.percentile - a.percentile)[0]!;
        return { key, label: AXIS_LABEL[key], ...top };
      });
  const dominantAxes = new Set(
    styled.map((profile) =>
      [...profile.style!.axes].sort((a, b) => b.percentile - a.percentile)[0]!.key
    )
  );

  return teamCohortSummarySchema.parse({
    version: "cs2-demo-analysis-kit/team-summary-0.1",
    weightsVersion: bundle.weightsVersion,
    teamKey: roster.teamKey,
    name: roster.name,
    members,
    coreMembers: [...members]
      .sort((a, b) => b.mapCount - a.mapCount || (b.metrics.rivalhubRR ?? 0) - (a.metrics.rivalhubRR ?? 0))
      .slice(0, 5),
    averages: {
      rivalhubRR: average(metricValues(members, "rivalhubRR")),
      hltvRating: average(metricValues(members, "hltvRating")),
      adr: average(metricValues(members, "adr")),
      kd: metricValues(members, "kd").length > 0 ? average(metricValues(members, "kd")) : null,
      kast: average(metricValues(members, "kast")),
      confidence: average(members.map((member) => member.confidence))
    },
    performance: {
      firstKills,
      firstDeaths,
      openingDuelWinRate: firstKills + firstDeaths > 0
        ? round(firstKills / (firstKills + firstDeaths), 4)
        : null,
      clutchAttempts,
      clutchWins,
      clutchWinRate: clutchAttempts > 0 ? round(clutchWins / clutchAttempts, 4) : null
    },
    style: teamAxes == null ? null : { axes: teamAxes },
    leaders: LEADERS.map(({ metric, label }) => {
      const leader = [...members]
        .filter((member) => member.metrics[metric] != null)
        .sort((a, b) => b.metrics[metric]! - a.metrics[metric]!)[0]!;
      return { metric, label, playerKey: leader.playerKey, name: leader.name, value: leader.metrics[metric]! };
    }),
    roleComplementarity: {
      coverageScore: styled.length === 0 ? 0 : round((dominantAxes.size / Math.min(styled.length, 8)) * 100, 1),
      specialists,
      weakAxes: (teamAxes ?? []).filter((axis) => axis.percentile < 50)
    }
  });
}

export interface TeamComparisonPlayerRow {
  teamName: string;
  steamId64: string;
  name: string;
  rr: number | null;
  adr: number | null;
  kast: number | null;
  kpr: number | null;
  dpr: number | null;
}

export interface TeamComparisonEvidence {
  matchId: string;
  roundNumber: number;
  tick?: number;
  label: string;
}

export interface TeamComparisonSide {
  teamName: string;
  players: TeamComparisonPlayerRow[];
  weaponPreference: Array<{ weapon: string; label: string; kills: number; sharePercent: number }>;
  economyWinRate: Array<{ economyType: string; rounds: number; wins: number; winRatePercent: number | null }>;
}

export interface TeamComparisonModel {
  version: "cs2-demo-analysis-kit/team-comparison-0.1";
  teams: [TeamComparisonSide, TeamComparisonSide] | [];
  radar: Array<{ metric: string; label: string; a: number | null; b: number | null; delta: number | null }>;
  evidence: TeamComparisonEvidence[];
}

export interface TeamComparisonInput {
  matchId: string;
  pkg: DemoPackage;
}

function teamName(pkg: DemoPackage, key: string): string {
  return key === "teamA" ? (pkg.match.teamA.name ?? "Team A") : (pkg.match.teamB.name ?? "Team B");
}

function averageNullable(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => value != null && Number.isFinite(value));
  return nums.length > 0 ? round(nums.reduce((sum, value) => sum + value, 0) / nums.length, 2) : null;
}

export function buildTeamComparison(inputs: TeamComparisonInput[]): TeamComparisonModel {
  const teamNames = [...new Set(inputs.flatMap(({ pkg }) => [teamName(pkg, "teamA"), teamName(pkg, "teamB")]))].slice(0, 2);
  if (teamNames.length < 2) {
    return { version: "cs2-demo-analysis-kit/team-comparison-0.1", teams: [], radar: [], evidence: [] };
  }
  const sides = teamNames.map((name): TeamComparisonSide => {
    const playerRows = new Map<string, TeamComparisonPlayerRow & { rounds: number; kills: number; deaths: number; damage: number; kastRounds: number }>();
    const weaponKills = new Map<string, number>();
    const economy = new Map<string, { rounds: number; wins: number }>();
    for (const { pkg } of inputs) {
      for (const [teamKey, candidate] of [["teamA", teamName(pkg, "teamA")], ["teamB", teamName(pkg, "teamB")]] as const) {
        if (candidate !== name) continue;
        for (const stat of pkg.playerStats) {
          const player = pkg.players[stat.playerIndex];
          if (!player || player.teamKey !== teamKey) continue;
          const current = playerRows.get(player.steamId64) ?? {
            teamName: name,
            steamId64: player.steamId64,
            name: player.name,
            rr: null,
            adr: null,
            kast: null,
            kpr: null,
            dpr: null,
            rounds: 0,
            kills: 0,
            deaths: 0,
            damage: 0,
            kastRounds: 0
          };
          current.rounds += stat.rounds;
          current.kills += stat.kills;
          current.deaths += stat.deaths;
          current.damage += stat.damageHealth;
          current.kastRounds += stat.kastRounds;
          playerRows.set(player.steamId64, current);
        }
        for (const kill of pkg.kills) {
          if (kill.killerIndex == null) continue;
          const killer = pkg.players[kill.killerIndex];
          if (!killer || killer.teamKey !== teamKey) continue;
          const weapon = killWeaponLabel(kill.weapon);
          weaponKills.set(weapon, (weaponKills.get(weapon) ?? 0) + 1);
        }
        for (const round of pkg.rounds) {
          const type = teamKey === "teamA" ? round.teamAEconomy : round.teamBEconomy;
          const cell = economy.get(type) ?? { rounds: 0, wins: 0 };
          cell.rounds += 1;
          if (round.winnerTeamKey === teamKey) cell.wins += 1;
          economy.set(type, cell);
        }
      }
    }
    const players = [...playerRows.values()].map((row) => ({
      teamName: row.teamName,
      steamId64: row.steamId64,
      name: row.name,
      rr: row.rounds > 0 ? round((row.kills - row.deaths) / row.rounds + row.damage / row.rounds / 100, 3) : null,
      adr: row.rounds > 0 ? round(row.damage / row.rounds, 1) : null,
      kast: row.rounds > 0 ? round(row.kastRounds / row.rounds * 100, 1) : null,
      kpr: row.rounds > 0 ? round(row.kills / row.rounds, 3) : null,
      dpr: row.rounds > 0 ? round(row.deaths / row.rounds, 3) : null
    })).sort((a, b) => (b.rr ?? 0) - (a.rr ?? 0));
    const totalWeaponKills = [...weaponKills.values()].reduce((sum, value) => sum + value, 0);
    return {
      teamName: name,
      players,
      weaponPreference: [...weaponKills.entries()]
        .map(([weapon, kills]) => ({ weapon, label: displayWeaponName(weapon), kills, sharePercent: totalWeaponKills > 0 ? round(kills / totalWeaponKills * 100, 1) : 0 }))
        .sort((a, b) => b.kills - a.kills)
        .slice(0, 8),
      economyWinRate: [...economy.entries()]
        .map(([economyType, cell]) => ({ economyType, rounds: cell.rounds, wins: cell.wins, winRatePercent: cell.rounds > 0 ? round(cell.wins / cell.rounds * 100, 1) : null }))
        .sort((a, b) => a.economyType.localeCompare(b.economyType))
    };
  }) as [TeamComparisonSide, TeamComparisonSide];
  const radar = [
    { metric: "rr", label: "RR", a: averageNullable(sides[0].players.map((row) => row.rr)), b: averageNullable(sides[1].players.map((row) => row.rr)) },
    { metric: "adr", label: "ADR", a: averageNullable(sides[0].players.map((row) => row.adr)), b: averageNullable(sides[1].players.map((row) => row.adr)) },
    { metric: "kast", label: "KAST", a: averageNullable(sides[0].players.map((row) => row.kast)), b: averageNullable(sides[1].players.map((row) => row.kast)) },
    { metric: "kpr", label: "KPR", a: averageNullable(sides[0].players.map((row) => row.kpr)), b: averageNullable(sides[1].players.map((row) => row.kpr)) },
    { metric: "dpr", label: "DPR", a: averageNullable(sides[0].players.map((row) => row.dpr)), b: averageNullable(sides[1].players.map((row) => row.dpr)) }
  ].map((row) => ({ ...row, delta: row.a != null && row.b != null ? round(row.a - row.b, 2) : null }));
  const evidence = inputs.flatMap(({ matchId, pkg }) =>
    pkg.kills.slice(0, 5).map((kill) => ({
      matchId,
      roundNumber: kill.roundNumber,
      tick: kill.tick,
      label: `${pkg.match.mapName} R${kill.roundNumber}`
    }))
  ).slice(0, 20);
  return { version: "cs2-demo-analysis-kit/team-comparison-0.1", teams: sides, radar, evidence };
}

function killWeaponLabel(weapon: string): string {
  return weapon.toLowerCase().replace(/^weapon_/, "");
}
