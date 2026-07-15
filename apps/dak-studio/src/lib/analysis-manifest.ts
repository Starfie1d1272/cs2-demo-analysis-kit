import { MAP_INTELLIGENCE_FACT_VERSION, TACTICAL_FACT_VERSION } from "@cs2dak/core";

/**
 * 分析能力的版本中枢：把 ZIP 合同、facts 存储布局和各 facts producer 分开记录。
 *
 * 两个维度决定一场 demo 的数据是否需要重建，对应两条不同代价的链路：
 * - `factsRevision` 不一致 → facts 派生口径或存储形状变了，从已持久化的 v3 ZIP **重榨 facts** 即可
 *   （不需要 .dem / cs2df，见 library.ts 的 rebuildFactsFromZip）。任一 facts 口径变更
 *   （新增"最佳闪光"等）都体现为对应 producer version 或 storage version 变化。
 * - `formatVersion` 落后 → v3 ZIP 合同变了，必须从 .dem 重新 export（reexportOne）。
 *
 * `appVersion` 经 vite define `__APP_VERSION__` 注入；node 测试环境无此 define，用 typeof
 * 守卫安全降级（不 import ./update，避免顶层 ReferenceError 拖累引用本模块的测试）。
 */

declare const __APP_VERSION__: string;

const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0-dev";

/** facts 行/命名空间布局版本；改变存储形状或键规则时递增。 */
export const FACTS_STORAGE_VERSION = 5;

/** 当前 facts producer 版本集合；新增 producer 时在此显式登记。 */
export const FACTS_PRODUCER_VERSIONS = {
  tactical: TACTICAL_FACT_VERSION,
  mapIntelligence: MAP_INTELLIGENCE_FACT_VERSION,
} as const;

/** 显式组合 storage version 与所有 producer versions，作为 facts 的唯一 revision。 */
export const FACTS_REVISION = [
  `storage:${FACTS_STORAGE_VERSION}`,
  ...Object.entries(FACTS_PRODUCER_VERSIONS)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, version]) => `${name}:${version}`),
].join("|");

export const ANALYSIS_MANIFEST = {
  /** v3 ZIP 合同；落后 → 需要从 .dem 重新 export（cs2df）。 */
  formatVersion: "cs2-demo-format/3.0",
  /** facts 存储与 producer revision；不一致 → 从已存 ZIP 重榨 facts 即可。 */
  factsRevision: FACTS_REVISION,
  /** 报告模板版本。 */
  reportVersion: 1,
  /** 桌面应用版本（vite define）。 */
  appVersion,
} as const;

export type AnalysisManifest = typeof ANALYSIS_MANIFEST;

/** 一场 demo 导入时记录的构建版本，用于判定 facts 是否旧口径。 */
export interface BuiltWith {
  formatVersion: string;
  factsRevision: string;
}

/** 用当前 manifest 标记构建版本（导入 / 重建 facts 时写入 entry）。 */
export function currentBuiltWith(): BuiltWith {
  return {
    formatVersion: ANALYSIS_MANIFEST.formatVersion,
    factsRevision: ANALYSIS_MANIFEST.factsRevision,
  };
}

/** facts 是否为旧口径：缺 builtWith 或 factsRevision 的历史条目一定 stale。 */
export function isAnalysisStale(builtWith: BuiltWith | null | undefined): boolean {
  return builtWith?.factsRevision !== ANALYSIS_MANIFEST.factsRevision;
}
