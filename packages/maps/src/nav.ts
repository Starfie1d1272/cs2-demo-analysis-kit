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
