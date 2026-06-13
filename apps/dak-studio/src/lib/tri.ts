import { buildTriangleBvh, parseAwpyTri, type TriangleBvh } from "@cs2dak/maps";

/**
 * 浏览器端 .tri 加载器（maps 的 tri-assets 是 Node-only，Studio 走 fetch）。
 *
 * .tri 由打包脚本放进前端静态资源 `tris/{mapName}.tri`
 * （开发环境放 apps/dak-studio/public/tris/，可符号链接 ~/.awpy/tris）。
 * 文件缺失时返回 null；调用方只跳过静态墙体 LOS，仍保留 hp/flash/视野锥/烟雾约束。
 */
const bvhCache = new Map<string, Promise<TriangleBvh | null>>();

export function loadMapTri(mapName: string): Promise<TriangleBvh | null> {
  const cached = bvhCache.get(mapName);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const response = await fetch(`./tris/${mapName}.tri`);
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") ?? "";
      // dev server 对缺失文件可能回退 index.html（200 + text/html）
      if (contentType.includes("text/html")) return null;
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0 || buffer.byteLength % 36 !== 0) return null;
      return buildTriangleBvh(parseAwpyTri(buffer));
    } catch {
      return null;
    }
  })();
  bvhCache.set(mapName, promise);
  return promise;
}

/** 预载多张地图的 BVH，返回同步 lookup（给 presentation 的 visibilityFor 用）。 */
export async function loadTriLookup(mapNames: Iterable<string>): Promise<(mapName: string) => TriangleBvh | null> {
  const unique = [...new Set(mapNames)];
  const loaded = await Promise.all(unique.map(async (name) => [name, await loadMapTri(name)] as const));
  const byMap = new Map(loaded);
  return (mapName) => byMap.get(mapName) ?? null;
}
