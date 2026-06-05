/**
 * tri-assets — runtime .tri loader（Node.js only）
 *
 * .tri 文件是 awpy 从 CS2 .vphys 导出的三角形流（每三角形 9×f32=36B），
 * 7 图约 207MB，太大不进 git。通过 `awpy get tris` 下载到本地目录后，
 * 本模块按需读取、解析、构建 BVH 并缓存。
 *
 * demo-lab（浏览器）不经过此路径；届时需要预构建 BVH 或通过 HTTP 按需加载。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTriangleBvh, parseAwpyTri, type TriangleBvh } from "./visibility.js";

/** 可通过环境变量 AWPY_TRIS_DIR 覆盖默认路径。 */
const DEFAULT_TRIS_DIR = join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".awpy",
  "tris",
);

const triBvhCache = new Map<string, TriangleBvh | null>();

function resolveTriPath(mapName: string): string {
  const dir = process.env.AWPY_TRIS_DIR ?? DEFAULT_TRIS_DIR;
  return join(dir, `${mapName}.tri`);
}

/**
 * 按需加载指定地图的 .tri 文件并构建 BVH。
 * 结果缓存在内存中；多次调用只解析一次。
 * 文件不存在时返回 null。
 */
export function getMapTri(mapName: string): TriangleBvh | null {
  const cached = triBvhCache.get(mapName);
  if (cached !== undefined) return cached;

  const triPath = resolveTriPath(mapName);
  let bytes: Buffer;
  try {
    bytes = readFileSync(triPath);
  } catch {
    triBvhCache.set(mapName, null);
    return null;
  }

  const triangles = parseAwpyTri(bytes);
  const bvh = buildTriangleBvh(triangles);
  triBvhCache.set(mapName, bvh);
  return bvh;
}

/**
 * 检查指定地图的 .tri 文件是否可用（不做解析，只看文件是否存在）。
 */
export function hasMapTri(mapName: string): boolean {
  if (triBvhCache.has(mapName)) return triBvhCache.get(mapName) !== null;
  try {
    const { statSync } = require("node:fs") as typeof import("node:fs");
    statSync(resolveTriPath(mapName));
    return true;
  } catch {
    return false;
  }
}

/**
 * 清空 BVH 缓存（测试/重新加载用）。
 */
export function clearTriCache(): void {
  triBvhCache.clear();
}
