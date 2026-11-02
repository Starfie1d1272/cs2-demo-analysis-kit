import type { DemoPackage } from "@cs2dak/contract";
import type { CalloutGrid, TriangleBvh } from "@cs2dak/maps";
import { normalizeDemoPackage, buildPlayerRoundPerformanceFacts, aggregatePlayerRoundPerformanceFacts, derivePlayerWeaponHighlights, observedTournamentIdentity, type TournamentIdentity } from "@cs2dak/core";
import { deriveRRSignals, deriveRRIndicators, buildOpeningTrails, extractPlayerMatchInsightFacts, buildUtilityValueSummary, extractDuelInsightsFacts, extractTeamComparisonFacts, extractTournamentFacts, buildRatingSpatialContext } from "@cs2dak/analytics";
import { derivePlayerMechanics, extractMatchTacticalAndMapIntelligenceFacts, extractMatchLineupObservations } from "@cs2dak/tactics";

export interface AnalyzeMatchFactsOptions { matchId: string; tournamentIdentity?: TournamentIdentity; calloutGrid?: CalloutGrid | null; visibility?: TriangleBvh | null }
export function analyzeMatchFacts(input: DemoPackage, options: AnalyzeMatchFactsOptions) {
  const pkg = normalizeDemoPackage(input);
  const performanceFacts = buildPlayerRoundPerformanceFacts(pkg);
  const source = { matchId: options.matchId, pkg, performanceFacts, tournamentIdentity: options.tournamentIdentity ?? observedTournamentIdentity(options.matchId, pkg.players) };
  return {
    matchId: options.matchId, mapName: pkg.match.mapName,
    performance: [...aggregatePlayerRoundPerformanceFacts(performanceFacts).values()],
    rrSignals: deriveRRSignals(pkg, performanceFacts, buildRatingSpatialContext(pkg)),
    rrIndicators: deriveRRIndicators(pkg, performanceFacts),
    weaponHighlights: derivePlayerWeaponHighlights(pkg, performanceFacts),
    mechanics: derivePlayerMechanics(pkg, { visibility: options.visibility ?? null }),
    lineups: extractMatchLineupObservations(pkg, options),
    tactical: extractMatchTacticalAndMapIntelligenceFacts(pkg, { matchId: options.matchId, calloutGrid: options.calloutGrid, performanceFacts }),
    playerInsights: extractPlayerMatchInsightFacts(source),
    openingTrails: pkg.players.map(player => ({ steamId64: player.steamId64, row: buildOpeningTrails(pkg, options.matchId, player.steamId64, { windowSeconds: 30 }) })),
    tournament: extractTournamentFacts(source), teamComparison: extractTeamComparisonFacts(source),
    duels: extractDuelInsightsFacts(source, { visibilityFor: () => options.visibility ?? null }),
    utilityValue: buildUtilityValueSummary([source], pkg.players.map(player => ({ playerKey: `steam:${player.steamId64}`, name: player.name, steamIds: [player.steamId64] }))),
  };
}
export type MatchFactsAnalysis = ReturnType<typeof analyzeMatchFacts>;
