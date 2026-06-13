import { loadDemoPackageFromZip } from "@cs2dak/core";
import type { DemoPackage } from "@cs2dak/contract";
import { getStorage } from "./storage";

/**
 * DAK Studio 本地 Demo 库。
 * - v3 ZIP 原始字节持久化在 blobs("demos") 命名空间（来源永远是 ZIP，规则：v3 ZIP 是唯一 seam）。
 * - demo 元数据（StudioDemoEntry）持久化在 records("demos")：与字节分离，未来 SQLite
 *   方案直接对应"原始 ZIP 落盘 / 元数据入库"。
 * - DemoPackage 解析结果持久化在 records("derived")：可丢弃缓存，未命中/版本不符时从 ZIP 重建。
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

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

/**
 * 解析口径（@cs2dak/core loadDemoPackageFromZip）变化时 +1，旧 derived 缓存自动失效。
 * v2→v3：DemoPackage 形状剧变，0.4.x 旧库的 v2 派生缓存必须失效，否则 v3 会吃到 v2 数据。
 */
const DERIVED_VERSION = 2;

interface DerivedRecord {
  version: number;
  pkg: DemoPackage;
}

// ── 存储命名空间（经 StorageAdapter 接缝，后端可换） ──
const demoMeta = () => getStorage().records("demos"); // StudioDemoEntry by id
const demoBlobs = () => getStorage().blobs("demos"); // ZIP 原始字节 by id
const derivedStore = () => getStorage().records("derived"); // {version, pkg} by id

/** demo 元数据补默认值（tags / sourceDemPath 为后加字段）。 */
function normalizeEntry(entry: StudioDemoEntry): StudioDemoEntry {
  return {
    id: entry.id,
    fileName: entry.fileName,
    importedAt: entry.importedAt,
    tags: entry.tags ?? [],
    sourceDemPath: entry.sourceDemPath ?? null,
    meta: entry.meta
  };
}

/** derived 是纯加速缓存：读写失败一律静默回落到 ZIP 重建。 */
async function readDerived(id: string): Promise<DemoPackage | null> {
  try {
    const record = await derivedStore().get<DerivedRecord>(id);
    return record && record.version === DERIVED_VERSION ? record.pkg : null;
  } catch {
    return null;
  }
}

async function writeDerived(id: string, pkg: DemoPackage): Promise<void> {
  try {
    await derivedStore().put<DerivedRecord>(id, { version: DERIVED_VERSION, pkg });
  } catch {
    // 写失败不影响功能
  }
}

async function deleteDerived(id: string): Promise<void> {
  try {
    await derivedStore().delete(id);
  } catch {
    // 忽略
  }
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

// ── ZIP 解析 worker pool ──
// 复用固定数量的 worker：每场解析不再新建/销毁 worker（那样每次都要重新加载
// @cs2dak/core 模块）。任务排队分发给空闲 worker，并发上限即池大小。
const WORKER_POOL_SIZE = 4;

interface ParseTask {
  buffer: ArrayBuffer;          // 转移给 worker（转移后 detach）
  fallbackBuffer: ArrayBuffer;  // worker 失败时回主线程解析用的副本
  resolve: (pkg: DemoPackage) => void;
  reject: (err: Error) => void;
}

interface PoolWorker {
  worker: Worker;
  task: ParseTask | null;
  taskId: number;
}

const workerPool: PoolWorker[] = [];
const parseQueue: ParseTask[] = [];
let workerSeq = 0;

function settleWithFallback(task: ParseTask): void {
  loadDemoPackageFromZip(task.fallbackBuffer).then(task.resolve, task.reject);
}

function makePoolWorker(): PoolWorker {
  const pw: PoolWorker = {
    worker: new Worker(new URL("./pkg-worker.ts", import.meta.url), { type: "module" }),
    task: null,
    taskId: 0
  };
  pw.worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; pkg?: DemoPackage; error?: string }>) => {
    if (!pw.task || event.data.id !== pw.taskId) return;
    const task = pw.task;
    pw.task = null;
    if (event.data.ok && event.data.pkg) task.resolve(event.data.pkg);
    else settleWithFallback(task);
    pumpParseQueue();
  };
  pw.worker.onerror = () => {
    // worker 可能已损坏：销毁、移出池，正在执行的任务回退主线程
    const task = pw.task;
    pw.task = null;
    pw.worker.terminate();
    const idx = workerPool.indexOf(pw);
    if (idx >= 0) workerPool.splice(idx, 1);
    if (task) settleWithFallback(task);
    pumpParseQueue();
  };
  workerPool.push(pw);
  return pw;
}

