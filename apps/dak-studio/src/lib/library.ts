import { loadDemoManifestFromZip, loadDemoPackageFromZip, buildMatchRadarField, type DemoPackageLoadProfile } from "@cs2dak/core";
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
  /** cs2df 写入的 raw .dem SHA-256；与本地 ZIP record id 有意分离。 */
  demoSha256: string | null;
  /** 用户标签（赛事、阶段等），导入时附加，可后续编辑。 */
  tags: string[];
  /** 本机原始 .dem 路径，仅用于桌面端重新导出；浏览器/ZIP 导入为空。 */
  sourceDemPath?: string | null;
  /** 榨 facts 时所用的 facts revision（AnalysisManifest）；缺失=历史条目，视为旧口径。 */
  builtWith?: BuiltWith;
  /** 原始 v3 ZIP 字节数（导入时记录）；用于资产占用统计，免去读全部 blob。 */
  sizeBytes?: number;
  meta: DemoMeta;
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

// ── 存储命名空间（经 StorageAdapter 接缝，后端可换） ──
const demoMeta = getStorage().records("demos"); // StudioDemoEntry by id
const demoBlobs = getStorage().blobs("demos"); // ZIP 原始字节 by id

interface DemoIdentityIndex {
  /** Indexes are intentionally identifiers only; metadata is always read fresh. */
  byId: Map<string, string | null>;
  byDemoSha256: Map<string, string[]>;
  errors: string[];
}

let identityIndex: DemoIdentityIndex | null = null;
let identityIndexPromise: Promise<DemoIdentityIndex> | null = null;

/** demo 元数据补默认值（tags / sourceDemPath 为后加字段）。 */
function normalizeEntry(entry: StudioDemoEntry): StudioDemoEntry {
  return {
    id: entry.id,
    fileName: entry.fileName,
    importedAt: entry.importedAt,
    demoSha256: typeof entry.demoSha256 === "string" ? entry.demoSha256.toLowerCase() : null,
    tags: entry.tags ?? [],
    sourceDemPath: entry.sourceDemPath ?? null,
    builtWith: entry.builtWith,
    sizeBytes: entry.sizeBytes,
    meta: { ...entry.meta, serverName: entry.meta.serverName ?? null, matchDate: entry.meta.matchDate ?? null }
  };
}

function addToIdentityIndex(index: DemoIdentityIndex, entry: StudioDemoEntry): void {
  const previousDemoSha256 = index.byId.get(entry.id);
  if (previousDemoSha256) {
    const previousRows = index.byDemoSha256.get(previousDemoSha256) ?? [];
    index.byDemoSha256.set(previousDemoSha256, previousRows.filter((row) => row !== entry.id));
  }
  index.byId.set(entry.id, entry.demoSha256);
  if (entry.demoSha256) {
    const rows = index.byDemoSha256.get(entry.demoSha256) ?? [];
    index.byDemoSha256.set(entry.demoSha256, [...rows.filter((row) => row !== entry.id), entry.id]);
  }
}

