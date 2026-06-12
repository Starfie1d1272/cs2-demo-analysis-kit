import { analysisBundleSchema, type AnalysisBundle } from "@cs2dak/contract";
import { normalizeDemoPackage } from "./normalize.js";
import { buildQaReport } from "./qa.js";
import { buildPlayerRoundFacts, buildPlayerIndicators, buildScoreboard } from "./scoreboard.js";
import { computeAccountRatingsV2 } from "./signals.js";
import { buildTimeline, buildEconomy, buildHeatmap } from "./timeline.js";
import { buildPlayerWeaponHighlights } from "./weapon-highlights.js";

export { loadDemoPackageFromZip } from "./loader.js";
export { normalizeDemoPackage } from "./normalize.js";
export { deriveRRSignals, deriveAccountSignalsV2, computeAccountRatingsV2 } from "./signals.js";
export * from "./spatial/index.js";
export { deriveRRIndicators } from "./scoreboard.js";
export { derivePlayerWeaponHighlights } from "./weapon-highlights.js";
export { buildEconomyConversion } from "./economy.js";
export { buildTeamSideWinRates } from "./side-win-rate.js";
export { deriveDuels, deriveOpeningDuels } from "./duels.js";
export { derivePlayerMechanics } from "./mechanics.js";
export type {
  EconomyTypeStats,
  EconomyConversion,
  MatchEconomyConversion,
} from "./economy.js";
export type { SideWinRateStats, TeamSideWinRates } from "./side-win-rate.js";
export type { DuelClassification, DuelFact } from "./duels.js";
export type { BurstLengthBuckets, PlayerMechanicsFact } from "./mechanics.js";

export function analyzeDemoPackage(input: unknown): AnalysisBundle {
  const pkg = normalizeDemoPackage(input);
  const qa = buildQaReport(pkg);
  const playerRoundFacts = buildPlayerRoundFacts(pkg);
  const playerIndicators = buildPlayerIndicators(pkg, playerRoundFacts);
  const accountRatings = computeAccountRatingsV2(pkg);
  const scoreboard = buildScoreboard(pkg, playerIndicators, accountRatings);
  const playerWeaponHighlights = buildPlayerWeaponHighlights(pkg);
  const timeline = buildTimeline(pkg);
  const economy = buildEconomy(pkg);
  const heatmap = buildHeatmap(pkg);

  return analysisBundleSchema.parse({
    version: "cs2-demo-analysis-kit/1.0",
    sourceSchemaVersion: pkg.manifest.schemaVersion,
    provenance: {
      analysisVersion: "cs2-demo-analysis-kit/1.0",
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
