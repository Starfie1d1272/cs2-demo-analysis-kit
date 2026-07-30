import { loadDemoPackageFromZip, buildMatchRadarField } from "@cs2dak/core";
import { buildMatchWorkspaceModel } from "@cs2dak/presentation";
import { buildRadarFieldGrid } from "@cs2dak/maps";
import type { DemoPackage, MatchWorkspaceModel, RadarField } from "@cs2dak/contract";
import { extractMatchData, type ExtractedMatchData } from "./extract-match-facts";
import { getFactsStore } from "./facts-store";
import { getDerivedCacheStore } from "./derived-cache";
import { CALLOUT_GRID_URLS, loadStudioCalloutGrid } from "./callout-grid";
import { metaFromPackage, type DemoMeta } from "./demo-meta";
import { getStorage } from "./storage";
import { loadTriLookup, loadMapTri } from "./tri";
import { currentBuiltWith, isAnalysisStale, type BuiltWith } from "./analysis-manifest";
import {
  createProducerManifestStore,
  newProducerGeneration,
  producerStatus,
  type ProducerId,
  type ProducerStatus,
  PRODUCER_REVISIONS,
} from "./producer-manifest";

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
  /** 榨 facts 时所用的 facts revision（AnalysisManifest）；缺失=历史条目，视为旧口径。 */
  builtWith?: BuiltWith;
  /** 原始 v3 ZIP 字节数（导入时记录）；用于资产占用统计，免去读全部 blob。 */
  sizeBytes?: number;
  /** 每个 producer 的最后一次可见状态；manifest 才是可恢复性的事实来源。 */
  producerStatuses?: Partial<Record<ProducerId, ProducerStatus>>;
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
    builtWith: entry.builtWith,
    sizeBytes: entry.sizeBytes,
    producerStatuses: entry.producerStatuses,
    meta: { ...entry.meta, serverName: entry.meta.serverName ?? null, matchDate: entry.meta.matchDate ?? null }
  };
}

/** facts 是否旧口径（factsRevision 与当前 AnalysisManifest 不一致）。 */
export function isFactsStale(entry: StudioDemoEntry): boolean {
  return isAnalysisStale(entry.builtWith) || entry.producerStatuses?.["base-facts"] !== "current";
}

const PERSISTED_PRODUCERS = ["base-facts", "duel", "tactical", "map-intelligence", "utility"] as const;
export type PersistedProducer = (typeof PERSISTED_PRODUCERS)[number];

export interface ProducerPersistResult {
  producer: PersistedProducer;
  status: ProducerStatus;
  error?: string;
}

/**
 * facts 与 derived 先各自写到同名 candidate generation；只有两边都通过表级校验后，
 * 一个 manifest 指针才将该 producer 切为可见。失败保留旧 generation，并显式记录 stale/failed。
 */