async function buildDemoIdentityIndex(): Promise<DemoIdentityIndex> {
  const index: DemoIdentityIndex = { byId: new Map(), byDemoSha256: new Map(), errors: [] };
  const records = (await demoMeta.getAll<StudioDemoEntry>()).map(normalizeEntry);
  for (const entry of records) {
    let normalized = entry;
    if (!entry.demoSha256) {
      const buffer = await demoBlobs.get(entry.id);
      if (!buffer) {
        index.errors.push(`${entry.fileName}：原始 ZIP 缺失，无法回填 canonical raw Demo hash`);
      } else {
        try {
          const manifest = await loadDemoManifestFromZip(buffer);
          const demoSha256 = manifest.demo.hash?.toLowerCase() ?? null;
          if (demoSha256) {
            normalized = { ...entry, demoSha256 };
            await demoMeta.put(entry.id, normalized);
          }
        } catch (error) {
          index.errors.push(`${entry.fileName}：${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    addToIdentityIndex(index, normalized);
  }
  return index;
}

async function ensureDemoIdentityIndex(): Promise<DemoIdentityIndex> {
  if (identityIndex) return identityIndex;
  if (!identityIndexPromise) {
    identityIndexPromise = buildDemoIdentityIndex().then((index) => {
      identityIndex = index;
      identityIndexPromise = null;
      return index;
    }, (error) => {
      identityIndexPromise = null;
      throw error;
    });
  }
  return identityIndexPromise;
}

/** 按 canonical raw Demo SHA-256 找到最新导入的本地条目。 */
export async function findDemoEntryBySha256(sha256: string): Promise<StudioDemoEntry | null> {
  const normalizedSha256 = sha256.trim().toLowerCase();
  if (!normalizedSha256) return null;
  const index = await ensureDemoIdentityIndex();
  const entries = await Promise.all(
    (index.byDemoSha256.get(normalizedSha256) ?? []).map((entryId) => demoMeta.get<StudioDemoEntry>(entryId))
  );
  return entries
    .filter((entry): entry is StudioDemoEntry => entry != null)
    .map(normalizeEntry)
    .filter((entry) => entry.demoSha256 === normalizedSha256)
    .sort((a, b) => b.importedAt - a.importedAt || a.id.localeCompare(b.id))[0] ?? null;
}

/** 维护入口使用：强制重扫历史条目并回填缺失的 raw Demo hash。 */
export async function backfillDemoIdentities(): Promise<{ entries: StudioDemoEntry[]; backfilled: number; errors: string[] }> {
  const before = await demoMeta.getAll<StudioDemoEntry>();
  const missingBefore = before.filter((entry) => !entry.demoSha256).length;
  const index = await buildDemoIdentityIndex();
  identityIndex = index;
  const entries = (await demoMeta.getAll<StudioDemoEntry>()).map(normalizeEntry);
  return {
    entries,
    backfilled: missingBefore - entries.filter((entry) => !entry.demoSha256).length,
    errors: [...index.errors],
  };
}

export async function loadStoredDemoManifest(id: string): Promise<Awaited<ReturnType<typeof loadDemoManifestFromZip>> | null> {
  const buffer = await demoBlobs.get(id);
  return buffer ? loadDemoManifestFromZip(buffer) : null;
}

export async function saveDemoEntry(entry: StudioDemoEntry): Promise<void> {
  const normalized = normalizeEntry(entry);
  await demoMeta.put(normalized.id, normalized);
  if (identityIndex) addToIdentityIndex(identityIndex, normalized);
}

/** 删除 raw duplicate 的 meta/blob；调用方随后负责重建 survivor facts。 */
export async function removeDemoStorageOnly(id: string): Promise<void> {
  await Promise.all([demoMeta.delete(id), demoBlobs.delete(id)]);
  pkgCache.delete(id);
  if (identityIndex) {
    const previousDemoSha256 = identityIndex.byId.get(id);
    identityIndex.byId.delete(id);
    if (previousDemoSha256) {
      const rows = identityIndex.byDemoSha256.get(previousDemoSha256) ?? [];
      identityIndex.byDemoSha256.set(previousDemoSha256, rows.filter((row) => row !== id));
    }
  }
}

/** 删除某条 Demo 的 facts/derived 投影；调用方负责确认 matchId 不与 survivor 共享。 */
export async function removeDemoAnalysis(matchId: string): Promise<void> {
  await Promise.all([
    getFactsStore().deleteMatchFacts(matchId),
    getDerivedCacheStore().deleteMatch(matchId),
    getStorage().records("facts:cohort_rows").deleteByPrefix(matchId),
  ]);
}

/** facts 是否旧口径（factsRevision 与当前 AnalysisManifest 不一致）。 */
export function isFactsStale(entry: StudioDemoEntry): boolean {
  return isAnalysisStale(entry.builtWith);
}

/** facts / derived cache 是查询加速层；写失败不破坏库完整性（ZIP+元数据已落盘，可后续重建）。 */
async function persistAnalysis(data: ExtractedMatchData): Promise<void> {
  try {
    await Promise.all([
      getFactsStore().putMatchFacts(data.facts),
      getDerivedCacheStore().putMatchDerived(data.derived),
      // storage:3 以前误放在 facts namespace 的 cohort 聚合行只做一次清理，不再读取或生产。
      getStorage().records("facts:cohort_rows").deleteByPrefix(data.facts.matchId),
    ]);
  } catch {
    // 吞掉：facts 缺失只降级聚合查询。
  }
}

async function hasPersistedFacts(entry: StudioDemoEntry): Promise<boolean> {
  const rows = await getFactsStore().getLineups({ matchIds: [matchIdForEntry(entry)] });
  return rows.length > 0;
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
export function entryDate(entry: Pick<StudioDemoEntry, "fileName" | "meta">): string | null {
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
  profile?: DemoPackageLoadProfile; // op === "parse" 时选择 package load profile
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
        ? { id, op: "parse", buffer: task.buffer, profile: task.profile ?? "full" }
        : task.op === "radarField"
          ? { id, op: "radarField", buffer: task.buffer, matchId: task.matchId, triBaseUrl: triBaseUrl(), economy: task.economy ?? "gun" }
          : { id, op: "import", buffer: task.buffer, matchId: task.matchId, triBaseUrl: triBaseUrl(), calloutUrls: CALLOUT_GRID_URLS };
    idle.worker.postMessage(message, [task.buffer]);
  }
}

function parseZipInWorker(buffer: ArrayBuffer, keepFallback = true, profile: DemoPackageLoadProfile = "full"): Promise<DemoPackage> {
  if (typeof Worker === "undefined") {
    return loadDemoPackageFromZip(buffer, { profile });
  }
  const fallbackBuffer = keepFallback ? buffer.slice(0) : null;
  return new Promise<DemoPackage>((resolve, reject) => {
    taskQueue.push({
      op: "parse",
      buffer,
      fallbackBuffer,
      profile,
      resolve: resolve as (r: PoolResult) => void,
      reject,
      fallback: (buf) => loadDemoPackageFromZip(buf, { profile })
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
}

export interface ImportDemoOptions {
  tags?: string[];
  sourceDemPath?: string | null;
  replaceId?: string;
  /** 批量赛事导入使用：不保留 worker 回退副本，峰值限制为单图。 */
  lowMemory?: boolean;
  /** 比赛日期（YYYY-MM-DD）；事件包导入时由 series.completedAt 传入。 */
  matchDate?: string | null;
  /** 内部重建入口：即使 raw hash 已存在且 facts 当前，也必须重新抽取。 */
  forceReanalyze?: boolean;
}

/**
 * 导入一个 v3 ZIP；以内容哈希为 id，重复导入幂等（标签做并集）。
 * 解析失败抛错（带文件名）。
 */
export async function importDemoFile(file: File, options: ImportDemoOptions | string[] = []): Promise<ImportResult> {
  const { tags = [], sourceDemPath = null, replaceId, lowMemory = false, matchDate = null, forceReanalyze = false } = Array.isArray(options) ? { tags: options } : options;
  let buffer = await file.arrayBuffer();
  const id = await sha256Hex(buffer);

  const meta = demoMeta;
  const blobs = demoBlobs;
  const replacement = replaceId ? await meta.get<StudioDemoEntry>(replaceId) : undefined;
  let manifest;
  try {
    manifest = await loadDemoManifestFromZip(buffer);
  } catch (err) {
    throw new Error(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const demoSha256 = manifest.demo.hash?.toLowerCase() ?? null;
  const identityMatch = demoSha256 ? await findDemoEntryBySha256(demoSha256) : null;
  const existingById = await meta.get<StudioDemoEntry>(id);
  const existing = identityMatch ?? (existingById ? normalizeEntry(existingById) : undefined);

  const mergeDuplicateEntry = (current: StudioDemoEntry): StudioDemoEntry => normalizeEntry({
    ...current,
    demoSha256: current.demoSha256 ?? demoSha256,
    tags: normalizeTags([...(current.tags ?? []), ...tags]),
    sourceDemPath: sourceDemPath ?? current.sourceDemPath ?? null,
    sizeBytes: current.sizeBytes ?? file.size,
    // duplicate import only backfills an absent event-package date; it does not
    // replace the survivor's canonical metadata with a new parse.
    meta: current.meta.matchDate || !matchDate ? current.meta : { ...current.meta, matchDate },
  });

  // raw Demo identity is the dedupe key. A current facts revision can be reused
  // without parsing the full package; repair/rebuild opts into forceReanalyze.
  if (existing && !forceReanalyze && !isFactsStale(existing) && await hasPersistedFacts(existing)) {
    const mergedEntry = mergeDuplicateEntry(existing);
    await saveDemoEntry(mergedEntry);
    return {
      entry: mergedEntry,
      duplicate: true,
      replaced: Boolean(replacement && replacement.id !== existing.id),
      replacedId: replacement?.id,
    };
  }

  // facts 的 matchId 必须等于最终持久化条目的 matchId：重复导入沿用既有条目的 fileName，
  // 否则用本次文件名。故先定 matchId 再榨 facts（在 worker 里，含 replay 的整包不回主线程）。
  const matchId = matchIdForEntry({ fileName: existing?.fileName ?? file.name });
  const preservedSourceDemPath = sourceDemPath ?? existing?.sourceDemPath ?? replacement?.sourceDemPath ?? null;
  const preservedMatchDate = matchDate ?? existing?.meta.matchDate ?? replacement?.meta.matchDate ?? null;
  let result: ImportWorkerResult;
  try {
    result = await importInWorker(lowMemory ? buffer : buffer.slice(0), matchId, !lowMemory);
  } catch (err) {
    throw new Error(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const { meta: pkgMeta, data } = result;
  if (buffer.byteLength === 0) buffer = await file.arrayBuffer();

  const persistedId = existing?.id ?? id;
  const entry: StudioDemoEntry = normalizeEntry({
    id: persistedId,
    fileName: existing?.fileName ?? file.name,
    importedAt: existing?.importedAt ?? Date.now(),
    demoSha256,
    tags: normalizeTags([...(existing?.tags ?? []), ...tags]),
    sourceDemPath: preservedSourceDemPath,
    builtWith: currentBuiltWith(),
    sizeBytes: file.size,
    meta: { ...pkgMeta, matchDate: preservedMatchDate },
  });
  if (replacement) {
    entry.tags = normalizeTags([...(replacement.tags ?? []), ...entry.tags]);
    entry.sourceDemPath = sourceDemPath ?? replacement.sourceDemPath ?? null;
  }

  if (existing) {
    await Promise.all([blobs.put(persistedId, buffer), saveDemoEntry(entry)]);
    await persistAnalysis(data);
    if (replacement && replacement.id !== persistedId) {
      await removeDemoStorageOnly(replacement.id);
      void getFactsStore().deleteMatchFacts(matchIdForEntry(replacement));
      void getDerivedCacheStore().deleteMatch(matchIdForEntry(replacement));
    }
    return {
      entry,
      duplicate: true,
      replaced: Boolean(replacement && replacement.id !== persistedId),
      replacedId: replacement?.id
    };
  }
  await Promise.all([
    blobs.put(persistedId, buffer),
    saveDemoEntry(entry)
  ]);
  if (replacement && replacement.id !== persistedId) {
    await removeDemoStorageOnly(replacement.id);
    void getFactsStore().deleteMatchFacts(matchIdForEntry(replacement));
    void getDerivedCacheStore().deleteMatch(matchIdForEntry(replacement));
  }
  // facts 已在 worker 里榨好；后续聚合走 facts 投影，不再反序列化整包 derived。
  // 注意：不把整包放进 pkgCache —— 批量导入会让每场 DemoPackage（含完整 replay）常驻内存
  // 导致 OOM。需要整包时由 getDemoPackage 按需从 ZIP 懒加载即可。
  await persistAnalysis(data);
  return { entry, duplicate: false, replaced: Boolean(replacement && replacement.id !== persistedId), replacedId: replacement?.id };
}

/** 更新某条 demo 的标签。 */
export async function updateDemoTags(id: string, tags: string[]): Promise<void> {
  const record = await demoMeta.get<StudioDemoEntry>(id);
  if (record) {
    await saveDemoEntry({ ...record, tags: normalizeTags(tags) });
  }
}

/** 只更新本机原始 .dem 路径；用于给 ZIP/赛事包导入的条目补绑 raw demo。 */
export async function updateDemoSourcePath(id: string, sourceDemPath: string | null): Promise<void> {
  const record = await demoMeta.get<StudioDemoEntry>(id);
  if (record) {
    await saveDemoEntry({ ...record, sourceDemPath });
  }
}

export async function bulkUpdateTags(ids: string[], add: string[] = [], remove: string[] = []): Promise<void> {
  const targetIds = [...new Set(ids)];
  if (targetIds.length === 0) return;
  const addSet = normalizeTags(add);
  const removeSet = new Set(normalizeTags(remove));
  const records = await Promise.all(targetIds.map((id) => demoMeta.get<StudioDemoEntry>(id)));
  await Promise.all(
    records.filter((r): r is StudioDemoEntry => r != null).map((record) => {
      const nextTags = normalizeTags([...(record.tags ?? []).filter((tag) => !removeSet.has(tag)), ...addSet]);
      return saveDemoEntry({ ...record, tags: nextTags });
    })
  );
}

export async function removeDemo(id: string): Promise<void> {
  const record = await demoMeta.get<StudioDemoEntry>(id);
  await removeDemoStorageOnly(id);
  if (record) await removeDemoAnalysis(matchIdForEntry(record));
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
    lowMemory: true,
    forceReanalyze: true,
  });
  return result.entry;
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

/** 在线批量专用：从当前 ZIP File 或持久化 ZIP 解析一场，不进入 pkgCache，也不保留 worker 回退副本。 */
export async function loadDemoPackageTransient(id: string, sourceFile?: File): Promise<DemoPackage> {
  const buffer = sourceFile ? await sourceFile.arrayBuffer() : await demoBlobs.get(id);
  if (!buffer) throw new Error("demo 不存在或已被删除");
  return parseZipInWorker(buffer, false, "evidence");
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
  const all = await listDemoEntries();
  await Promise.all(
    all.map((record) => {
      let recordMut = record;
      let changed = false;
      if (recordMut.meta.teamAName === originalName) { recordMut = { ...recordMut, meta: { ...recordMut.meta, teamAName: displayName } }; changed = true; }
      if (recordMut.meta.teamBName === originalName) { recordMut = { ...recordMut, meta: { ...recordMut.meta, teamBName: displayName } }; changed = true; }
      return changed ? saveDemoEntry(recordMut) : Promise.resolve();
    })
  );
}
