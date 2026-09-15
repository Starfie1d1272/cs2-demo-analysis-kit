import { analysisBundleSchema, type AnalysisBundle } from "@cs2dak/contract";
import { normalizeDemoPackage } from "./normalize.js";
import { buildQaReport } from "./qa.js";
import { buildPlayerIndicators, buildScoreboard } from "./scoreboard.js";
import { computeAccountRatingsV2 } from "./signals.js";
import { buildTimeline, buildEconomy, buildHeatmap } from "./timeline.js";
import { buildPlayerWeaponHighlights } from "./weapon-highlights.js";
import {
  buildPlayerRoundPerformanceFacts,
  toPlayerRoundFacts,
  type PlayerRoundPerformanceFacts,
} from "./performance-facts.js";
import { CORE_ANALYSIS_VERSION } from "./version.js";
import { findPlayerStatsParityMismatches } from "./performance-parity.js";

export { loadDemoManifestFromZip, loadDemoPackageFromZip } from "./loader.js";
export type { DemoManifest, DemoPackageLoadOptions, DemoPackageLoadProfile } from "./loader.js";
export { normalizeDemoPackage } from "./normalize.js";
export { createPlayerResolver, createResolverFromPackage } from "./resolve.js";
export type { PlayerResolver } from "./resolve.js";
export { demoSourceAvailability, type DemoSourceAvailability } from "./qa.js";
export { deriveRRSignals, computeAccountRatingsV2 } from "./signals.js";
export { activeDamages, activePhaseDamages, groupBy } from "./utils.js";
export * from "./spatial/index.js";
export { deriveRRIndicators } from "./scoreboard.js";
export { buildPlayerRoundFacts } from "./scoreboard.js";
export { buildPlayerRoundUtilityFacts, toPlayerRoundUtilityFacts, type PlayerRoundUtilityFact } from "./utility-facts.js";
export { derivePlayerWeaponHighlights } from "./weapon-highlights.js";
export {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  toPlayerRoundFacts,
} from "./performance-facts.js";
export type {
  PlayerPerformanceAggregate,
  PlayerPerformanceClutchAggregate,
  PlayerPerformanceWeaponAggregate,
  PlayerRoundManStateFact,
  PlayerRoundPerformanceClutchFact,
  PlayerRoundPerformanceFact,
  PlayerRoundPerformanceFacts,
  PlayerRoundPerformanceKastTag,
  PlayerRoundPerformanceObjectiveFact,
  PlayerRoundPerformanceUtilityFact,
  PlayerRoundPerformanceWeaponFact,
} from "./performance-facts.js";
export { assertPlayerStatsParity, findPlayerStatsParityMismatches } from "./performance-parity.js";
export type { PlayerStatsParityMismatch } from "./performance-parity.js";
export { CORE_ANALYSIS_VERSION } from "./version.js";
export { buildTeamSideWinRates } from "./side-win-rate.js";
export { buildDuelsSignals, deriveDuels, deriveOpeningDuels } from "./duels.js";
export { buildMechanicsSignals, counterStrafeThresholdForWeapon, derivePlayerMechanics } from "./mechanics.js";
export { buildMatchRadarField, aggregateRadarFields, RADAR_FIELD_VERSION } from "./radar-field.js";
export type { BuildMatchRadarFieldOptions } from "./radar-field.js";
export type { SideWinRateStats, TeamSideWinRates } from "./side-win-rate.js";
export type { DuelClassification, DuelHpBucket, DuelRecord, DuelSignals, TtkDistribution } from "./duels.js";
export type {
  BurstLengthBuckets,
  MechanicsMetricSet,
  MechanicsSignals,
  MedianSample,
  PlayerMechanicsFact,
  PreaimSample,
  RateSample,
} from "./mechanics.js";

export function analyzeDemoPackage(input: unknown, suppliedPerformanceFacts?: PlayerRoundPerformanceFacts): AnalysisBundle {
  const pkg = normalizeDemoPackage(input);
  const performanceFacts = suppliedPerformanceFacts ?? buildPlayerRoundPerformanceFacts(pkg);
  const parityMismatches = findPlayerStatsParityMismatches(pkg, performanceFacts);
  const qa = buildQaReport(pkg, parityMismatches.map((mismatch) => ({
    severity: mismatch.comparable === false ? "warning" as const : "error" as const,
    code: mismatch.comparable === false ? "performance.parity_not_comparable" : "performance.parity_mismatch",
    message: mismatch.comparable === false
      ? `Frozen playerStats ${mismatch.field} is not comparable for ${mismatch.playerName} (playerIndex=${mismatch.playerIndex}): ${mismatch.reason ?? "opening semantics differ"}.`
      : `Frozen playerStats ${mismatch.field} disagrees for ${mismatch.playerName} (playerIndex=${mismatch.playerIndex}): expected=${mismatch.expected}, actual=${mismatch.actual}.`,
    path: `playerStats.${mismatch.field}`,
  })));
  const playerRoundFacts = toPlayerRoundFacts(performanceFacts);
  const playerIndicators = buildPlayerIndicators(pkg, performanceFacts);
  const accountRatings = computeAccountRatingsV2(pkg, performanceFacts);
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
export * from "./tactics/index.js";
export * from "./map-intelligence/index.js";
