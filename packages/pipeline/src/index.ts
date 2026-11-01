import type { DemoPackage } from "@cs2dak/contract";
import type { DemoViewOptions, MatchWorkspaceModel } from "@cs2dak/presentation";
import {
  buildPlayerRoundPerformanceFacts, assertPlayerRoundPerformanceFacts, normalizeDemoPackage,
  buildQaReport, toPlayerRoundFacts, buildPlayerWeaponHighlights, derivePlayerWeaponHighlights,
  buildTimeline, buildEconomy, buildHeatmap, CORE_ANALYSIS_VERSION,
  type PlayerRoundPerformanceFacts,
} from "@cs2dak/core";
import {
  analysisBundleSchema, buildMatchWorkspaceFromAnalysis, buildPlayerIndicators, buildScoreboard,
  deriveRRSignals, deriveRRIndicators, type AnalysisBundle, type RatingSpatialContext,
} from "@cs2dak/analytics";
import { computeAccountRatings, computeIndicatorRatings } from "@cs2dak/rating";
import { loadSpatialAssets, buildOfficialMapControl } from "@cs2dak/tactics";
import {
  buildSeasonCohortFromRows,
  type SeasonCohortFactRow, type SeasonCohortOptions, type SeasonCohortBundle,
} from "@cs2dak/cohort";

/** Compute the spatial inputs selected by the rating workflow. */
export function buildRatingSpatialContext(pkg: DemoPackage): RatingSpatialContext {
  const assets = loadSpatialAssets(pkg.match.mapName ?? pkg.manifest.mapName);
  const control = buildOfficialMapControl(pkg, assets);
  return {
    observable: assets.routes != null && (pkg.replay?.rounds.length ?? 0) > 0,
    strategicIsolationDeaths: new Map([...control].map(([id, row]) => [id, row.strategicIsolationDeaths])),
  };
}

export function analyzeDemoPackage(input: unknown, suppliedPerformanceFacts?: PlayerRoundPerformanceFacts): AnalysisBundle {
  const pkg = normalizeDemoPackage(input);
  const performanceFacts = suppliedPerformanceFacts ?? buildPlayerRoundPerformanceFacts(pkg);
  if (suppliedPerformanceFacts) assertPlayerRoundPerformanceFacts(pkg, performanceFacts);
  const qa = buildQaReport(pkg);
  const playerRoundFacts = toPlayerRoundFacts(performanceFacts);
  const indicators = deriveRRIndicators(pkg, performanceFacts);
  const playerIndicators = buildPlayerIndicators(pkg, computeIndicatorRatings(indicators));
  const signals = deriveRRSignals(pkg, performanceFacts, buildRatingSpatialContext(pkg));
  const accountRatings = computeAccountRatings(signals);
  const scoreboard = buildScoreboard(pkg, playerIndicators, accountRatings, performanceFacts);
  const playerWeaponHighlights = buildPlayerWeaponHighlights(pkg, performanceFacts);
  const timeline = buildTimeline(pkg);
  const economy = buildEconomy(pkg);
  const heatmap = buildHeatmap(pkg);

  return analysisBundleSchema.parse({
    version: "cs2-demo-analysis-kit/1.0",
    sourceSchemaVersion: pkg.manifest.schemaVersion,
    provenance: {
      analysisVersion: CORE_ANALYSIS_VERSION,
      sourceSchemaVersion: pkg.manifest.schemaVersion,
      sourceDemoHash: pkg.manifest.demo?.hash ?? null,
      exporter: pkg.manifest.exporter,
      parser: pkg.manifest.parser,
      ratingVersions: {
        rr: playerIndicators[0]?.rr.weightsVersion ?? null,
        valueAccounts: accountRatings[0]?.rr.weightsVersion ?? null
      }
    },
    mapName: pkg.match.mapName,
    tickrate: pkg.match.tickrate,
    teams: {
      teamA: { name: pkg.match.teamA.name ?? "Team A", score: pkg.match.teamA.score },
      teamB: { name: pkg.match.teamB.name ?? "Team B", score: pkg.match.teamB.score }
    },
    scoreboard,
    playerWeaponHighlights,
    playerIndicators,
    playerRoundFacts,
    timeline,
    economy,
    heatmap,
    qa
  });
}
/** Execute the single-match analysis before projecting the UI model. */
export function analyzeMatchWorkspace(input: unknown, options: DemoViewOptions = {}): MatchWorkspaceModel {
  const pkg = normalizeDemoPackage(input);
  const facts = buildPlayerRoundPerformanceFacts(pkg);
  const analysis = analyzeDemoPackage(pkg, facts);
  return buildMatchWorkspaceFromAnalysis(pkg, analysis, facts, options);
}

export interface SeasonCohortInput {
  matchId: string;
  pkg: DemoPackage;
}

export function buildSeasonCohort(
  demos: SeasonCohortInput[],
  opts: SeasonCohortOptions = {}
): SeasonCohortBundle {
  const rows: SeasonCohortFactRow[] = [];
  for (const demo of demos) {
    const pkg = normalizeDemoPackage(demo.pkg);
    const performanceFacts = buildPlayerRoundPerformanceFacts(pkg);
    const signals = deriveRRSignals(pkg, performanceFacts, buildRatingSpatialContext(pkg));
    const indicators = deriveRRIndicators(pkg, performanceFacts);
    const weaponHighlights = derivePlayerWeaponHighlights(pkg, performanceFacts);
    const signalBySteamId = new Map(signals.map((row) => [row.steamId64, row]));
    const indicatorBySteamId = new Map(indicators.map((row) => [row.steamId64, row]));
    const weaponHighlightBySteamId = new Map(weaponHighlights.map((row) => [row.steamId64, row]));
    for (const player of pkg.players) {
      const signal = signalBySteamId.get(player.steamId64);
      const indicator = indicatorBySteamId.get(player.steamId64);
      if (!signal || !indicator) continue;
      rows.push({
        matchId: demo.matchId,
        sourceDemoHash: pkg.manifest.demo?.hash ?? null,
        steamId64: player.steamId64,
        playerName: player.name,
        teamKey: player.teamKey,
        signals: signal,
        indicators: indicator,
        weaponHighlight: weaponHighlightBySteamId.get(player.steamId64) ?? null
      });
    }
  }
  return buildSeasonCohortFromRows(rows, {
    ...opts,
    matchCount: demos.length
  });
}
