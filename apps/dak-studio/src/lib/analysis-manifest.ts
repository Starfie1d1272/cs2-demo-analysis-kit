import { TACTICAL_FACT_VERSION } from "@cs2dak/core";

/**
 * 分析能力的版本中枢：收敛此前散落的派生版本号（仅有的 TACTICAL_FACT_VERSION）。
 *
 * 两个维度决定一场 demo 的数据是否需要重建，对应两条不同代价的链路：
 * - `analysisVersion` 落后 → facts 派生口径变了，从已持久化的 v3 ZIP **重榨 facts** 即可
 *   （不需要 .dem / cs2df，见 library.ts 的 rebuildFactsFromZip）。任一 facts 口径变更
 *   （新增"最佳闪光"等）都体现为 TACTICAL_FACT_VERSION +1，本字段自动跟随。
 * - `formatVersion` 落后 → v3 ZIP 合同变了，必须从 .dem 重新 export（reexportOne）。
 *
 * `appVersion` 经 vite define `__APP_VERSION__` 注入；node 测试环境无此 define，用 typeof
 * 守卫安全降级（不 import ./update，避免顶层 ReferenceError 拖累引用本模块的测试）。
 */

declare const __APP_VERSION__: string;

const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0-dev";

export const ANALYSIS_MANIFEST = {
  /** v3 ZIP 合同；落后 → 需要从 .dem 重新 export（cs2df）。 */
  formatVersion: "cs2-demo-format/3.0",
  /** facts 派生口径；落后 → 从已存 ZIP 重榨 facts 即可。 */
  analysisVersion: TACTICAL_FACT_VERSION,
  /** 报告模板版本。 */
  reportVersion: 1,
  /** 桌面应用版本（vite define）。 */
  appVersion,
} as const;

export type AnalysisManifest = typeof ANALYSIS_MANIFEST;

/** 一场 demo 导入时记录的构建版本，用于判定 facts 是否旧口径。 */
export interface BuiltWith {
  analysisVersion: number;
  formatVersion: string;
}

/** 用当前 manifest 标记构建版本（导入 / 重建 facts 时写入 entry）。 */
export function currentBuiltWith(): BuiltWith {
  return {
    analysisVersion: ANALYSIS_MANIFEST.analysisVersion,
    formatVersion: ANALYSIS_MANIFEST.formatVersion,
  };
}

/** facts 是否为旧口径：缺 builtWith 的历史条目视为 analysisVersion 0（一定 stale）。 */
export function isAnalysisStale(builtWith: BuiltWith | null | undefined): boolean {
  return (builtWith?.analysisVersion ?? 0) < ANALYSIS_MANIFEST.analysisVersion;
}
