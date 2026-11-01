/**
 * UtilitySpatial 几何地基（SP3 v2）。纯几何 + nav 拓扑，可独立单测，不依赖 demo。
 * 供烟雾视线封锁（segment-sphere）与烟雾隔离（nav 绕路代价）使用。
 */
import type { CompactNav, MapZone, Vec3 } from "@cs2dak/maps";

/** CS2 道具有效半径（世界单位，近似）。烟雾球 ~144、火焰面 ~150。 */
export const SMOKE_RADIUS = 144;
export const FIRE_RADIUS = 150;

/** 线段 AB 是否穿过以 center 为心、radius 为半径的球（即最近点距离 < radius）。 */
export function segmentSphereIntersects(a: Vec3, b: Vec3, center: Vec3, radius: number): boolean {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = center.x - a.x, apy = center.y - a.y, apz = center.z - a.z;
  const abLen2 = abx * abx + aby * aby + abz * abz;
  let t = abLen2 > 0 ? (apx * abx + apy * aby + apz * abz) / abLen2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t, cy = a.y + aby * t, cz = a.z + abz * t;
  const dx = center.x - cx, dy = center.y - cy, dz = center.z - cz;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

/** 多边形质心（XY，世界坐标）。退化时回退到顶点平均。 */
export function polygonCentroid(zone: MapZone): { x: number; y: number } {
  const p = zone.polygon;
  let area = 0, cx = 0, cy = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i]!;
    const [xj, yj] = p[j]!;
    const cross = xj * yi - xi * yj;
    area += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    const n = p.length || 1;
    return { x: p.reduce((s, q) => s + q[0], 0) / n, y: p.reduce((s, q) => s + q[1], 0) / n };
  }
  area *= 0.5;
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/** nav 索引：id → area，邻接 + 质心，供 Dijkstra 复用（避免每次线性扫）。 */
export interface NavIndex {
  byId: Map<number, { centroid: Vec3; neighbors: number[] }>;
}

export function buildNavIndex(nav: CompactNav): NavIndex {
  const byId = new Map<number, { centroid: Vec3; neighbors: number[] }>();
  for (const area of nav.areas) {
    byId.set(area.id, { centroid: area.centroid, neighbors: area.neighbors });
  }
  return byId.size ? { byId } : { byId };
}

/** 最近 nav area id（按质心欧氏距离）。 */
export function nearestAreaId(index: NavIndex, point: Vec3): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const [id, a] of index.byId) {
    const dx = a.centroid.x - point.x, dy = a.centroid.y - point.y, dz = a.centroid.z - point.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

/** 质心落在 center 半径内的 nav area 集合（烟/火覆盖的可达区域）。 */
export function areasWithinRadius(index: NavIndex, center: Vec3, radius: number): Set<number> {
  const out = new Set<number>();
  const r2 = radius * radius;
  for (const [id, a] of index.byId) {
    const dx = a.centroid.x - center.x, dy = a.centroid.y - center.y, dz = a.centroid.z - center.z;
    if (dx * dx + dy * dy + dz * dz <= r2) out.add(id);
  }
  return out;
}

/**
 * nav 最短路径代价（沿邻接、质心欧氏距离加权的 Dijkstra），可屏蔽 blocked 区域。
 * 不可达 / 起终点被屏蔽 → 返回 null。
 */
export function navPathCost(
  index: NavIndex,
  startId: number,
  endId: number,
  blocked?: ReadonlySet<number>,
): number | null {
  if (blocked?.has(startId) || blocked?.has(endId)) return null;
  if (startId === endId) return 0;
  const dist = new Map<number, number>([[startId, 0]]);
  const heap = new MinHeap();
  heap.push(startId, 0);
  while (heap.size > 0) {
    const { id, cost } = heap.pop()!;
    if (id === endId) return cost;
    if (cost > (dist.get(id) ?? Infinity)) continue;
    const area = index.byId.get(id);
    if (!area) continue;
    for (const nb of area.neighbors) {
      if (blocked?.has(nb)) continue;
      const nbArea = index.byId.get(nb);
      if (!nbArea) continue;
      const dx = nbArea.centroid.x - area.centroid.x;
      const dy = nbArea.centroid.y - area.centroid.y;
      const dz = nbArea.centroid.z - area.centroid.z;
      const w = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const nd = cost + w;
      if (nd < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, nd);
        heap.push(nb, nd);
      }
    }
  }
  return null;
}

/** 烟雾绕路代价：屏蔽烟覆盖的 nav 区域后，enemy→objective 多走多少（≤0 表示无影响）。 */
export function smokeDetourCost(
  index: NavIndex,
  enemyAreaId: number,
  objectiveAreaId: number,
  smokeBlocked: ReadonlySet<number>,
): number {
  const base = navPathCost(index, enemyAreaId, objectiveAreaId);
  if (base == null) return 0;
  const blockedCost = navPathCost(index, enemyAreaId, objectiveAreaId, smokeBlocked);
  if (blockedCost == null) return base; // 烟把唯一路径彻底切断 → 全额计
  return Math.max(0, blockedCost - base);
}

/** 极简二叉堆（id + cost）。 */
class MinHeap {
  private heap: Array<{ id: number; cost: number }> = [];
  get size(): number { return this.heap.length; }
  push(id: number, cost: number): void {
    const h = this.heap;
    h.push({ id, cost });
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p]!.cost <= h[i]!.cost) break;
      [h[p], h[i]] = [h[i]!, h[p]!];
      i = p;
    }
  }
  pop(): { id: number; cost: number } | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < h.length && h[l]!.cost < h[s]!.cost) s = l;
        if (r < h.length && h[r]!.cost < h[s]!.cost) s = r;
        if (s === i) break;
        [h[s], h[i]] = [h[i]!, h[s]!];
        i = s;
      }
    }
    return top;
  }
}
