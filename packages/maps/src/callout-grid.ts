/**
 * callout-grid — 3D 多数表决查找表。
 *
 * 来源：110 场 demo（pro 51 + NJU 59）replay 8Hz 流的 (x,y,z) + place 字段，
 *       按 10-unit 3D 格点多数表决归纳得到。
 * 生成：scripts/build-callout-grid.py
 *
 * 核心是纯函数 calloutAt()/calloutNear()，无平台依赖。
 */
import type { Vec3 } from "./nav.js";

// ── 类型 ──

export interface CalloutGridMeta {
  mapName: string;
  gridSize: number;
  origin: [number, number, number];
  maxCoord: [number, number, number];
  dims: [number, number, number];
  vocabulary: string[];
  confidence: number;
  minSamples: number;
}

export type CalloutGridCell = [
  vocabularyIndex: number,
  confidence: number,
  samples: number,
];

export interface CalloutGrid extends CalloutGridMeta {
  /**
   * "gx,gy,gz" → [vocabularyIndex, confidence, sampleCount]
   * vocabularyIndex -> vocabulary[] 查 callout 名
   * confidence -> [0, 1] 多数占比
   * sampleCount -> 该格总采样帧数
   */
  cells: Record<string, CalloutGridCell>;
}

export interface CalloutAtResult {
  callout: string;
  confidence: number;
  samples: number;
  source: "exact";
  distance: 0;
  offset: [number, number, number];
}

export interface CalloutNearResult {
  callout: string;
  confidence: number;
  samples: number;
  source: "exact" | "nearby";
  distance: number;
  offset: [number, number, number];
}

export interface CalloutNearOptions {
  horizontalRadius?: number;
  verticalRadius?: number;
}

// ── 核心查询（纯函数，浏览器/Node 通用） ──

function gridCoord(value: number, gridSize: number): number {
  return Math.floor(value / gridSize) * gridSize;
}

function cellAt(grid: CalloutGrid, gx: number, gy: number, gz: number): CalloutNearResult | null {
  const cell = grid.cells[`${gx},${gy},${gz}`];
  if (!cell) return null;
  const callout = grid.vocabulary[cell[0]];
  if (!callout) return null;
  return {
    callout,
    confidence: cell[1],
    samples: cell[2],
    source: "exact",
    distance: 0,
    offset: [0, 0, 0],
  };
}

/**
 * 查询一个世界坐标对应的 callout 名。
 * 返回 null 表示该格无数据（不可达区域 / 置信度不足 / 稀疏不足）。
 *
 * @param grid   通过 loadCalloutGrid() 或 fetch() 获取的网格对象
 * @param point  世界坐标（v3 replay position 同系）
 */
export function calloutAt(
  grid: CalloutGrid,
  point: Vec3,
): CalloutAtResult | null {
  const result = cellAt(
    grid,
    gridCoord(point.x, grid.gridSize),
    gridCoord(point.y, grid.gridSize),
    gridCoord(point.z, grid.gridSize),
  );
  return result && result.source === "exact"
    ? { ...result, source: "exact", distance: 0, offset: [0, 0, 0] }
    : null;
}

/**
 * 查询世界坐标附近的 callout。
 *
 * 道具落点常在空中、墙边或不可站立格，精确格可能没有玩家采样。此函数先做精确
 * 命中；失败后在半径内查邻近格，优先同层/下方近格，再按距离、置信度、样本数排序。
 */
export function calloutNear(
  grid: CalloutGrid,
  point: Vec3,
  options: CalloutNearOptions = {},
): CalloutNearResult | null {
  const gx = gridCoord(point.x, grid.gridSize);
  const gy = gridCoord(point.y, grid.gridSize);
  const gz = gridCoord(point.z, grid.gridSize);
  const exact = cellAt(grid, gx, gy, gz);
  if (exact) return exact;

  const horizontalRadius = options.horizontalRadius ?? 20;
  const verticalRadius = options.verticalRadius ?? 40;
  const hSteps = Math.max(0, Math.ceil(horizontalRadius / grid.gridSize));
  const zSteps = Math.max(0, Math.ceil(verticalRadius / grid.gridSize));
  const candidates: CalloutNearResult[] = [];

  for (let dx = -hSteps; dx <= hSteps; dx += 1) {
    for (let dy = -hSteps; dy <= hSteps; dy += 1) {
      for (let dz = -zSteps; dz <= zSteps; dz += 1) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const ox = dx * grid.gridSize;
        const oy = dy * grid.gridSize;
        const oz = dz * grid.gridSize;
        const horizontalDistance = Math.hypot(ox, oy);
        if (horizontalDistance > horizontalRadius) continue;
        if (Math.abs(oz) > verticalRadius) continue;
        const cell = cellAt(grid, gx + ox, gy + oy, gz + oz);
        if (!cell) continue;
        candidates.push({
          ...cell,
          source: "nearby",
          distance: Math.hypot(ox, oy, oz),
          offset: [ox, oy, oz],
        });
      }
    }
  }

  candidates.sort((a, b) => {
    const zPrefA = zPreference(a.offset[2]);
    const zPrefB = zPreference(b.offset[2]);
    return zPrefA - zPrefB ||
      a.distance - b.distance ||
      b.confidence - a.confidence ||
      b.samples - a.samples ||
      a.callout.localeCompare(b.callout);
  });
  return candidates[0] ?? null;
}

function zPreference(offsetZ: number): number {
  if (offsetZ === 0) return 0;
  if (offsetZ < 0) return 1;
  return 2;
}
