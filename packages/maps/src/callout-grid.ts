/**
 * callout-grid — 3D 多数表决查找表。
 *
 * 来源：110 场 demo（pro 51 + NJU 59）replay 8Hz 流的 (x,y,z) + place 字段，
 *       按 10-unit 3D 格点多数表决归纳得到。
 * 生成：scripts/build-callout-grid.py
 *
 * 核心是纯函数 calloutAt()，无平台依赖。
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

export interface CalloutGrid extends CalloutGridMeta {
  /**
   * "gx,gy,gz" → [vocabularyIndex, confidence, sampleCount]
   * vocabularyIndex -> vocabulary[] 查 callout 名
   * confidence -> [0, 1] 多数占比
   * sampleCount -> 该格总采样帧数
   */
  cells: Record<string, number[]>;
}

export interface CalloutAtResult {
  callout: string;
  confidence: number;
  samples: number;
}

// ── 核心查询（纯函数，浏览器/Node 通用） ──

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
  const gx = Math.floor(point.x / grid.gridSize) * grid.gridSize;
  const gy = Math.floor(point.y / grid.gridSize) * grid.gridSize;
  const gz = Math.floor(point.z / grid.gridSize) * grid.gridSize;
  const key = `${gx},${gy},${gz}`;
  const cell = grid.cells[key];
  if (!cell) return null;
  return { callout: grid.vocabulary[cell[0]], confidence: cell[1], samples: cell[2] };
}
