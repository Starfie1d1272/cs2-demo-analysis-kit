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

export { MAP_INTELLIGENCE_FACT_VERSION } from "@cs2dak/contract";
export { OPENING_RESPONSIBILITY_SECONDS } from "./opening-window.js";
export type { MatchMapIntelligenceFacts, PlayerPositionRoundFact, TeamAwpRoundFact, TeamShapeRoundFact } from "@cs2dak/contract";

export interface ExtractMatchMapIntelligenceFactsOptions {
  matchId: string;
  calloutGrid?: CalloutGrid | null;
  nav?: CompactNav | null;
}

/**
 * Public compact-facts facade. Contexts exist only for this call and are never returned or persisted.
 */
export function extractMatchMapIntelligenceFacts(
  pkg: DemoPackage,
  options: ExtractMatchMapIntelligenceFactsOptions,
): MatchMapIntelligenceFacts {
  return extractMapIntelligenceWithContexts(pkg, options, createReplayRoundContexts(pkg));
}

function extractMapIntelligenceWithContexts(
  pkg: DemoPackage,
  options: ExtractMatchMapIntelligenceFactsOptions,
  contexts: ReadonlyMap<number, ReplayRoundContext>,
): MatchMapIntelligenceFacts {
  const nav = options.nav === undefined ? getMapNav(pkg.match.mapName) : options.nav;
  const playerPositionRounds = [];
  const teamShapeRounds = [];
  const teamAwpRounds = [];
  for (const round of pkg.rounds) {
    const context = contexts.get(round.roundNumber) ?? null;
    const frames = context ? buildRoundSpatialFrames(context, options.calloutGrid ?? null, nav) : [];
    const positionRows = extractPlayerPositionRoundFacts(pkg, options.matchId, context, round, frames, options.calloutGrid ?? null, nav != null);
    playerPositionRounds.push(...positionRows);
    teamShapeRounds.push(...extractTeamShapeRoundFacts(pkg, options.matchId, context, round, frames, options.calloutGrid ?? null, nav != null));
    teamAwpRounds.push(...extractTeamAwpRoundFacts(pkg, options.matchId, context, positionRows));
  }
  return matchMapIntelligenceFactsSchema.parse({ analysisVersion: MAP_INTELLIGENCE_FACT_VERSION, matchId: options.matchId, mapName: pkg.match.mapName, playerPositionRounds, teamShapeRounds, teamAwpRounds });
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
  return {
    tacticalRounds: extractTacticalRoundFactsWithContexts(pkg, options, contexts),
    mapIntelligence: extractMapIntelligenceWithContexts(pkg, options, contexts),
  };
}
