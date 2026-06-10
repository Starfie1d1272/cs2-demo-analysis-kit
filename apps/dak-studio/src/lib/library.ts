import { loadDemoPackageFromZip } from "@cs2dak/core";
import type { DemoPackage } from "@cs2dak/contract";

/**
 * DAK Studio 本地 Demo 库。
 * - v2 ZIP 原始字节持久化在 IndexedDB，刷新不丢。
 * - DemoPackage 解析结果只缓存在内存，按需重建（来源永远是 ZIP，规则：v2 ZIP 是唯一 seam）。
 */

export interface DemoMeta {
  mapName: string;
  teamAName: string;
  teamBName: string;
  teamAScore: number;
  teamBScore: number;
  roundCount: number;
  durationSeconds: number;
  playerCount: number;
  hasReplay: boolean;
  source: string;
}

export interface StudioDemoEntry {
  id: string;
  fileName: string;
  importedAt: number;
  meta: DemoMeta;
}

interface DemoRecord extends StudioDemoEntry {
  buffer: ArrayBuffer;
}

const DB_NAME = "dak-studio";
const STORE = "demos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开 IndexedDB"));
  });
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 请求失败"));
  });
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function metaFromPackage(pkg: DemoPackage): DemoMeta {
  return {
    mapName: pkg.match.mapName,
    teamAName: pkg.match.teamA.name ?? "Team A",
    teamBName: pkg.match.teamB.name ?? "Team B",
    teamAScore: pkg.match.teamA.score,
    teamBScore: pkg.match.teamB.score,
    roundCount: pkg.rounds.length,
    durationSeconds: pkg.match.durationSeconds,
    playerCount: pkg.players.length,
    hasReplay: Boolean(pkg.replay),
    source: pkg.match.source
  };
}

/** 跨场聚合使用的 matchId：文件名去掉 .zip。exporter 命名带日期前缀时天然按时间排序。 */
export function matchIdForEntry(entry: Pick<StudioDemoEntry, "fileName">): string {
  return entry.fileName.replace(/\.zip$/i, "");
}

/** 从 exporter 命名（YYYY-MM-DD_map_A-vs-B_x-y.zip）提取比赛日期；不匹配时返回 null。 */
export function matchDateFromFileName(fileName: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})_/.exec(fileName);
  return match ? match[1] : null;
}

const pkgCache = new Map<string, Promise<DemoPackage>>();

export async function listDemoEntries(): Promise<StudioDemoEntry[]> {
  const db = await openDb();
  const records = await requestAsPromise(
    db.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<DemoRecord[]>
  );
  db.close();
  return records
    .map(({ id, fileName, importedAt, meta }) => ({ id, fileName, importedAt, meta }))
    .sort((a, b) => b.importedAt - a.importedAt);
}

export interface ImportResult {
  entry: StudioDemoEntry;
  duplicate: boolean;
}

/** 导入一个 v2 ZIP；以内容哈希为 id，重复导入幂等。解析失败抛错（带文件名）。 */
export async function importDemoFile(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  let pkg: DemoPackage;
  try {
    pkg = await loadDemoPackageFromZip(buffer);
  } catch (err) {
    throw new Error(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const id = await sha256Hex(buffer);
  const entry: StudioDemoEntry = {
    id,
    fileName: file.name,
    importedAt: Date.now(),
    meta: metaFromPackage(pkg)
  };

  const db = await openDb();
  const store = db.transaction(STORE, "readwrite").objectStore(STORE);
  const existing = await requestAsPromise(store.get(id) as IDBRequest<DemoRecord | undefined>);
  if (existing) {
    db.close();
    return { entry: { ...existing, meta: existing.meta }, duplicate: true };
  }
  await requestAsPromise(store.put({ ...entry, buffer } satisfies DemoRecord));
  db.close();
  pkgCache.set(id, Promise.resolve(pkg));
  return { entry, duplicate: false };
}

export async function removeDemo(id: string): Promise<void> {
  const db = await openDb();
  await requestAsPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  db.close();
  pkgCache.delete(id);
}

/** 取解析后的 DemoPackage；内存缓存，未命中时从 IndexedDB 的 ZIP 字节重建。 */
export function getDemoPackage(id: string): Promise<DemoPackage> {
  const cached = pkgCache.get(id);
  if (cached) return cached;
  const loading = (async () => {
    const db = await openDb();
    const record = await requestAsPromise(
      db.transaction(STORE, "readonly").objectStore(STORE).get(id) as IDBRequest<DemoRecord | undefined>
    );
    db.close();
    if (!record) throw new Error("demo 不存在或已被删除");
    return loadDemoPackageFromZip(record.buffer);
  })();
  pkgCache.set(id, loading);
  loading.catch(() => pkgCache.delete(id));
  return loading;
}
