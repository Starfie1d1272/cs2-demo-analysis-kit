/**
 * RadarField —— 雷达覆盖场合同（描述性地图控制原语）。
 *
 * 「基础场」逐秒 × 逐格存原始计数（不存概率、不存合成视图），因为原始计数是
 * 加性的：合并两个 scope = 四场逐元素相加 + denom 相加。这一条承重墙撑起 per-match
 * 缓存、scope 聚合、队伍−联赛差分、未来价值学习——全是廉价派生。
 *
 * 归一化（count / denom = 该秒该格被看到/占据/听到的采样占比）、信息差分（tVis−ctVis）、
 * 对拼线（min(tVis,ctVis)）、推进波前都在渲染期合成，底层场不污染。
 *
 * 这是 TS 侧计算产物，不跨 Python↔TS 的 v3 ZIP seam，故用手写 interface（非 Zod）。
 * 字段列用 Int32Array：结构化克隆（worker postMessage / IndexedDB）下紧凑且无损。
 */

/**
 * 基础场名。
 * Vis = 4:3 屏幕可见（矩形视锥 ∩ LOS ∩ 烟）；Aim = 准星/注意力覆盖（30°圆锥 ∩ LOS ∩ 烟）；
 * Pres = 位置占据（最近 nav 格，无 LOS）；Sound = 在该格发声会被对面听到的风险（800u 半径）。
 */
export type RadarFieldBase =
  | "ctVis" | "tVis"
  | "ctAim" | "tAim"
  | "ctPres" | "tPres"
  | "ctSound" | "tSound";

export const RADAR_FIELD_BASES: readonly RadarFieldBase[] = [
  "ctVis", "tVis",
  "ctAim", "tAim",
  "ctPres", "tPres",
  "ctSound", "tSound",
] as const;

export interface RadarFieldGrid {
  /** 规则栅格边长（世界单位）。 */
  cellSize: number;
  /** 每格代表世界坐标 [x, y, z]（z 已含靶高），与 fields 列同序。 */
  cells: Array<[number, number, number]>;
}

export interface RadarFieldScope {
  /** league = 赛事/当前范围基线；team = 单队（identity 归并后的显示名）。 */
  kind: "league" | "team";
  team: string | null;
  /** gun = 长枪局（双方 full/conversion）；all = 全部回合。 */
  economy: "gun" | "all";
  /** 贡献的回合总数（含全部采样秒之前的回合计数）。 */
  roundCount: number;
  matchIds: string[];
}

export interface RadarField {
  /** 合同结构版本。 */
  schemaVersion: number;
  /** 算法参数指纹（锥角/采样率/格大小/眼高变了即 +1）；驱动缓存失效。 */
  computeVersion: number;
  mapName: string;
  /** world→radar 标定版本；变了不可与旧场合并/差分。 */
  calibrationVersion: string;
  /** full = 这批 LOS 射线可信（有 .tri）；none = 只有锥+烟，无墙体遮挡，不可与 full 互比。 */
  triAvailability: "full" | "none";
  scope: RadarFieldScope;
  grid: RadarFieldGrid;
  /** 采样秒上界（一回合 1:55 = 115s）。 */
  maxSec: number;
  /**
   * 归一化分母，按 source side 分。当前计算每秒采样一次：
   * denomCt[sec] = scope 内、CT 侧、到达该秒的 side-frame 数；ct* 基础场除以它。
   * denomT 同理给 t* 基础场。
   */
  denomCt: Int32Array;
  denomT: Int32Array;
  /** fields[base][sec] = Int32Array(cells.length) 原始计数。 */
  fields: Record<RadarFieldBase, Int32Array[]>;
}

export const RADAR_FIELD_SCHEMA_VERSION = 1;

/** 一回合 1:55 = 115s（freeze 后逐秒采样窗，含残局/换防段；已实证）。 */
export const RADAR_FIELD_MAX_SEC = 115;
