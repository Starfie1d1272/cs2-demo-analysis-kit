import { buildTriangleBvh, parseAwpyTri, type TriangleBvh } from "@cs2dak/maps";
import { createDbOpener, touchLimitedCache, txRequest } from "./idb";

/**
 * 浏览器端 .tri 加载器（maps 的 tri-assets 是 Node-only，Studio 走 fetch）。
 *
 * .tri 由打包脚本放进前端静态资源 `tris/{mapName}.tri`
 * （开发环境放 apps/dak-studio/public/tris/，可符号链接 ~/.awpy/tris）。
 * 文件缺失时返回 null；调用方只跳过静态墙体 LOS，仍保留 hp/flash/视野锥/烟雾约束。
 * 原始 .tri bytes 会写入 IndexedDB；BVH 树只做会话内缓存，避免持久化深层对象带来的 clone 开销。
 */
const BVH_CACHE_LIMIT = 4;
const bvhCache = new Map<string, Promise<TriangleBvh | null>>();
const TRI_DB = "dak-studio-tri-cache";
const TRI_STORE = "tri";
interface TriRecord {
  mapName: string;
  touchedAt: number;
  buffer: ArrayBuffer;
}

const openTriDb = createDbOpener(TRI_DB, 1, (db) => {
  if (!db.objectStoreNames.contains(TRI_STORE)) {
    db.createObjectStore(TRI_STORE, { keyPath: "mapName" });
  }
});

function isValidTriBuffer(buffer: ArrayBuffer): boolean {
  return buffer.byteLength > 0 && buffer.byteLength % 36 === 0;
}

async function readTriBuffer(mapName: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openTriDb();
    const record = await txRequest(
      db.transaction(TRI_STORE, "readonly").objectStore(TRI_STORE).get(mapName) as IDBRequest<TriRecord | undefined>
    );
    if (!record || !isValidTriBuffer(record.buffer)) return null;
    void txRequest(
      db.transaction(TRI_STORE, "readwrite").objectStore(TRI_STORE).put({ ...record, touchedAt: Date.now() } satisfies TriRecord)
    );
    return record.buffer;
  } catch {
    return null;
  }
}

async function writeTriBuffer(mapName: string, buffer: ArrayBuffer): Promise<void> {
  try {
    if (!isValidTriBuffer(buffer)) return;
    const db = await openTriDb();
    await txRequest(
      db.transaction(TRI_STORE, "readwrite").objectStore(TRI_STORE).put({
        mapName,
        touchedAt: Date.now(),
        buffer
      } satisfies TriRecord)
    );
  } catch {
    // tri cache is an optimization; fetch fallback remains valid.
  }
}

async function fetchTriBuffer(mapName: string): Promise<ArrayBuffer | null> {
  const response = await fetch(`./tris/${mapName}.tri`);
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  // dev server 对缺失文件可能回退 index.html（200 + text/html）
  if (contentType.includes("text/html")) return null;
  const buffer = await response.arrayBuffer();
  return isValidTriBuffer(buffer) ? buffer : null;
}

export function loadMapTri(mapName: string): Promise<TriangleBvh | null> {
  const cached = bvhCache.get(mapName);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const persisted = await readTriBuffer(mapName);
      const buffer = persisted ?? await fetchTriBuffer(mapName);
      if (!buffer) return null;
      if (!persisted) void writeTriBuffer(mapName, buffer.slice(0));
      return buildTriangleBvh(parseAwpyTri(buffer));
    } catch {
      return null;
    }
  })();
  return touchLimitedCache(bvhCache, mapName, promise, BVH_CACHE_LIMIT);
}

/** 预载多张地图的 BVH，返回同步 lookup（给 presentation 的 visibilityFor 用）。 */
export async function loadTriLookup(mapNames: Iterable<string>): Promise<(mapName: string) => TriangleBvh | null> {
  const unique = [...new Set(mapNames)];
  const loaded = await Promise.all(unique.map(async (name) => [name, await loadMapTri(name)] as const));
  const byMap = new Map(loaded);
  return (mapName) => byMap.get(mapName) ?? null;
}