async function persistAnalysis(
  data: ExtractedMatchData,
  sourcePackageHash: string,
  targets: readonly PersistedProducer[] = PERSISTED_PRODUCERS,
): Promise<ProducerPersistResult[]> {
  const factsStore = getFactsStore();
  const derivedStore = getDerivedCacheStore();
  const manifests = createProducerManifestStore(getStorage());
  const results = await Promise.allSettled(targets.map(async (producer): Promise<ProducerPersistResult> => {
    const startedAt = Date.now();
    const generation = newProducerGeneration();
    const previous = await manifests.get(data.facts.matchId, producer);
    try {
      const writes: Array<Promise<Record<string, number>>> = [factsStore.stageMatchFacts(data.facts, producer, generation)];
      if (producer === "base-facts" || producer === "duel" || producer === "utility") {
        writes.push(derivedStore.stageMatchDerived(data.derived, producer, generation));
      }
      const [factRows, derivedRows] = await Promise.all(writes);
      await manifests.activate(data.facts.matchId, producer, {
        generation,
        producerRevision: PRODUCER_REVISIONS[producer],
        sourcePackageHash,
        rowCounts: { ...factRows, ...derivedRows },
        storageGenerations: {
          facts: generation,
          ...(derivedRows ? { derived: generation } : {}),
        },
        startedAt,
      });
      const oldFactsGeneration = previous?.active?.storageGenerations?.facts;
      const oldDerivedGeneration = previous?.active?.storageGenerations?.derived;
      // 可见指针已切换，清理只能 best-effort，绝不能反过来影响新快照。
      void Promise.all([
        oldFactsGeneration && oldFactsGeneration !== generation
          ? factsStore.cleanupMatchFactsGeneration(data.facts.matchId, producer, oldFactsGeneration)
          : Promise.resolve(),
        oldDerivedGeneration && oldDerivedGeneration !== generation && (producer === "base-facts" || producer === "duel" || producer === "utility")
          ? derivedStore.cleanupMatchDerivedGeneration(data.facts.matchId, producer, oldDerivedGeneration)
          : Promise.resolve(),
      ]).catch(() => undefined);
      return { producer, status: "current" };
    } catch (error) {
      await Promise.allSettled([
        factsStore.cleanupMatchFactsGeneration(data.facts.matchId, producer, generation),
        ...(producer === "base-facts" || producer === "duel" || producer === "utility"
          ? [derivedStore.cleanupMatchDerivedGeneration(data.facts.matchId, producer, generation)]
          : []),
      ]);
      const record = await manifests.fail(data.facts.matchId, producer, PRODUCER_REVISIONS[producer], startedAt, error);
      return {
        producer,
        status: producerStatus(record, sourcePackageHash, PRODUCER_REVISIONS[producer]),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));
  // allSettled 保证某个 optional producer 失败不会丢掉其它 producer 的完成结果。
  const resolved = results.map((result, index) => result.status === "fulfilled"
    ? result.value
    : { producer: targets[index]!, status: "failed" as const, error: String(result.reason) });
  const cohortRows = getStorage().records("facts:cohort_rows");
  await Promise.all([
    cohortRows.delete(data.facts.matchId),
    cohortRows.deleteByPrefix(`${data.facts.matchId}\t`),
  ]);
  return resolved;
}

function producerStatuses(results: readonly ProducerPersistResult[]): Partial<Record<ProducerId, ProducerStatus>> {
  return Object.fromEntries(results.map(({ producer, status }) => [producer, status]));
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
  const data = extractMatchData(pkg, { matchId, visibilityFor, calloutGrid });
  return { meta: metaFromPackage(pkg), data };
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

const pkgInFlight = new Map<string, Promise<DemoPackage>>();
const cacheInvalidators = new Set<(demoId: string) => void>();

/** 注册产品侧大对象缓存失效器；删除、替换或重建同一 demo 时统一通知。 */
export function registerDemoCacheInvalidator(invalidator: (demoId: string) => void): () => void {
  cacheInvalidators.add(invalidator);
  return () => cacheInvalidators.delete(invalidator);
}

function invalidateDemoCaches(id: string): void {
  pkgInFlight.delete(id);
  for (const invalidate of cacheInvalidators) invalidate(id);
}

/** 释放尚在解析中的 DemoPackage single-flight 引用。 */
export function clearPkgCache(): void {
  pkgInFlight.clear();
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
  data: ExtractedMatchData;
}

type PoolResult = DemoPackage | ImportWorkerResult | RadarField[];

type WorkerReply =
  | { id: number; ok: true; pkg: DemoPackage }
  | { id: number; ok: true; meta: DemoMeta; data: ExtractedMatchData }
  | { id: number; ok: true; radarFields: RadarField[] }
  | { id: number; ok: false; error: string };

interface PoolTask {
  op: "parse" | "import" | "radarField";
  buffer: ArrayBuffer;          // 转移给 worker（转移后 detach）
  fallbackBuffer: ArrayBuffer | null; // worker 失败时回主线程用的副本；大包可禁用
  matchId?: string;             // op === "import" | "radarField" 时必有
  economy?: "gun" | "all";      // op === "radarField" 时用
  resolve: (result: PoolResult) => void;
  reject: (err: Error) => void;
  fallback: (buffer: ArrayBuffer) => Promise<PoolResult>;
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
    if (reply.ok) {
      if ("pkg" in reply) task.resolve(reply.pkg);
      else if ("radarFields" in reply) task.resolve(reply.radarFields);
      else task.resolve({ meta: reply.meta, data: reply.data });
    } else settleWithFallback(task);
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
        : task.op === "radarField"
          ? { id, op: "radarField", buffer: task.buffer, matchId: task.matchId, triBaseUrl: triBaseUrl(), economy: task.economy ?? "gun" }
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
      resolve: resolve as (r: PoolResult) => void,
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
      resolve: resolve as (r: PoolResult) => void,
      reject,
      fallback: (buf) => importOnMainThread(buf, matchId)
    });
    dispatchTasks();
  });
}

