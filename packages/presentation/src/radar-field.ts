/**
 * 雷达场渲染期合成 —— 把 RadarField 的原始计数归一化、按模式合成、可选差分。
 *
 * 纯函数，供 react 画布逐秒调用（scrubber）。底层四基础场不动，所有视图都是这里的派生：
 *   ctVis/tVis/ctPres/tPres = 归一化频率（计数 / 对应 side denom）
 *   info-diff = tVis − ctVis（T 信息优势暖 / CT 预警冷）
 *   contested = min(tVis, ctVis)（双方都看到 = 对拼线 / 真实交火点）
 * 给定 baseline（联赛场）则输出「队伍 − 联赛」偏移（队伍倾向 / 防守漏洞）。
 */
import type { RadarField, RadarFieldBase } from "@cs2dak/contract";

export type RadarFieldMode = RadarFieldBase | "info-diff" | "contested" | "ct-blind" | "t-blind";

export interface RadarModeOption {
  value: RadarFieldMode;
  label: string;
}

/** 模式选项与中文标签（沿用现有 UI 文案：视野 / 位置 / 信息差分 / 对拼线）。 */
export const RADAR_FIELD_MODES: RadarModeOption[] = [
  { value: "ctVis", label: "CT 视野" },
  { value: "tVis", label: "T 视野" },
  { value: "ctPres", label: "CT 位置" },
  { value: "tPres", label: "T 位置" },
  { value: "ct-blind", label: "CT 盲区" },
  { value: "t-blind", label: "T 盲区" },
  { value: "info-diff", label: "信息差分" },
  { value: "contested", label: "对拼线" },
];

/** 盲区阈值：该 side 视线覆盖频率低于此值的可行走格视为盲区，越低越严重。 */
const BLIND_GAP = 0.5;
const BLIND_MODES = new Set<RadarFieldMode>(["ct-blind", "t-blind"]);

/** 各模式的颜色强度归一化上限（与原型一致）。 */
const MODE_CAP: Record<RadarFieldMode, number> = {
  ctVis: 0.5,
  tVis: 0.5,
  ctPres: 0.3,
  tPres: 0.3,
  "info-diff": 0.4,
  contested: 0.3,
  "ct-blind": BLIND_GAP,
  "t-blind": BLIND_GAP,
};
const DELTA_CAP = 0.15;

export interface RadarModeFrame {
  /** 逐格渲染值。signed=false 时 ∈[0,cap]，signed=true 时为带符号偏移。 */
  values: Float64Array;
  /** true → 发散色（差分 / info-diff：暖=正 / 冷=负）；false → 顺序热力。 */
  signed: boolean;
  /** 颜色强度归一化上限。 */
  cap: number;
}

/** 某基础场在 [sec−window, sec+window] 的归一化频率（计数 / 对应 side denom）。 */
function freqAt(field: RadarField, base: RadarFieldBase, sec: number, window: number): Float64Array {
  const nCells = field.grid.cells.length;
  const out = new Float64Array(nCells);
  const denomArr = base === "ctVis" || base === "ctPres" ? field.denomCt : field.denomT;
  let denom = 0;
  const lo = Math.max(0, sec - window);
  const hi = Math.min(field.maxSec - 1, sec + window);
  for (let s = lo; s <= hi; s++) {
    denom += denomArr[s]!;
    const row = field.fields[base][s]!;
    for (let g = 0; g < nCells; g++) out[g]! += row[g]!;
  }
  if (denom > 0) for (let g = 0; g < nCells; g++) out[g]! /= denom;
  return out;
}

/** 单场在某模式下的逐格频率（未差分）。info-diff/contested 在此合成。 */
function modeFreq(field: RadarField, mode: RadarFieldMode, sec: number, window: number): Float64Array {
  if (mode === "info-diff") {
    const t = freqAt(field, "tVis", sec, window);
    const c = freqAt(field, "ctVis", sec, window);
    const out = new Float64Array(t.length);
    for (let g = 0; g < t.length; g++) out[g]! = t[g]! - c[g]!;
    return out;
  }
  if (mode === "contested") {
    const t = freqAt(field, "tVis", sec, window);
    const c = freqAt(field, "ctVis", sec, window);
    const out = new Float64Array(t.length);
    for (let g = 0; g < t.length; g++) out[g]! = Math.min(t[g]!, c[g]!);
    return out;
  }
  if (mode === "ct-blind" || mode === "t-blind") {
    // 绝对盲区：该 side 视线覆盖频率低于 BLIND_GAP 的可行走格，越低越亮。
    const vis = freqAt(field, mode === "ct-blind" ? "ctVis" : "tVis", sec, window);
    const out = new Float64Array(vis.length);
    for (let g = 0; g < vis.length; g++) out[g]! = Math.max(0, BLIND_GAP - vis[g]!);
    return out;
  }
  return freqAt(field, mode, sec, window);
}

/**
 * 合成某秒的渲染帧。baseline 非空 → 输出「队伍 − 联赛」偏移（signed）。
 * @param smoothWindow 时间平滑半窗（±N 秒），默认 ±2s。
 */
export function radarModeFrame(
  field: RadarField,
  baseline: RadarField | null,
  mode: RadarFieldMode,
  sec: number,
  smoothWindow = 2
): RadarModeFrame {
  const team = modeFreq(field, mode, sec, smoothWindow);
  // 盲区是绝对量（视线覆盖本身），不做队伍−联赛差分。
  if (!baseline || BLIND_MODES.has(mode)) {
    return { values: team, signed: mode === "info-diff", cap: MODE_CAP[mode] };
  }
  const base = modeFreq(baseline, mode, sec, smoothWindow);
  const out = new Float64Array(team.length);
  for (let g = 0; g < team.length; g++) out[g]! = team[g]! - base[g]!;
  return { values: out, signed: true, cap: DELTA_CAP };
}

/** scope 内长枪局回合数（展示用）；league=赛事总局，team=该队参与的局。 */
export function radarFieldRoundCount(field: RadarField): number {
  return field.scope.roundCount;
}
