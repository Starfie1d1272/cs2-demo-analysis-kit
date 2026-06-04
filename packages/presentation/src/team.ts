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