/** 主线程兜底算雷达场（无 Worker / node 测试）。 */
async function radarFieldOnMainThread(buffer: ArrayBuffer, matchId: string, economy: "gun" | "all"): Promise<RadarField[]> {
  const pkg = await loadDemoPackageFromZip(buffer);
  const grid = buildRadarFieldGrid(pkg.match.mapName);
  if (!grid) return [];
  const bvh = await loadMapTri(pkg.match.mapName);
  return buildMatchRadarField(pkg, { matchId, grid, bvh, economy });
}

/**
 * 在 worker 池里算一场的雷达场贡献（[teamA, teamB]）；无 Worker 时回主线程。
 * 重活（逐 tick LOS 遍历）放 worker，与导入同池，共享 BVH 缓存、按池大小并发。
 */
export function radarFieldInWorker(buffer: ArrayBuffer, matchId: string, economy: "gun" | "all", keepFallback = true): Promise<RadarField[]> {
  if (typeof Worker === "undefined" || typeof document === "undefined") {
    return radarFieldOnMainThread(buffer, matchId, economy);
  }
  const fallbackBuffer = keepFallback ? buffer.slice(0) : null;
  return new Promise<RadarField[]>((resolve, reject) => {
    taskQueue.push({
      op: "radarField",
      buffer,
      fallbackBuffer,
      matchId,
      economy,
      resolve: resolve as (r: PoolResult) => void,
      reject,
      fallback: (buf) => radarFieldOnMainThread(buf, matchId, economy)
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
  producers: ProducerPersistResult[];
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

async function cleanupReplacement(
  replacement: StudioDemoEntry | undefined,
  newId: string,
  newMatchId: string,
): Promise<boolean> {
  if (!replacement || replacement.id === newId) return Boolean(replacement);
  await Promise.all([
    demoMeta.delete(replacement.id),
    demoBlobs.delete(replacement.id),
  ]);
  invalidateDemoCaches(replacement.id);
  const oldMatchId = matchIdForEntry(replacement);
  if (oldMatchId !== newMatchId) {
    const cohortRows = getStorage().records("facts:cohort_rows");
    await Promise.all([
      getFactsStore().deleteMatchFacts(oldMatchId),
      getDerivedCacheStore().deleteMatch(oldMatchId),
      cohortRows.delete(oldMatchId),
      cohortRows.deleteByPrefix(`${oldMatchId}\t`),
      createProducerManifestStore(getStorage()).deleteMatch(oldMatchId),
    ]);
  }
  return true;
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
  const { meta: pkgMeta, data } = result;
  if (buffer.byteLength === 0) buffer = await file.arrayBuffer();

  const entry: StudioDemoEntry = {
    id,
    fileName: file.name,
    importedAt: Date.now(),
    tags: normalizeTags(tags),
    sourceDemPath,
    // 只有 base-facts candidate 成功切换后才写 current；不能在持久化前提前宣称数据可用。
    builtWith: undefined,
    sizeBytes: file.size,
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
      builtWith: undefined,
      sizeBytes: existing.sizeBytes ?? file.size,
      meta: mergedMeta,
    };
    const results = await persistAnalysis(data, id);
    const producerState = producerStatuses(results);
    const completedEntry: StudioDemoEntry = {
      ...mergedEntry,
      producerStatuses: producerState,
      builtWith: producerState["base-facts"] === "current" ? currentBuiltWith() : undefined,
    };
    await meta.put(id, completedEntry);
    invalidateDemoCaches(id);
    const replaced = producerState["base-facts"] === "current"
      ? await cleanupReplacement(replacement, id, matchId)
      : false;
    return {
      entry: completedEntry,
      duplicate: true,
      replaced,
      replacedId: replaced ? replacement?.id : undefined,
      producers: results,
    };
  }
  await Promise.all([
    blobs.put(id, buffer),
    meta.put(id, entry)
  ]);
  // facts 已在 worker 里榨好；后续聚合走 facts 投影，不再反序列化整包 derived。
  // 注意：不把整包放进长期缓存 —— 批量导入会让每场 DemoPackage（含完整 replay）常驻内存
  // 导致 OOM。需要整包时由 getDemoPackage 按需从 ZIP 懒加载即可。
  const results = await persistAnalysis(data, id);
  const producerState = producerStatuses(results);
  const completedEntry: StudioDemoEntry = {
    ...entry,
    producerStatuses: producerState,
    builtWith: producerState["base-facts"] === "current" ? currentBuiltWith() : undefined,
  };
  await meta.put(id, completedEntry);
  invalidateDemoCaches(id);
  const replaced = producerState["base-facts"] === "current"
    ? await cleanupReplacement(replacement, id, matchId)
    : false;
  return { entry: completedEntry, duplicate: false, replaced, replacedId: replaced ? replacement?.id : undefined, producers: results };
}

/** 更新某条 demo 的标签。 */
export async function updateDemoTags(id: string, tags: string[]): Promise<void> {
  const meta = demoMeta;
  const record = await meta.get<StudioDemoEntry>(id);
  if (record) {
    await meta.put(id, { ...record, tags: normalizeTags(tags) });
  }
}

/** 只更新本机原始 .dem 路径；用于给 ZIP/赛事包导入的条目补绑 raw demo。 */
export async function updateDemoSourcePath(id: string, sourceDemPath: string | null): Promise<void> {
  const meta = demoMeta;
  const record = await meta.get<StudioDemoEntry>(id);
  if (record) {
    await meta.put(id, normalizeEntry({ ...record, sourceDemPath }));
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
  invalidateDemoCaches(id);
  if (record) await Promise.all([
    getFactsStore().deleteMatchFacts(matchIdForEntry(record)),
    getDerivedCacheStore().deleteMatch(matchIdForEntry(record)),
    getStorage().records("facts:cohort_rows").delete(matchIdForEntry(record)),
    getStorage().records("facts:cohort_rows").deleteByPrefix(`${matchIdForEntry(record)}\t`),
    createProducerManifestStore(getStorage()).deleteMatch(matchIdForEntry(record)),
  ]);
}

/**
 * 批量删除。逐场串行（每场要删 ZIP blob + facts/derived 命名空间的行），
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

/**
 * 从已持久化的 v3 ZIP 重榨 facts（用当前 AnalysisManifest 口径）。
 *
 * 关键：不需要 .dem / cs2df —— ZIP 字节本就在 blobs("demos")。把 blob 构造成 File 喂给
 * importDemoFile，同字节 → 同 sha256 id → 幂等替换分支，重榨全部 facts 并刷新 entry.builtWith。
 * 适用于所有来源（赛事包 / 浏览器导入 / 别人给的 ZIP，无需 sourceDemPath）。
 *
 * @returns 重建后的 entry；blob 或 meta 缺失返回 null。
 */
export async function rebuildFactsFromZip(id: string): Promise<StudioDemoEntry | null> {
  const [entry, buffer] = await Promise.all([
    demoMeta.get<StudioDemoEntry>(id),
    demoBlobs.get(id)
  ]);
  if (!entry || !buffer) return null;
  // 用副本构造 File：importDemoFile 会 transfer buffer 给 worker，原 blob 字节不可复用。
  const file = new File([buffer.slice(0) as BlobPart], entry.fileName, { type: "application/zip" });
  const result = await importDemoFile(file, {
    tags: entry.tags,
    sourceDemPath: entry.sourceDemPath ?? null,
    lowMemory: true
  });
  return result.entry;
}

/** 仅重建失败/过期 producer：仍从同一 ZIP 重新提取，但绝不触碰其它 active generation。 */
export async function rebuildProducerFromZip(id: string, producer: PersistedProducer): Promise<ProducerPersistResult | null> {
  const [entry, buffer] = await Promise.all([demoMeta.get<StudioDemoEntry>(id), demoBlobs.get(id)]);
  if (!entry || !buffer) return null;
  const result = await importInWorker(buffer.slice(0), matchIdForEntry(entry), false);
  const [persisted] = await persistAnalysis(result.data, id, [producer]);
  if (!persisted) return null;
  const statuses = { ...entry.producerStatuses, [producer]: persisted.status };
  await demoMeta.put(id, normalizeEntry({
    ...entry,
    producerStatuses: statuses,
    builtWith: statuses["base-facts"] === "current" ? currentBuiltWith() : undefined,
  }));
  return persisted;
}

/** 取解析后的 DemoPackage：内存 → ZIP 重建。仅用于逐场证据/工作台，不作为聚合缓存。 */
export function getDemoPackage(id: string): Promise<DemoPackage> {
  const cached = pkgInFlight.get(id);
  if (cached) return cached;
  const loading = (async () => {
    const buffer = await demoBlobs.get(id);
    if (!buffer) throw new Error("demo 不存在或已被删除");
    return parseZipInWorker(buffer);
  })();
  pkgInFlight.set(id, loading);
  void loading.then(
    () => { if (pkgInFlight.get(id) === loading) pkgInFlight.delete(id); },
    () => { if (pkgInFlight.get(id) === loading) pkgInFlight.delete(id); },
  );
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
