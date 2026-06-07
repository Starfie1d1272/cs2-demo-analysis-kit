export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AwpyNavArea {
  area_id: number;
  hull_index: number;
  dynamic_attribute_flags: number;
  corners: Vec3[];
  connections: number[];
  ladders_above: number[];
  ladders_below: number[];
}

export interface AwpyNav {
  version: number;
  sub_version: number;
  is_analyzed: boolean;
  areas: Record<string | number, AwpyNavArea>;
}

export interface CompactNavArea {
  id: number;
  corners: Vec3[];
  centroid: Vec3;
  neighbors: number[];
}

export interface CompactNav {
  mapName: string;
  buildId: number;
  sourceFormat: {
    version: number;
    subVersion: number;
  };
  areas: CompactNavArea[];
}

export function deriveCompactNav(mapName: string, buildId: number, source: AwpyNav): CompactNav {
  const sourceAreas = Object.values(source.areas);
  const knownIds = new Set(sourceAreas.map((area) => area.area_id));

  return {
    mapName,
    buildId,
    sourceFormat: {
      version: source.version,
      subVersion: source.sub_version,
    },
    areas: sourceAreas.map((area) => ({
      id: area.area_id,
      corners: area.corners,
      centroid: centroid(area.corners),
      neighbors: [...new Set(area.connections)].filter((id) => knownIds.has(id)),
    })),
  };
}

export function findNavPath(nav: CompactNav, startId: number, endId: number): number[] {
  if (startId === endId) return nav.areas.some((area) => area.id === startId) ? [startId] : [];

  const byId = new Map(nav.areas.map((area) => [area.id, area]));
  if (!byId.has(startId) || !byId.has(endId)) return [];

  const queue = [startId];
  const previous = new Map<number, number | null>([[startId, null]]);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    for (const neighbor of byId.get(current)!.neighbors) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, current);
      if (neighbor === endId) return reconstructPath(previous, endId);
      queue.push(neighbor);
    }
  }

  return [];
}

export function nearestNavArea(nav: CompactNav, point: Vec3): CompactNavArea | undefined {
  let bestContaining: CompactNavArea | undefined;
  let bestContainingZ = Number.POSITIVE_INFINITY;

  for (const area of nav.areas) {
    if (!pointInPolygon(point, area.corners)) continue;
    const zDistance = Math.abs(point.z - area.centroid.z);
    if (zDistance < bestContainingZ) {
      bestContaining = area;
      bestContainingZ = zDistance;
    }
  }
  if (bestContaining) return bestContaining;

  let nearest: CompactNavArea | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const area of nav.areas) {
    const distance = squaredDistance(point, area.centroid);
    if (distance < nearestDistance) {
      nearest = area;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export interface NavZCluster {
  min: number;
  max: number;
  median: number;
  count: number;
}

export interface NavZSample {
  /** 落在 polygon 内的 nav area Z 质心列表（已排序）。 */
  zValues: number[];
  min: number;
  max: number;
  median: number;
  /**
   * 按 Z 间距自动分组的簇（默认间距阈值 50 units）。
   * 相邻簇之间的间隙就是 zMin/zMax 边界的自然分割点。
   * 单层区域通常只有 1 个簇；Hut/HutRoof 这类重叠区域会出现 2 个簇。
   */
  clusters: NavZCluster[];
}

/**
 * 采样 XY polygon 内所有 nav area 的 Z 质心，返回分布统计。
 *
 * polygon 使用世界坐标 XY（与 MapZone.polygon 同系）。
 * 返回 null 表示 polygon 内无 nav area 覆盖（坐标系不匹配或地图未标定）。
 *
 * 用途：标定重叠 callout 的 zMin/zMax 时，查看 clusters 找到簇间间隙，
 * 把间隙中点作为边界值填入 MapZone。不要用 median 直接作为 zMin/zMax。
 */
export function sampleNavZ(
  nav: CompactNav,
  polygon: Array<[number, number]>,
  clusterGapThreshold = 50,
  zFilter?: { zMin?: number; zMax?: number },
): NavZSample | null {
  const zValues: number[] = [];
  for (const area of nav.areas) {
    const { x, y, z } = area.centroid;
    if (zFilter?.zMin !== undefined && z < zFilter.zMin) continue;
    if (zFilter?.zMax !== undefined && z > zFilter.zMax) continue;
    if (pointInPolygon2d(x, y, polygon)) zValues.push(z);
  }
  if (zValues.length === 0) return null;
  zValues.sort((a, b) => a - b);

  const min = zValues[0]!;
  const max = zValues[zValues.length - 1]!;
  const median = zValues[Math.floor(zValues.length / 2)]!;
  return { zValues, min, max, median, clusters: detectClusters(zValues, clusterGapThreshold) };
}

function pointInPolygon2d(x: number, y: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function detectClusters(sortedZ: number[], gapThreshold: number): NavZCluster[] {
  if (sortedZ.length === 0) return [];
  const clusters: NavZCluster[] = [];
  let start = 0;
  for (let i = 1; i <= sortedZ.length; i += 1) {
    if (i < sortedZ.length && sortedZ[i]! - sortedZ[i - 1]! <= gapThreshold) continue;
    const slice = sortedZ.slice(start, i);
    clusters.push({
      min: slice[0]!,
      max: slice[slice.length - 1]!,
      median: slice[Math.floor(slice.length / 2)]!,
      count: slice.length,
    });
    start = i;
  }
  return clusters;
}

function centroid(points: Vec3[]): Vec3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }),
    { x: 0, y: 0, z: 0 },
  );
  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  };
}

function pointInPolygon(point: Vec3, polygon: Vec3[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const current = polygon[i]!;
    const previous = polygon[j]!;
    const crosses =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function squaredDistance(a: Vec3, b: Vec3): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

function reconstructPath(previous: Map<number, number | null>, endId: number): number[] {
  const path: number[] = [];
  let current: number | null = endId;
  while (current !== null) {
    path.push(current);
    current = previous.get(current) ?? null;
  }
  return path.reverse();
}
