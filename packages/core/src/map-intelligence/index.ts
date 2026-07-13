import {
  MAP_INTELLIGENCE_FACT_VERSION,
  matchMapIntelligenceFactsSchema,
  type DemoPackage,
  type MatchMapIntelligenceFacts,
} from "@cs2dak/contract";
import { getMapNav, type CalloutGrid, type CompactNav } from "@cs2dak/maps";
import { createReplayRoundContexts, type ReplayRoundContext } from "../tactics/replay-round-context.js";
import { extractPlayerPositionRoundFacts } from "./player-position.js";
import { buildRoundSpatialFrames } from "./spatial.js";
import { extractTeamShapeRoundFacts } from "./team-shape.js";

export { MAP_INTELLIGENCE_FACT_VERSION } from "@cs2dak/contract";
export type { MatchMapIntelligenceFacts, PlayerPositionRoundFact, TeamShapeRoundFact } from "@cs2dak/contract";

export interface ExtractMatchMapIntelligenceFactsOptions {
  matchId: string;
  calloutGrid?: CalloutGrid | null;
  nav?: CompactNav | null;
  /** Allows one caller to share the decoded rounds with tactical extraction. */
  replayContexts?: ReadonlyMap<number, ReplayRoundContext>;
}

/**
 * Public compact-facts facade. Contexts exist only for this call and are never returned or persisted.
 */
export function extractMatchMapIntelligenceFacts(
  pkg: DemoPackage,
  options: ExtractMatchMapIntelligenceFactsOptions,
): MatchMapIntelligenceFacts {
  const contexts = options.replayContexts ?? createReplayRoundContexts(pkg);
  const nav = options.nav === undefined ? getMapNav(pkg.match.mapName) : options.nav;
  const playerPositionRounds = [];
  const teamShapeRounds = [];
  for (const round of pkg.rounds) {
    const context = contexts.get(round.roundNumber) ?? null;
    const frames = context ? buildRoundSpatialFrames(context, options.calloutGrid ?? null, nav) : [];
    playerPositionRounds.push(...extractPlayerPositionRoundFacts(pkg, options.matchId, context, round, frames, options.calloutGrid ?? null, nav != null));
    teamShapeRounds.push(...extractTeamShapeRoundFacts(pkg, options.matchId, context, round, frames, options.calloutGrid ?? null, nav != null));
  }
  return matchMapIntelligenceFactsSchema.parse({ analysisVersion: MAP_INTELLIGENCE_FACT_VERSION, matchId: options.matchId, mapName: pkg.match.mapName, playerPositionRounds, teamShapeRounds });
}

export { buildRoundSpatialFrames } from "./spatial.js";
