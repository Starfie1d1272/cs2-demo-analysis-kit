import { loadDemoPackageFromZip } from "@cs2dak/core";
import { buildMatchWorkspaceModel } from "@cs2dak/presentation";
import type { DemoPackage, MatchWorkspaceModel } from "@cs2dak/contract";
import { extractMatchFacts, getFactsStore, type MatchFacts } from "./facts";
import { CALLOUT_GRID_URLS, loadStudioCalloutGrid } from "./callout-grid";
import { metaFromPackage, type DemoMeta } from "./demo-meta";
import { getStorage } from "./storage";
import { loadTriLookup } from "./tri";

/**
 * DAK Studio 本地 Demo 库。
 * - v3 ZIP 原始字节持久化在 blobs("demos") 命名空间（来源永远是 ZIP，规则：v3 ZIP 是唯一 seam）。
 * - demo 元数据（StudioDemoEntry）持久化在 records("demos")：与字节分离，未来 SQLite
 *   方案直接对应"原始 ZIP 落盘 / 元数据入库"。
 * - 导入时把 DemoPackage 榨成紧凑 facts 行持久化，聚合查询走 facts 投影；
 *   DemoPackage 只在比赛工作台/逐场证据需要时从 ZIP 懒加载。
 */

export type { DemoMeta };

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

// ── 存储命名空间（经 StorageAdapter 接缝，后端可换） ──
const demoMeta = getStorage().records("demos"); // StudioDemoEntry by id
const demoBlobs = getStorage().blobs("demos"); // ZIP 原始字节 by id

/** demo 元数据补默认值（tags / sourceDemPath 为后加字段）。 */
function normalizeEntry(entry: StudioDemoEntry): StudioDemoEntry {
  return {
    id: entry.id,
    fileName: entry.fileName,
    importedAt: entry.importedAt,
    tags: entry.tags ?? [],
    sourceDemPath: entry.sourceDemPath ?? null,
    meta: { ...entry.meta, serverName: entry.meta.serverName ?? null, matchDate: entry.meta.matchDate ?? null }
  };
}

/** facts 是查询加速层；写失败不破坏库完整性（ZIP+元数据已落盘，可后续重导补齐）。 */
async function persistFacts(facts: MatchFacts): Promise<void> {
  try {
    await getFactsStore().putMatchFacts(facts);
  } catch {
    // 吞掉：facts 缺失只降级聚合查询。
  }
}

/**
 * worker 不可用时（测试 node 环境 / 无 Worker）的主线程兜底：解析 + 榨 facts + 元数据。
 * 与 worker 路径输出等价（同一份 tri/callout → 同一 visibilityFor → 同一 MatchFacts）。
 */
