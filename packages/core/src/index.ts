export { normalizeDemoPackage, parsePackageJson } from "./normalize.js";
export { createPlayerResolver, createResolverFromPackage } from "./resolve.js";
export type { PlayerResolver } from "./resolve.js";
export { demoSourceAvailability, richKillDiagnostics, type RichKillDiagnostics, type DemoSourceAvailability } from "./qa.js";
export { activeDamages, activePhaseDamages, groupBy } from "./utils.js";
export { buildPlayerRoundUtilityFacts, toPlayerRoundUtilityFacts, type PlayerRoundUtilityFact } from "./utility-facts.js";
export { derivePlayerWeaponHighlights } from "./weapon-highlights.js";
export {
  aggregatePlayerRoundPerformanceFacts,
  emptyPlayerPerformanceAggregate,
  deriveKillTrades,
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
export { assertPlayerRoundPerformanceFacts } from "./performance-facts.js";
export { CORE_ANALYSIS_VERSION, CORE_SEMANTIC_PROFILE } from "./version.js";
export { buildTeamSideWinRates } from "./side-win-rate.js";
export type { SideWinRateStats, TeamSideWinRates } from "./side-win-rate.js";


export * from "./tournament-facts.js";
export { buildQaReport } from "./qa.js";
export { buildTimeline, buildEconomy, buildHeatmap } from "./timeline.js";
export { buildPlayerWeaponHighlights } from "./weapon-highlights.js";
export { round, clamp, getOrInit, normalizeWeapon, killWeaponName } from "./utils.js";

export { fieldAvailability, fieldConfidence } from "./qa.js";
