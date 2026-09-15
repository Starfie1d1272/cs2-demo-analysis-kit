import type { DemoPackage } from "@cs2dak/contract";
import {
  buildPlayerRoundPerformanceFacts,
  type PlayerRoundPerformanceUtilityFact,
  type PlayerRoundPerformanceFacts,
} from "./performance-facts.js";

/**
 * Backwards-compatible utility projection. Utility attribution is performed
 * only by buildPlayerRoundPerformanceFacts; this function exposes the old
 * low-dimensional rows without maintaining a second event loop.
 */
export type PlayerRoundUtilityFact = PlayerRoundPerformanceUtilityFact & {
  roundNumber: number;
  steamId64: string;
};

export function toPlayerRoundUtilityFacts(performanceFacts: PlayerRoundPerformanceFacts): PlayerRoundUtilityFact[] {
  return performanceFacts.playerRounds.map((row) => ({
    roundNumber: row.roundNumber,
    steamId64: row.steamId64,
    ...row.utility,
  }));
}

export function buildPlayerRoundUtilityFacts(
  pkg: DemoPackage,
  performanceFacts: PlayerRoundPerformanceFacts = buildPlayerRoundPerformanceFacts(pkg),
): PlayerRoundUtilityFact[] {
  return toPlayerRoundUtilityFacts(performanceFacts);
}
