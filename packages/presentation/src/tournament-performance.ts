import {
  observedTournamentIdentity, projectTournamentPerformanceMapFacts, type TournamentIdentity,
} from "@cs2dak/core";
import type { DemoPackage, TeamKey } from "@cs2dak/contract";
import {
  buildTournamentPerformanceAnalytics,
  type TournamentEntityLabels,
  type TournamentPerformanceAnalytics,
  type TournamentPerformanceMapFacts,
} from "@cs2dak/tournament";
import type { SeasonInsightsDemo } from "./insights.js";

const TEAM_KEYS = ["teamA", "teamB"] as const satisfies readonly TeamKey[];

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

function identityFor(input: SeasonInsightsDemo, options: TournamentPerformanceAdapterOptions): TournamentIdentity {
  const observed = input.tournamentIdentity ?? observedTournamentIdentity(input.matchId, input.pkg.players);
  return {
    teamEntityKeys: { ...observed.teamEntityKeys, ...options.teamEntityKeys },
    playerEntityKeys: { ...observed.playerEntityKeys, ...options.playerEntityKeys },
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

function observedLabels(input: SeasonInsightsDemo, options: TournamentPerformanceAdapterOptions): TournamentEntityLabels {
  const identity = identityFor(input, options);
  return {
    teams: Object.fromEntries(TEAM_KEYS.map(teamKey => [identity.teamEntityKeys[teamKey], teamNameFor(input.pkg, teamKey)])),
    players: Object.fromEntries(input.pkg.players.map(player => [identity.playerEntityKeys[player.steamId64]!, player.name])),
  };
}

export function extractTournamentPerformanceMapFacts(
  input: SeasonInsightsDemo,
  options: TournamentPerformanceAdapterOptions = {},
): TournamentPerformanceMapFacts {
  return projectTournamentPerformanceMapFacts(input, identityFor(input, options));
}

export function buildTournamentPerformanceAnalyticsFromDemos(
  demos: SeasonInsightsDemo[],
  options: TournamentPerformanceAdapterOptions = {},
): TournamentPerformanceAnalytics {
  const labels: TournamentEntityLabels = {};
  const mapFacts = demos.map((demo) => {
    const facts = extractTournamentPerformanceMapFacts(demo, options);
    mergeLabels(labels, observedLabels(demo, options));
    return facts;
  });
  mergeLabels(labels, options.labels ?? {});
  return buildTournamentPerformanceAnalytics(mapFacts, { labels });
}
