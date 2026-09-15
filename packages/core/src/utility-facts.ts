import type { DemoPackage } from "@cs2dak/contract";
import {
  buildPlayerRoundPerformanceFacts,
  type PlayerRoundPerformanceUtilityFact,
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

export function buildPlayerRoundUtilityFacts(pkg: DemoPackage): PlayerRoundUtilityFact[] {
  return buildPlayerRoundPerformanceFacts(pkg).playerRounds.map((row) => ({
    roundNumber: row.roundNumber,
    steamId64: row.steamId64,
    ...row.utility,
  }));
}