async function importOnMainThread(buffer: ArrayBuffer, matchId: string): Promise<ImportWorkerResult> {
  const pkg = await loadDemoPackageFromZip(buffer);
  const [visibilityFor, calloutGrid] = await Promise.all([
    loadTriLookup([pkg.match.mapName]),
    loadStudioCalloutGrid(pkg.match.mapName)
  ]);
  const facts = extractMatchFacts(pkg, { matchId, visibilityFor, calloutGrid });
  return { meta: metaFromPackage(pkg), facts };
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

/** 比赛日期统一收口：优先文件名，不命中则 fallback 到 meta.matchDate（事件包导入写入）。 */
export function entryDate(entry: StudioDemoEntry): string | null {
  return matchDateFromFileName(entry.fileName) ?? entry.meta.matchDate ?? null;
}

/** 格式化为可读的比赛标签："de_mirage · 2025-03-15 · FURIA 13:9 Vitality"。消除多处的重复拼接。 */
export function formatMatchLabel(entry: StudioDemoEntry): string {
  const date = entryDate(entry);
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

// ── 导入 worker pool ──
// 复用固定数量的 worker：每场不再新建/销毁 worker（那样每次都要重新加载 @cs2dak/* 模块）。
// 任务排队分发给空闲 worker，并发上限即池大小；批量导入时多场可在池里真正并行。
// 两种任务：
//   parse  —— 仅解析，返回整包（逐场证据/工作台用）
//   import —— 解析 + 就地榨 facts，返回紧凑 {meta, facts}（含 replay 的整包不回主线程）
const WORKER_POOL_SIZE = 4;

export interface ImportWorkerResult {
  meta: DemoMeta;
  facts: MatchFacts;
}

type WorkerReply =
  | { id: number; ok: true; pkg: DemoPackage }
  | { id: number; ok: true; meta: DemoMeta; facts: MatchFacts }
  | { id: number; ok: false; error: string };

interface PoolTask {
  op: "parse" | "import";
  buffer: ArrayBuffer;          // 转移给 worker（转移后 detach）
  fallbackBuffer: ArrayBuffer | null; // worker 失败时回主线程用的副本；大包可禁用
  matchId?: string;             // op === "import" 时必有
  resolve: (result: DemoPackage | ImportWorkerResult) => void;
  reject: (err: Error) => void;
  fallback: (buffer: ArrayBuffer) => Promise<DemoPackage | ImportWorkerResult>;
}

interface PoolWorker {
  worker: Worker;
  task: PoolTask | null;
  taskId: number;
}

const workerPool: PoolWorker[] = [];
const taskQueue: PoolTask[] = [];
let workerSeq = 0;

function settleWithFallback(task: PoolTask): void {
  if (task.fallbackBuffer == null) {
    task.reject(new Error("后台解析失败；低内存导入未保留回退字节，请重试该地图"));
    return;
  }
  task.fallback(task.fallbackBuffer).then(task.resolve, task.reject);
}

function makePoolWorker(): PoolWorker {
  const pw: PoolWorker = {
    worker: new Worker(new URL("./pkg-worker.ts", import.meta.url), { type: "module" }),
    task: null,
    taskId: 0
  };
  pw.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    if (!pw.task || event.data.id !== pw.taskId) return;
    const task = pw.task;
    pw.task = null;
    const reply = event.data;
    if (reply.ok) task.resolve("pkg" in reply ? reply.pkg : { meta: reply.meta, facts: reply.facts });
    else settleWithFallback(task);
    dispatchTasks();
  };
  pw.worker.onerror = () => {
    // worker 可能已损坏：销毁、移出池，正在执行的任务回退主线程
    const task = pw.task;
    pw.task = null;
    pw.worker.terminate();
    const idx = workerPool.indexOf(pw);
    if (idx >= 0) workerPool.splice(idx, 1);
    if (task) settleWithFallback(task);
    dispatchTasks();
  };
  workerPool.push(pw);
  return pw;
}

/** `.tri` 静态资源根的绝对 URL（worker chunk 相对路径会歧义，主线程算好传过去保证一致）。 */
function triBaseUrl(): string {
  return new URL("./tris/", document.baseURI).href;
}

function dispatchTasks(): void {
  while (taskQueue.length > 0) {
    let idle = workerPool.find((pw) => pw.task === null);
    if (!idle && workerPool.length < WORKER_POOL_SIZE) idle = makePoolWorker();
    if (!idle) return;
    const task = taskQueue.shift()!;
    idle.task = task;
    idle.taskId = ++workerSeq;
    const id = idle.taskId;
    const message =
      task.op === "parse"
        ? { id, op: "parse", buffer: task.buffer }
        : { id, op: "import", buffer: task.buffer, matchId: task.matchId, triBaseUrl: triBaseUrl(), calloutUrls: CALLOUT_GRID_URLS };
    idle.worker.postMessage(message, [task.buffer]);
  }
}

function parseZipInWorker(buffer: ArrayBuffer): Promise<DemoPackage> {
  if (typeof Worker === "undefined") {
    return loadDemoPackageFromZip(buffer);
  }
  const fallbackBuffer = buffer.slice(0);
  return new Promise<DemoPackage>((resolve, reject) => {
    taskQueue.push({
      op: "parse",
      buffer,
      fallbackBuffer,
      resolve: resolve as (r: DemoPackage | ImportWorkerResult) => void,
      reject,
      fallback: (buf) => loadDemoPackageFromZip(buf)
    });
    dispatchTasks();
  });
}

/** 在 worker 里解析 + 榨 facts；无 Worker / 无 document（测试 node）时回主线程兜底。 */
function importInWorker(buffer: ArrayBuffer, matchId: string, keepFallback = true): Promise<ImportWorkerResult> {
  if (typeof Worker === "undefined" || typeof document === "undefined") {
    return importOnMainThread(buffer, matchId);
  }
  const fallbackBuffer = keepFallback ? buffer.slice(0) : null;
  return new Promise<ImportWorkerResult>((resolve, reject) => {
    taskQueue.push({
      op: "import",
      buffer,
      fallbackBuffer,
      matchId,
      resolve: resolve as (r: DemoPackage | ImportWorkerResult) => void,
      reject,
      fallback: (buf) => importOnMainThread(buf, matchId)
    });
    dispatchTasks();
  });
}

export async function listDemoEntries(): Promise<StudioDemoEntry[]> {
  const records = await demoMeta.getAll<StudioDemoEntry>();
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
  /** 批量赛事导入使用：不保留 worker 回退副本，峰值限制为单图。 */
  lowMemory?: boolean;
  /** 比赛日期（YYYY-MM-DD）；事件包导入时由 series.completedAt 传入。 */
  matchDate?: string | null;
}

/**
 * 导入一个 v3 ZIP；以内容哈希为 id，重复导入幂等（标签做并集）。
 * 解析失败抛错（带文件名）。
 */
export async function importDemoFile(file: File, options: ImportDemoOptions | string[] = []): Promise<ImportResult> {
  const { tags = [], sourceDemPath = null, replaceId, lowMemory = false, matchDate = null } = Array.isArray(options) ? { tags: options } : options;
  let buffer = await file.arrayBuffer();
  const id = await sha256Hex(buffer);

  const meta = demoMeta;
  const blobs = demoBlobs;
  const replacement = replaceId ? await meta.get<StudioDemoEntry>(replaceId) : undefined;
  const existing = await meta.get<StudioDemoEntry>(id);

  // facts 的 matchId 必须等于最终持久化条目的 matchId：重复导入沿用既有条目的 fileName，
  // 否则用本次文件名。故先定 matchId 再榨 facts（在 worker 里，含 replay 的整包不回主线程）。
  const matchId = matchIdForEntry({ fileName: existing?.fileName ?? file.name });
  let result: ImportWorkerResult;
  try {
    result = await importInWorker(lowMemory ? buffer : buffer.slice(0), matchId, !lowMemory);
  } catch (err) {
    throw new Error(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const { meta: pkgMeta, facts } = result;
  if (buffer.byteLength === 0) buffer = await file.arrayBuffer();

  const entry: StudioDemoEntry = {
    id,
    fileName: file.name,
    importedAt: Date.now(),
    tags: normalizeTags(tags),
    sourceDemPath,
    meta: matchDate ? { ...pkgMeta, matchDate } : pkgMeta,
  };
  if (replacement) {
    entry.tags = normalizeTags([...(replacement.tags ?? []), ...entry.tags]);
    entry.sourceDemPath = sourceDemPath ?? replacement.sourceDemPath ?? null;
  }

  if (existing) {
    const mergedTags = normalizeTags([...(existing.tags ?? []), ...entry.tags]);
    // 重复导入时合并 matchDate：已有不覆盖，没有则从新 entry 补（事件包回填日期）
    const mergedMeta = existing.meta.matchDate ? existing.meta : { ...existing.meta, matchDate: entry.meta.matchDate ?? null };
    const mergedEntry: StudioDemoEntry = {
      ...existing,
      tags: mergedTags,
      sourceDemPath: sourceDemPath ?? existing.sourceDemPath ?? null,
      meta: mergedMeta,
    };
    await meta.put(id, mergedEntry);
    await persistFacts(facts);
    if (replacement && replacement.id !== id) {
      await Promise.all([
        meta.delete(replacement.id),
        blobs.delete(replacement.id)
      ]);
      pkgCache.delete(replacement.id);
      void getFactsStore().deleteMatchFacts(matchIdForEntry(replacement));
    }
    return {
      entry: mergedEntry,
      duplicate: true,
      replaced: Boolean(replacement),
      replacedId: replacement?.id
    };
  }
  await Promise.all([
    blobs.put(id, buffer),
    meta.put(id, entry)
  ]);
  if (replacement && replacement.id !== id) {
    await Promise.all([
      meta.delete(replacement.id),
      blobs.delete(replacement.id)
    ]);
    pkgCache.delete(replacement.id);
    void getFactsStore().deleteMatchFacts(matchIdForEntry(replacement));
  }
  // facts 已在 worker 里榨好；后续聚合走 facts 投影，不再反序列化整包 derived。
  // 注意：不把整包放进 pkgCache —— 批量导入会让每场 DemoPackage（含完整 replay）常驻内存
  // 导致 OOM。需要整包时由 getDemoPackage 按需从 ZIP 懒加载即可。
  await persistFacts(facts);
  return { entry, duplicate: false, replaced: Boolean(replacement), replacedId: replacement?.id };
}

/** 更新某条 demo 的标签。 */
export async function updateDemoTags(id: string, tags: string[]): Promise<void> {
  const meta = demoMeta;
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
  const meta = demoMeta;
  const records = await Promise.all(targetIds.map((id) => meta.get<StudioDemoEntry>(id)));
  await Promise.all(
    records.filter((r): r is StudioDemoEntry => r != null).map((record) => {
      const nextTags = normalizeTags([...(record.tags ?? []).filter((tag) => !removeSet.has(tag)), ...addSet]);
      return meta.put(record.id, { ...record, tags: nextTags });
    })
  );
}

export async function removeDemo(id: string): Promise<void> {
  const record = await demoMeta.get<StudioDemoEntry>(id);
  await Promise.all([
    demoMeta.delete(id),
    demoBlobs.delete(id)
  ]);
  pkgCache.delete(id);
  if (record) await getFactsStore().deleteMatchFacts(matchIdForEntry(record));
}

/**
 * 批量删除。逐场串行（每场要删 ZIP blob + 12 个 facts 命名空间的行），
 * 串行避免删除时的瞬时内存/IO 尖峰；onProgress 驱动界面提示。
 */
export async function removeDemos(
  ids: string[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const targets = [...new Set(ids)];
  for (let i = 0; i < targets.length; i += 1) {
    await removeDemo(targets[i]!);
    onProgress?.(i + 1, targets.length);
  }
}

/** 取解析后的 DemoPackage：内存 → ZIP 重建。仅用于逐场证据/工作台，不作为聚合缓存。 */
export function getDemoPackage(id: string): Promise<DemoPackage> {
  const cached = pkgCache.get(id);
  if (cached) return cached;
  const loading = (async () => {
    const buffer = await demoBlobs.get(id);
    if (!buffer) throw new Error("demo 不存在或已被删除");
    return parseZipInWorker(buffer);
  })();
  pkgCache.set(id, loading);
  loading.catch(() => pkgCache.delete(id));
  return loading;
}

/**
 * 单场工作台 model 懒算：从 ZIP 重建 pkg 再构 workspace。
 * 不在导入时持久化（workspace model 单场 ~35MB，整包全量分析，是导入内存/耗时大头），
 * 只在打开该场工作台/教练回放时按需构建——与 getDemoPackage 同款懒加载策略。
 */
export async function loadMatchWorkspaceModel(demoId: string): Promise<MatchWorkspaceModel> {
  return buildMatchWorkspaceModel(await getDemoPackage(demoId));
}

/** 批量替换资料库中所有匹配 originalName 的队伍名为 displayName。 */
export async function renameTeamInLibrary(originalName: string, displayName: string): Promise<void> {
  const meta = demoMeta;
  const all = await meta.getAll<StudioDemoEntry>();
  await Promise.all(
    all.map((record) => {
      let recordMut = record;
      let changed = false;
      if (recordMut.meta.teamAName === originalName) { recordMut = { ...recordMut, meta: { ...recordMut.meta, teamAName: displayName } }; changed = true; }
      if (recordMut.meta.teamBName === originalName) { recordMut = { ...recordMut, meta: { ...recordMut.meta, teamBName: displayName } }; changed = true; }
      return changed ? meta.put(recordMut.id, recordMut) : Promise.resolve();
    })
  );
}
