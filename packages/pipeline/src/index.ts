import type { DemoViewOptions, MatchWorkspaceModel } from "@cs2dak/presentation";
import { analyzeDemoPackage, buildPlayerRoundPerformanceFacts, normalizeDemoPackage } from "@cs2dak/core";
import { buildMatchWorkspaceFromAnalysis } from "@cs2dak/analytics";

/** Execute the single-match analysis before projecting the UI model. */
export function analyzeMatchWorkspace(input: unknown, options: DemoViewOptions = {}): MatchWorkspaceModel {
  const pkg = normalizeDemoPackage(input);
  const facts = buildPlayerRoundPerformanceFacts(pkg);
  const analysis = analyzeDemoPackage(pkg, facts);
  return buildMatchWorkspaceFromAnalysis(pkg, analysis, facts, options);
}
