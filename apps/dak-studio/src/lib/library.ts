import { loadDemoPackageFromZip } from "@cs2dak/core";
import type { DemoPackage } from "@cs2dak/contract";

/**
 * DAK Studio 本地 Demo 库。
 * - v2 ZIP 原始字节持久化在 IndexedDB，刷新不丢（来源永远是 ZIP，规则：v2 ZIP 是唯一 seam）。
 * - DemoPackage 解析结果持久化在 derived 表：可丢弃缓存，未命中/版本不符时从 ZIP 重建。
 *   解压 + 解析是聚合首屏的主要耗时，命中 derived 后直接读 JSON。
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
  /** 用户标签（赛事、阶段等），导入时附加，可后续编辑。 */
  tags: string[];
  /** 本机原始 .dem 路径，仅用于桌面端重新导出；浏览器/ZIP 导入为空。 */
  sourceDemPath?: string | null;
  meta: DemoMeta;
}

interface DemoRecord extends StudioDemoEntry {
  buffer: ArrayBuffer;
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

const DB_NAME = "dak-studio";
const STORE = "demos";
const DERIVED_STORE = "derived";
/** 解析口径（@cs2dak/core loadDemoPackageFromZip）变化时 +1，旧 derived 缓存自动失效。 */
const DERIVED_VERSION = 1;

interface DerivedRecord {
  id: string;
  version: number;
  pkg: DemoPackage;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!request.result.objectStoreNames.contains(DERIVED_STORE)) {
        request.result.createObjectStore(DERIVED_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开 IndexedDB"));
  });
}

/** derived 是纯加速缓存：读写失败一律静默回落到 ZIP 重建。 */
async function readDerived(id: string): Promise<DemoPackage | null> {
  try {
    const db = await openDb();
    const record = await requestAsPromise(
      db.transaction(DERIVED_STORE, "readonly").objectStore(DERIVED_STORE).get(id) as IDBRequest<DerivedRecord | undefined>
    );
    db.close();
    return record && record.version === DERIVED_VERSION ? record.pkg : null;
  } catch {
    return null;
  }
}

async function writeDerived(id: string, pkg: DemoPackage): Promise<void> {
  try {
    const db = await openDb();
    await requestAsPromise(
      db.transaction(DERIVED_STORE, "readwrite").objectStore(DERIVED_STORE).put({ id, version: DERIVED_VERSION, pkg } satisfies DerivedRecord)
    );
    db.close();
  } catch {
    // 写失败不影响功能
  }
}

async function deleteDerived(id: string): Promise<void> {
  try {
    const db = await openDb();
    await requestAsPromise(db.transaction(DERIVED_STORE, "readwrite").objectStore(DERIVED_STORE).delete(id));
    db.close();
  } catch {
    // 忽略
  }
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
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

/** 格式化为可读的比赛标签："de_mirage · 2025-03-15 · FURIA 13:9 Vitality"。消除多处的重复拼接。 */
export function formatMatchLabel(entry: StudioDemoEntry): string {
  const date = matchDateFromFileName(entry.fileName);
  return [
    entry.meta.mapName,
    date,
    `${entry.meta.teamAName} ${entry.meta.teamAScore}:${entry.meta.teamBScore} ${entry.meta.teamBName}`
  ].filter(Boolean).join(" · ");
}

const pkgCache = new Map<string, Promise<DemoPackage>>();

/** 释放内存中的 DemoPackage 缓存。聚合完成后调用以降低峰值内存。 */
export function clearPkgCache(): void {
  pkgCache.clear();
}

let workerSeq = 0;

function parseZipInWorker(buffer: ArrayBuffer): Promise<DemoPackage> {
  if (typeof Worker === "undefined") {
    return loadDemoPackageFromZip(buffer);
  }
  const fallbackBuffer = buffer.slice(0);
  return new Promise<DemoPackage>((resolve, reject) => {
    const id = ++workerSeq;
    const worker = new Worker(new URL("./pkg-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; pkg?: DemoPackage; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.ok && event.data.pkg) resolve(event.data.pkg);
      else reject(new Error(event.data.error ?? "ZIP 解析失败"));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "ZIP 解析 Worker 失败"));
    };
    worker.postMessage({ id, buffer }, [buffer]);
  }).catch(() => loadDemoPackageFromZip(fallbackBuffer));
}

export async function listDemoEntries(): Promise<StudioDemoEntry[]> {
  const db = await openDb();
  const records = await requestAsPromise(
    db.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<DemoRecord[]>
  );
  db.close();
  return records
    // tags 为后加字段：旧记录读出时补默认值
    .map(({ id, fileName, importedAt, tags, sourceDemPath, meta }) => ({
      id,
      fileName,
      importedAt,
      tags: tags ?? [],
      sourceDemPath: sourceDemPath ?? null,
      meta
    }))
    .sort((a, b) => b.importedAt - a.importedAt);
}

export interface ImportResult {
  entry: StudioDemoEntry;
  duplicate: boolean;
  replaced: boolean;
  replacedId?: string;
}