function pumpParseQueue(): void {
  if (parseQueue.length === 0) return;
  let idle = workerPool.find((pw) => pw.task === null);
  if (!idle && workerPool.length < WORKER_POOL_SIZE) idle = makePoolWorker();
  if (!idle) return;
  const task = parseQueue.shift()!;
  idle.task = task;
  idle.taskId = ++workerSeq;
  idle.worker.postMessage({ id: idle.taskId, buffer: task.buffer }, [task.buffer]);
}

function parseZipInWorker(buffer: ArrayBuffer): Promise<DemoPackage> {
  if (typeof Worker === "undefined") {
    return loadDemoPackageFromZip(buffer);
  }
  const fallbackBuffer = buffer.slice(0);
  return new Promise<DemoPackage>((resolve, reject) => {
    parseQueue.push({ buffer, fallbackBuffer, resolve, reject });
    pumpParseQueue();
  });
}

export async function listDemoEntries(): Promise<StudioDemoEntry[]> {
  const records = await demoMeta().getAll<StudioDemoEntry>();
  return records.map(normalizeEntry).sort((a, b) => b.importedAt - a.importedAt);
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
 * 导入一个 v3 ZIP；以内容哈希为 id，重复导入幂等（标签做并集）。
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

  const meta = demoMeta();
  const blobs = demoBlobs();
  const replacement = replaceId ? await meta.get<StudioDemoEntry>(replaceId) : undefined;
  if (replacement) {
    entry.tags = normalizeTags([...(replacement.tags ?? []), ...entry.tags]);
    entry.sourceDemPath = sourceDemPath ?? replacement.sourceDemPath ?? null;
  }
  const existing = await meta.get<StudioDemoEntry>(id);
  if (existing) {
    const mergedTags = normalizeTags([...(existing.tags ?? []), ...entry.tags]);
    const mergedEntry: StudioDemoEntry = {
      ...existing,
      tags: mergedTags,
      sourceDemPath: sourceDemPath ?? existing.sourceDemPath ?? null
    };
    await meta.put(id, mergedEntry);
    if (replacement && replacement.id !== id) {
      await meta.delete(replacement.id);
      await blobs.delete(replacement.id);
      pkgCache.delete(replacement.id);
      void deleteDerived(replacement.id);
    }
    return {
      entry: mergedEntry,
      duplicate: true,
      replaced: Boolean(replacement),
      replacedId: replacement?.id
    };
  }
  await blobs.put(id, buffer);
  await meta.put(id, entry);
  if (replacement && replacement.id !== id) {
    await meta.delete(replacement.id);
    await blobs.delete(replacement.id);
    pkgCache.delete(replacement.id);
    void deleteDerived(replacement.id);
  }
  pkgCache.set(id, Promise.resolve(pkg));
  // 导入时已解析出 pkg，顺手持久化，后续聚合不再解压 ZIP
  void writeDerived(id, pkg);
  return { entry, duplicate: false, replaced: Boolean(replacement), replacedId: replacement?.id };
}

/** 更新某条 demo 的标签。 */
export async function updateDemoTags(id: string, tags: string[]): Promise<void> {
  const meta = demoMeta();
  const record = await meta.get<StudioDemoEntry>(id);
  if (record) {
    await meta.put(id, { ...record, tags: normalizeTags(tags) });
  }
}

export async function bulkUpdateTags(ids: string[], add: string[] = [], remove: string[] = []): Promise<void> {
  const targetIds = [...new Set(ids)];
  if (targetIds.length === 0) return;
  const addSet = normalizeTags(add);
  const removeSet = new Set(normalizeTags(remove));
  const meta = demoMeta();
  for (const id of targetIds) {
    const record = await meta.get<StudioDemoEntry>(id);
    if (!record) continue;
    const nextTags = normalizeTags([...(record.tags ?? []).filter((tag) => !removeSet.has(tag)), ...addSet]);
    await meta.put(id, { ...record, tags: nextTags });
  }
}

export async function removeDemo(id: string): Promise<void> {
  await demoMeta().delete(id);
  await demoBlobs().delete(id);
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
    const buffer = await demoBlobs().get(id);
    if (!buffer) throw new Error("demo 不存在或已被删除");
    const pkg = await parseZipInWorker(buffer);
    void writeDerived(id, pkg);
    return pkg;
  })();
  pkgCache.set(id, loading);
  loading.catch(() => pkgCache.delete(id));
  return loading;
}

/** 批量替换资料库中所有匹配 originalName 的队伍名为 displayName。 */
export async function renameTeamInLibrary(originalName: string, displayName: string): Promise<void> {
  const meta = demoMeta();
  const all = await meta.getAll<StudioDemoEntry>();
  for (const record of all) {
    let changed = false;
    if (record.meta.teamAName === originalName) { record.meta.teamAName = displayName; changed = true; }
    if (record.meta.teamBName === originalName) { record.meta.teamBName = displayName; changed = true; }
    if (changed) await meta.put(record.id, record);
  }
}
