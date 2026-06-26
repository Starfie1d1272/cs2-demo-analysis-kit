/**
 * 雷达场栅格 —— 由地图 nav 决定的确定性规则栅格（不由 demo 决定）。
 *
 * 同一地图任意 demo 算出同一套格、同序、同 index，所以两场场可逐元素相加/相减。
 * 格 = 把 nav area 质心按 cellSize 桶进规则格，只保留含 ≥1 质心的「可行走格」（稀疏）。
 * 每格代表点取桶内质心均值；z 不加靶高（靶高由 core 计算 LOS 时统一加，避免双份常量漂移）。
 */
import type { Vec3 } from "./nav.js";
import { getMapNav } from "./geometry-assets.js";

/** 默认格边长（世界单位）。callout-grid 是 10u 更细；覆盖场用 128u 控制格数 ~300。 */
export const RADAR_FIELD_CELL_SIZE = 128;

/** world→radar 标定版本；MAP_CALIBRATIONS 变动时手动 +1，使旧缓存场失效。 */
export const MAP_CALIBRATION_VERSION = "1";

export interface RadarFieldGridIndex {
  cellSize: number;
  /** 每格代表世界坐标 [x, y, z]，与 fields 列同序。 */
  cells: Array<[number, number, number]>;
  /** "gx,gy" → 列 index；compute 用玩家落点查所属格。 */
  keyToIndex: Map<string, number>;
}

function cellKey(x: number, y: number, cellSize: number): string {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
}

/**
 * 构建某图的雷达场栅格；无 nav 资产时返回 null（调用方降级）。
 * 结果对同一 (mapName, cellSize) 完全确定，可安全用于跨场合并。
 */
export function buildRadarFieldGrid(
  mapName: string,
  cellSize: number = RADAR_FIELD_CELL_SIZE
): RadarFieldGridIndex | null {
  const nav = getMapNav(mapName);
  if (!nav || nav.areas.length === 0) return null;

  const acc = new Map<string, { x: number; y: number; z: number; n: number }>();
  for (const area of nav.areas) {
    const c: Vec3 = area.centroid;
    const key = cellKey(c.x, c.y, cellSize);
    const e = acc.get(key) ?? { x: 0, y: 0, z: 0, n: 0 };
    e.x += c.x;
    e.y += c.y;
    e.z += c.z;
    e.n += 1;
    acc.set(key, e);
  }

  // 按 key 排序保证列序确定（跨场、跨进程一致）。
  const sorted = [...acc.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const cells: Array<[number, number, number]> = sorted.map(([, e]) => [
    e.x / e.n,
    e.y / e.n,
    e.z / e.n,
  ]);
  const keyToIndex = new Map(sorted.map(([key], i) => [key, i]));
  return { cellSize, cells, keyToIndex };
}

/** 玩家世界坐标 → 所属格列 index；不在任何可行走格内时 -1。 */
export function radarFieldCellAt(grid: RadarFieldGridIndex, x: number, y: number): number {
  return grid.keyToIndex.get(cellKey(x, y, grid.cellSize)) ?? -1;
}
