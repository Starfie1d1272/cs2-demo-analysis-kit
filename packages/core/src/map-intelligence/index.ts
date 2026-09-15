import {
  MAP_INTELLIGENCE_FACT_VERSION,
  matchMapIntelligenceFactsSchema,
  type DemoPackage,
  type MatchMapIntelligenceFacts,
} from "@cs2dak/contract";
import { getMapNav, type CalloutGrid, type CompactNav } from "@cs2dak/maps";
import { createReplayRoundContexts, type ReplayRoundContext } from "../tactics/replay-round-context.js";
import { extractTacticalRoundFactsWithContexts, type TacticalRoundFact } from "../tactics/round-facts.js";
import { extractPlayerPositionRoundFacts } from "./player-position.js";
import { buildRoundSpatialFrames } from "./spatial.js";
import { extractTeamShapeRoundFacts } from "./team-shape.js";
import { extractTeamAwpRoundFacts } from "./team-awp-round.js";
import { extractCtRotationRoundFacts } from "./ct-rotation.js";
import { buildPlayerRoundPerformanceFacts, type PlayerRoundPerformanceFacts } from "../performance-facts.js";

export { MAP_INTELLIGENCE_FACT_VERSION } from "@cs2dak/contract";
export { OPENING_RESPONSIBILITY_SECONDS } from "./opening-window.js";
export { CT_ROTATION_FACT_VERSION } from "@cs2dak/contract";
export { CT_ROTATION_RESPONSE_PERSISTENCE_SECONDS } from "./ct-rotation.js";
export type { CtRotationRoundFact, MatchMapIntelligenceFacts, PlayerPositionRoundFact, TeamAwpRoundFact, TeamShapeRoundFact } from "@cs2dak/contract";

export interface ExtractMatchMapIntelligenceFactsOptions {
  matchId: string;
  calloutGrid?: CalloutGrid | null;
  nav?: CompactNav | null;
  performanceFacts?: PlayerRoundPerformanceFacts;
}

/**
 * Public compact-facts facade. Contexts exist only for this call and are never returned or persisted.
 */
export function extractMatchMapIntelligenceFacts(
  pkg: DemoPackage,
  options: ExtractMatchMapIntelligenceFactsOptions,
): MatchMapIntelligenceFacts {
  const performanceFacts = options.performanceFacts ?? buildPlayerRoundPerformanceFacts(pkg);
  return extractMapIntelligenceWithContexts(pkg, options, createReplayRoundContexts(pkg), performanceFacts);
}

function extractMapIntelligenceWithContexts(
  pkg: DemoPackage,
  options: ExtractMatchMapIntelligenceFactsOptions,
  contexts: ReadonlyMap<number, ReplayRoundContext>,
  performanceFacts: PlayerRoundPerformanceFacts = buildPlayerRoundPerformanceFacts(pkg),
): MatchMapIntelligenceFacts {
  const nav = options.nav === undefined ? getMapNav(pkg.match.mapName) : options.nav;
  const playerPositionRounds = [];
  const teamShapeRounds = [];
  const teamAwpRounds = [];
  const ctRotationRounds = [];
  for (const round of pkg.rounds) {
    const context = contexts.get(round.roundNumber) ?? null;
    const frames = context ? buildRoundSpatialFrames(context, options.calloutGrid ?? null, nav) : [];
    const positionRows = extractPlayerPositionRoundFacts(pkg, options.matchId, context, round, frames, options.calloutGrid ?? null, nav != null);
    playerPositionRounds.push(...positionRows);
    teamShapeRounds.push(...extractTeamShapeRoundFacts(pkg, options.matchId, context, round, frames, options.calloutGrid ?? null, nav != null));
    teamAwpRounds.push(...extractTeamAwpRoundFacts(pkg, options.matchId, context, positionRows, performanceFacts));
    ctRotationRounds.push(...extractCtRotationRoundFacts(pkg, options.matchId, context, round, frames, options.calloutGrid ?? null, nav != null));
  }
  return matchMapIntelligenceFactsSchema.parse({ analysisVersion: MAP_INTELLIGENCE_FACT_VERSION, matchId: options.matchId, mapName: pkg.match.mapName, playerPositionRounds, teamShapeRounds, teamAwpRounds, ctRotationRounds });
}


/**
 * Internal replay consumers share delta decoding through this compact public facade.
 * The returned values are facts only; replay frames and pairwise graphs never escape core.
 */
export function extractMatchTacticalAndMapIntelligenceFacts(
  pkg: DemoPackage,
  options: ExtractMatchMapIntelligenceFactsOptions,
): { tacticalRounds: TacticalRoundFact[]; mapIntelligence: MatchMapIntelligenceFacts } {
  const contexts = createReplayRoundContexts(pkg);
  const performanceFacts = options.performanceFacts ?? buildPlayerRoundPerformanceFacts(pkg);
  return {
    tacticalRounds: extractTacticalRoundFactsWithContexts(pkg, options, contexts, performanceFacts),
    mapIntelligence: extractMapIntelligenceWithContexts(pkg, options, contexts, performanceFacts),
  };
}
