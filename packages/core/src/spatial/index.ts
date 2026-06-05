/**
 * 空间分析（严格重建）。两层：raw evidence（宽，复盘/shadow） → official gated（窄，进 RR）。
 * 设计与边界见 docs/design/rr-model.md §3。
 *
 * SP1（已落地）：RoundPhase 模型 + 位置标注地基。
 * SP2/SP3（计划）：official MapControl / UtilitySpatial gates + strategicIsolationDeathCredits。
 */
export type { RoundPhase, RoundPhaseModel } from "./types.js";
export { OFFICIAL_EXCLUDED_PHASES, isOfficialScoringPhase } from "./types.js";
export { inferRoundPhases, phaseAtTick } from "./phase.js";
export type { SpatialAssets, AnnotatedSample } from "./annotate.js";
export { loadSpatialAssets, annotatePositions, groupSamplesByRoundTick } from "./annotate.js";
