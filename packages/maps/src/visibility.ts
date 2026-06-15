import type { Vec3 } from "./nav.js";

export type { Vec3 } from "./nav.js";

export interface Triangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
}

interface Bounds {
  min: Vec3;
  max: Vec3;
}

export interface TriangleBvh {
  bounds: Bounds;
  left?: TriangleBvh;
  right?: TriangleBvh;
  triangles?: Triangle[];
}

const TRIANGLE_BYTES = 9 * Float32Array.BYTES_PER_ELEMENT;
const LEAF_SIZE = 16;
const EPSILON = 1e-7;

export function parseAwpyTri(input: ArrayBuffer | Uint8Array): Triangle[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength % TRIANGLE_BYTES !== 0) {
    throw new Error(`Invalid awpy triangle stream: ${bytes.byteLength} bytes`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangles: Triangle[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += TRIANGLE_BYTES) {
    const point = (base: number): Vec3 => ({
      x: view.getFloat32(offset + base, true),
      y: view.getFloat32(offset + base + 4, true),
      z: view.getFloat32(offset + base + 8, true),
    });
    triangles.push({ a: point(0), b: point(12), c: point(24) });
  }
  return triangles;
}

/** 三角形 + 预计算质心；建树时避免在 sort 比较器里反复算质心并分配 Vec3。 */
interface CentroidTriangle {
  tri: Triangle;
  c: Vec3;
}

export function buildTriangleBvh(triangles: Triangle[]): TriangleBvh {
  if (triangles.length === 0) throw new Error("Cannot build a BVH without triangles");
  // 质心只算一次（旧实现在每层 sort 比较器里重算并 new Vec3，百万三角形下产生
  // 数千万次冗余计算与分配）。建树拓扑、分裂点与叶子内容完全不变。
  const items = triangles.map((tri) => ({ tri, c: triangleCentroid(tri) }));
  return buildNode(items);
}

export function staticLineOfSight(root: TriangleBvh, start: Vec3, end: Vec3): boolean {
  return !segmentHitsNode(root, start, end);
}

function buildNode(items: CentroidTriangle[]): TriangleBvh {
  const bounds = boundsForCentroidTriangles(items);
  if (items.length <= LEAF_SIZE) return { bounds, triangles: items.map((item) => item.tri) };

  const axis = largestAxis(bounds);
  // 只需把中位数选到 middle 处（左半 ≤、右半 ≥），无需整层全排序：
  // quickselect 让建树从 O(n log²n) 降到 O(n log n)。LOS 与树结构无关
  // （每个节点按实际三角形重算 bounds，叶子全量求交），任何合法划分结果都等价。
  const middle = items.length >> 1;
  nthElement(items, middle, axis);
  return {
    bounds,
    left: buildNode(items.slice(0, middle)),
    right: buildNode(items.slice(middle)),
  };
}

/** Hoare 划分的 quickselect：原地重排，使 arr[k] 落在按 axis 排序后的位置。 */
function nthElement(arr: CentroidTriangle[], k: number, axis: keyof Vec3): void {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const pivot = arr[(lo + hi) >> 1].c[axis];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (arr[i].c[axis] < pivot) i++;
      while (arr[j].c[axis] > pivot) j--;
      if (i <= j) {
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
}

function boundsForCentroidTriangles(items: CentroidTriangle[]): Bounds {
  const bounds: Bounds = {
    min: { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY },
    max: { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY },
  };
  for (const { tri } of items) {
    for (const point of [tri.a, tri.b, tri.c]) {
      bounds.min.x = Math.min(bounds.min.x, point.x);
      bounds.min.y = Math.min(bounds.min.y, point.y);
      bounds.min.z = Math.min(bounds.min.z, point.z);
      bounds.max.x = Math.max(bounds.max.x, point.x);
      bounds.max.y = Math.max(bounds.max.y, point.y);
      bounds.max.z = Math.max(bounds.max.z, point.z);
    }
  }
  return bounds;
}

function segmentHitsNode(node: TriangleBvh, start: Vec3, end: Vec3): boolean {
  if (!segmentHitsBounds(start, end, node.bounds)) return false;
  if (node.triangles) {
    return node.triangles.some((triangle) => segmentHitsTriangle(start, end, triangle));
  }
  return (
    (node.left !== undefined && segmentHitsNode(node.left, start, end)) ||
    (node.right !== undefined && segmentHitsNode(node.right, start, end))
  );
}

function segmentHitsBounds(start: Vec3, end: Vec3, bounds: Bounds): boolean {
  let minT = 0;
  let maxT = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < EPSILON) {
      if (start[axis] < bounds.min[axis] || start[axis] > bounds.max[axis]) return false;
      continue;
    }
    const inverse = 1 / delta;
    let first = (bounds.min[axis] - start[axis]) * inverse;
    let second = (bounds.max[axis] - start[axis]) * inverse;
    if (first > second) [first, second] = [second, first];
    minT = Math.max(minT, first);
    maxT = Math.min(maxT, second);
    if (minT > maxT) return false;
  }
  return true;
}

function segmentHitsTriangle(start: Vec3, end: Vec3, triangle: Triangle): boolean {
  const direction = subtract(end, start);
  const edge1 = subtract(triangle.b, triangle.a);
  const edge2 = subtract(triangle.c, triangle.a);
  const h = cross(direction, edge2);
  const determinant = dot(edge1, h);
  if (Math.abs(determinant) < EPSILON) return false;

  const inverse = 1 / determinant;
  const s = subtract(start, triangle.a);
  const u = inverse * dot(s, h);
  if (u < 0 || u > 1) return false;

  const q = cross(s, edge1);
  const v = inverse * dot(direction, q);
  if (v < 0 || u + v > 1) return false;

  const t = inverse * dot(edge2, q);
  return t > EPSILON && t < 1 - EPSILON;
}

function largestAxis(bounds: Bounds): keyof Vec3 {
  const extents = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
  return extents.x >= extents.y && extents.x >= extents.z ? "x" : extents.y >= extents.z ? "y" : "z";
}

function triangleCentroid(triangle: Triangle): Vec3 {
  return {
    x: (triangle.a.x + triangle.b.x + triangle.c.x) / 3,
    y: (triangle.a.y + triangle.b.y + triangle.c.y) / 3,
    z: (triangle.a.z + triangle.b.z + triangle.c.z) / 3,
  };
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
