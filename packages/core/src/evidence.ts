import type { DemoPackage } from "@cs2dak/contract";
import { buildQaReport } from "./qa.js";
import { assertPlayerRoundPerformanceFacts } from "./performance-validation.js";
import {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  type PlayerPerformanceAggregate,
  type PlayerRoundPerformanceFacts,
} from "./performance-facts.js";
import { demoSourceAvailability, richKillDiagnostics, type RichKillDiagnostics, type DemoSourceAvailability } from "./qa.js";
import { CORE_ANALYSIS_VERSION, CORE_SEMANTIC_PROFILE } from "./version.js";
import { buildTeamSideWinRates } from "./side-win-rate.js";
import { normalizeDemoPackage } from "./normalize.js";

export {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  buildTeamSideWinRates,
  CORE_SEMANTIC_PROFILE,
  demoSourceAvailability,
  richKillDiagnostics,
  type RichKillDiagnostics,
  type DemoSourceAvailability,
  type PlayerPerformanceAggregate,
  type PlayerRoundPerformanceFacts,
};
export { loadDemoPackageFromZip } from "./loader.js";

/** Evidence validates canonical facts and source QA without a legacy aggregate oracle. */
export function analyzeDemoPackageForEvidence(pkg: DemoPackage, facts: PlayerRoundPerformanceFacts) {
  const normalized = normalizeDemoPackage(pkg);
  assertPlayerRoundPerformanceFacts(normalized, facts);
  const qa = buildQaReport(normalized);
  return { provenance: { analysisVersion: CORE_ANALYSIS_VERSION }, qa };
}

export * from "./tournament-facts.js";
