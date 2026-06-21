/**
 * Studio compatibility surface. Shared formulas live in core/cohort/presentation;
 * this module only preserves existing view imports until the UI refactor.
 */
import { displayTeamName } from "./identity.js";

export function withTacticalTeamIdentities<T extends { teamName: string; opponentName: string }>(
  rows: readonly T[],
  teamRenames: Record<string, string>,
): Array<T & { teamIdentity: string; opponentIdentity: string }> {
  const canonical = (name: string) => displayTeamName(name, teamRenames).trim().toLowerCase();
  return rows.map((row) => ({
    ...row,
    teamIdentity: canonical(row.teamName),
    opponentIdentity: canonical(row.opponentName),
  }));
}

export {
  advancedBasisKey,
  buildTacticalClusters,
  defaultAnchorSetKey,
  defaultsBasisKey,
  openingPatternKey,
  tacticalClusterKey,
  type TacticalCluster,
} from "@cs2dak/cohort";
export { formatTacticalClusterName as autoName } from "@cs2dak/presentation";
