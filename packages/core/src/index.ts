import { analysisBundleSchema, type AnalysisBundle } from "@cs2dak/contract";
import { normalizeDemoPackage } from "./normalize.js";
import { buildQaReport } from "./qa.js";
import { buildPlayerRoundFacts, buildPlayerIndicators, buildScoreboard } from "./scoreboard.js";
import { computeAccountRatingsV2 } from "./signals.js";
import { buildTimeline, buildEconomy, buildHeatmap } from "./timeline.js";

export { loadDemoPackageFromZip } from "./loader.js";
export { normalizeDemoPackage } from "./normalize.js";
export { deriveAccountSignalsV2, computeAccountRatingsV2 } from "./signals.js";
export { deriveRRIndicators } from "./scoreboard.js";
export { buildDemoViewModel, buildMatchWorkspaceModel } from "./workspace.js";
export { displayWeaponName } from "./weapons.js";

export function analyzeDemoPackage(input: unknown): AnalysisBundle {
  const pkg = normalizeDemoPackage(input);
  const qa = buildQaReport(pkg);
  const playerRoundFacts = buildPlayerRoundFacts(pkg);
  const playerIndicators = buildPlayerIndicators(pkg, playerRoundFacts);
  const accountRatings = computeAccountRatingsV2(pkg);
  const scoreboard = buildScoreboard(pkg, playerIndicators, accountRatings);
  const timeline = buildTimeline(pkg);
  const economy = buildEconomy(pkg);
  const heatmap = buildHeatmap(pkg);

  return analysisBundleSchema.parse({
    version: "cs2-demo-analysis-kit/0.2",
    sourceSchemaVersion: pkg.manifest.schemaVersion,
    mapName: pkg.match.mapName,
    tickrate: pkg.match.tickrate,
    teams: {
      teamA: { name: pkg.match.teamA.name ?? "Team A", score: pkg.match.teamA.score },
      teamB: { name: pkg.match.teamB.name ?? "Team B", score: pkg.match.teamB.score }
    },
    scoreboard,
    playerIndicators,
    playerRoundFacts,
    timeline,
    economy,
    heatmap,
    qa
  });
}
