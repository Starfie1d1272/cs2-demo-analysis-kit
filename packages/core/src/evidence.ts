import type { DemoPackage } from "@cs2dak/contract";
import { buildQaReport } from "./qa.js";
import { findPlayerStatsParityMismatches } from "./performance-parity.js";
import {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  type PlayerPerformanceAggregate,
  type PlayerRoundPerformanceFacts,
} from "./performance-facts.js";
import { demoSourceAvailability, type DemoSourceAvailability } from "./qa.js";
import { CORE_ANALYSIS_VERSION, CORE_SEMANTIC_PROFILE } from "./version.js";
import { buildTeamSideWinRates } from "./side-win-rate.js";
import { normalizeDemoPackage } from "./normalize.js";

export {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  buildTeamSideWinRates,
  CORE_SEMANTIC_PROFILE,
  demoSourceAvailability,
  type DemoSourceAvailability,
  type PlayerPerformanceAggregate,
  type PlayerRoundPerformanceFacts,
};
export { loadDemoPackageFromZip } from "./loader.js";

/** Evidence uses the same Core parity checks and QA owner as full analysis. */
export function analyzeDemoPackageForEvidence(pkg: DemoPackage, facts: PlayerRoundPerformanceFacts) {
  const normalized = normalizeDemoPackage(pkg);
  const mismatches = findPlayerStatsParityMismatches(normalized, facts);
  const qa = buildQaReport(normalized, mismatches.map((mismatch) => ({
    severity: mismatch.comparable === false ? "warning" as const : "error" as const,
    code: mismatch.comparable === false ? "performance.parity_not_comparable" : "performance.parity_mismatch",
    message: mismatch.comparable === false
      ? `Frozen playerStats ${mismatch.field} is not comparable for ${mismatch.playerName} (playerIndex=${mismatch.playerIndex}): ${mismatch.reason ?? "opening semantics differ"}.`
      : `Frozen playerStats ${mismatch.field} disagrees for ${mismatch.playerName} (playerIndex=${mismatch.playerIndex}): expected=${mismatch.expected}, actual=${mismatch.actual}.`,
    path: `playerStats.${mismatch.field}`,
  })));
  return { provenance: { analysisVersion: CORE_ANALYSIS_VERSION }, qa };
}