export interface ImportDemoOptions {
  tags?: string[];
  sourceDemPath?: string | null;
  replaceId?: string;
}

/**
 * 导入一个 v2 ZIP；以内容哈希为 id，重复导入幂等（标签做并集）。
 * 解析失败抛错（带文件名）。
 */
export async function importDemoFile(file: File, options: ImportDemoOptions | string[] = []): Promise<ImportResult> {
  const { tags = [], sourceDemPath = null, replaceId } = Array.isArray(options) ? { tags: options } : options;
  const buffer = await file.arrayBuffer();
  let pkg: DemoPackage;
  try {
    pkg = await parseZipInWorker(buffer.slice(0));
  } catch (err) {
    throw new Error(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const id = await sha256Hex(buffer);
  const entry: StudioDemoEntry = {
    id,
    fileName: file.name,
    importedAt: Date.now(),
    tags: normalizeTags(tags),
    sourceDemPath,
    meta: metaFromPackage(pkg)
  };

  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const replacement = replaceId ? await requestAsPromise(store.get(replaceId) as IDBRequest<DemoRecord | undefined>) : undefined;
  if (replacement) {
    entry.tags = normalizeTags([...(replacement.tags ?? []), ...entry.tags]);
    entry.sourceDemPath = sourceDemPath ?? replacement.sourceDemPath ?? null;
  }
  const existing = await requestAsPromise(store.get(id) as IDBRequest<DemoRecord | undefined>);
  if (existing) {
    const mergedTags = normalizeTags([...(existing.tags ?? []), ...entry.tags]);
    await requestAsPromise(store.put({
      ...existing,
      tags: mergedTags,
      sourceDemPath: sourceDemPath ?? existing.sourceDemPath ?? null
    }));
    if (replacement && replacement.id !== id) {
      await requestAsPromise(store.delete(replacement.id));
      pkgCache.delete(replacement.id);
      void deleteDerived(replacement.id);
    }
    db.close();
    const { buffer: _ignored, ...existingEntry } = existing;
    return {
      entry: { ...existingEntry, tags: mergedTags, sourceDemPath: sourceDemPath ?? existing.sourceDemPath ?? null },
      duplicate: true,
      replaced: Boolean(replacement),
      replacedId: replacement?.id
    };
  }
  await requestAsPromise(store.put({ ...entry, buffer } satisfies DemoRecord));
  if (replacement && replacement.id !== id) {
    await requestAsPromise(store.delete(replacement.id));
    pkgCache.delete(replacement.id);
  }
  db.close();
  pkgCache.set(id, Promise.resolve(pkg));
  // 导入时已解析出 pkg，顺手持久化，后续聚合不再解压 ZIP
  void writeDerived(id, pkg);
  return { entry, duplicate: false, replaced: Boolean(replacement), replacedId: replacement?.id };
}

/** 更新某条 demo 的标签。 */
export async function updateDemoTags(id: string, tags: string[]): Promise<void> {
  const db = await openDb();
  const store = db.transaction(STORE, "readwrite").objectStore(STORE);
  const record = await requestAsPromise(store.get(id) as IDBRequest<DemoRecord | undefined>);
  if (record) {
    await requestAsPromise(store.put({ ...record, tags: normalizeTags(tags) }));
  }
  db.close();
}

export async function bulkUpdateTags(ids: string[], add: string[] = [], remove: string[] = []): Promise<void> {
  const targetIds = [...new Set(ids)];
  if (targetIds.length === 0) return;
  const addSet = normalizeTags(add);
  const removeSet = new Set(normalizeTags(remove));
  const db = await openDb();
  const store = db.transaction(STORE, "readwrite").objectStore(STORE);
  for (const id of targetIds) {
    const record = await requestAsPromise(store.get(id) as IDBRequest<DemoRecord | undefined>);
    if (!record) continue;
    const nextTags = normalizeTags([...(record.tags ?? []).filter((tag) => !removeSet.has(tag)), ...addSet]);
    await requestAsPromise(store.put({ ...record, tags: nextTags }));
  }
  db.close();
}

export async function removeDemo(id: string): Promise<void> {
  const db = await openDb();
  await requestAsPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  db.close();
  pkgCache.delete(id);
  await deleteDerived(id);
}

/** 取解析后的 DemoPackage：内存 → derived 持久缓存 → ZIP 重建（并回写 derived）。 */
export function getDemoPackage(id: string): Promise<DemoPackage> {
  const cached = pkgCache.get(id);
  if (cached) return cached;
  const loading = (async () => {
    const derived = await readDerived(id);
    if (derived) return derived;
    const db = await openDb();
    const record = await requestAsPromise(
      db.transaction(STORE, "readonly").objectStore(STORE).get(id) as IDBRequest<DemoRecord | undefined>
    );
    db.close();
    if (!record) throw new Error("demo 不存在或已被删除");
    const pkg = await parseZipInWorker(record.buffer.slice(0));
    void writeDerived(id, pkg);
    return pkg;
  })();
  pkgCache.set(id, loading);
  loading.catch(() => pkgCache.delete(id));
  return loading;
}
