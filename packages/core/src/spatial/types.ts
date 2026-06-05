/**
 * 空间分析的共享类型（严格重建 SP1）。
 * 设计约束见 docs/design/rr-model.md §3。
 *
 * 两层结构：raw evidence（宽，复盘/shadow） → official gated features（窄，进 RR）。
 * 本文件定义 phase 模型与 raw evidence 的形状；official 派生在后续 sub-project。
 */

/** 回合阶段。official scoring 排除 freeze / save / exit（见 OFFICIAL_EXCLUDED_PHASES）。 */
export type RoundPhase =
  | "freeze"
  | "default"
  | "take"
  | "execute"
  | "postPlant"
  | "retake"
  | "save"
  | "exit"
  | "clutch";

/** save / exit / freeze 默认不进 official MapControl/UtilitySpatial（仍进 review 层）。 */
export const OFFICIAL_EXCLUDED_PHASES: ReadonlySet<RoundPhase> = new Set<RoundPhase>([
  "freeze",
  "save",
  "exit",
]);

export function isOfficialScoringPhase(phase: RoundPhase): boolean {
  return !OFFICIAL_EXCLUDED_PHASES.has(phase);
}

/**
 * 单回合的阶段关键 tick。phase 用 `phaseAtTick` 从这些边界派生，保持可序列化、无函数。
 *
 * MVP 覆盖：freeze / default / take / execute / postPlant / clutch（均可从
 * rounds + bombs + kills（+ 可选 positions/routes）确定性派生）。
 * retake / save / exit 留待后续细化——当前 postPlant 窗口对双方通用，
 * side-aware gate 自行区分 T 守包 vs CT retake。
 */
export interface RoundPhaseModel {
  roundNumber: number;
  startTick: number;
  freezeEndTick: number;
  endTick: number;
  /** 炸弹安放 tick；未安放为 null。 */
  plantTick: number | null;
  /** T 首次推进到出生区外（routeIndex ≥ 1）的 tick；无 positions/routes 时 null。 */
  takeTick: number | null;
  /** 多名 T 逼近包点入口或多颗进攻道具生效的 tick；无证据时 null。 */
  executeTick: number | null;
  /** 一方仅剩 1 人存活（另一方 ≥ 1）的首个 tick；未进入残局为 null。 */
  clutchStartTick: number | null;
  /** 阶段证据质量：positions/routes 是否可用（影响 take/execute 是否可信）。 */
  hasPositions: boolean;
  hasRoutes: boolean;
}
