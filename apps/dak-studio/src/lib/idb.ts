/**
 * IndexedDB 共享工具 + LRU 内存缓存。
 *
 * 统一封装 IDB 连接管理与请求包装，避免 season.ts / tri.ts 重复定义相同逻辑。
 * `touchLimitedCache` 适用于存放大模型（DuelInsights / BVH 树等）的场景——
 * 保留少量热数据在内存，其余依赖 IndexedDB 持久化层兜底。
 */

export function txRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 创建 IndexedDB 数据库打开函数（单例模式）。
 *
 * 返回的函数保持 dbPromise 单例；onversionchange / onclose / catch 自动重置。
 *
 * @example
 * const openCacheDb = createDbOpener("dak-studio-cache", 2, (db) => {
 *   if (!db.objectStoreNames.contains("season")) db.createObjectStore("season");
 * });
 * const db = await openCacheDb();
 */
export function createDbOpener(
  dbName: string,
  version: number,
  upgrade: (db: IDBDatabase) => void
): () => Promise<IDBDatabase> {
  let dbPromise: Promise<IDBDatabase> | null = null;
  return () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, version);
      request.onupgradeneeded = () => upgrade(request.result);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        db.onclose = () => { dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => { dbPromise = null; reject(request.error); };
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  };
}

/**
 * 有限 LRU 内存缓存。
 *
 * 以 `Map<string, Promise<T>>` 为后端，最多保留 `limit` 个键。
 * 新值写入后自动淘汰最旧条目；Promise reject 时自动清除失效键。
 * 缓存击穿防护：同名 key 先 delete 再 set，确保 Map 尾部是最新值。
 */
export function touchLimitedCache<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  value: Promise<T>,
  limit: number
): Promise<T> {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
  value.catch(() => cache.delete(key));
  return value;
}
