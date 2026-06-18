/**
 * Studio compatibility surface. Shared formulas live in core/cohort/presentation;
 * this module only preserves existing view imports until the UI refactor.
 */
export {
  advancedBasisKey,
  buildTacticalClusters,
  defaultsBasisKey,
  openingPatternKey,
  tacticalClusterKey,
  type TacticalCluster,
} from "@cs2dak/cohort";
export { inferTacticalFake as suspectFake } from "@cs2dak/core";
export { formatTacticalClusterName as autoName } from "@cs2dak/presentation";
