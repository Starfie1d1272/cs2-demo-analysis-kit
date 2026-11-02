import { getStorage } from "../storage";
import { CACHE_VERSION } from "./cache-version";
import { assertStoredFacts, FactsNotReadyError } from "../facts-readiness";
import { isAnalysisStale } from "../analysis-manifest";
import type { StudioDemoEntry } from "../demo-entry";

const DIRTY = "__analysis_dirty__";
const buckets = new Set<Map<string, Promise<unknown>>>();
let generation = 0;
export interface AnalysisDataSnapshot { readonly generation: number; readonly status: "ready" | "invalidating" | "error" }
let snapshot: AnalysisDataSnapshot = { generation, status: "invalidating" };
const listeners = new Set<() => void>();
let ioQueue: Promise<unknown> = Promise.resolve();
let commitQueue: Promise<unknown> = Promise.resolve();
let pendingCommits = 0;
let initialization: Promise<void> | null = null;
const cache = () => getStorage().records("cache");
const meta = () => getStorage().records("cache-meta");
const revisionStore = () => getStorage().records("analysis-state");
let observedRevision: string | undefined;
const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("dak-analysis-change") : null;
if (channel) channel.onmessage = () => { clearMemory(); publish(snapshot.status, true); };
async function markRevision(): Promise<void> {
  await revisionStore().put("revision", crypto.randomUUID());
  channel?.postMessage("changed");
}
async function synchronizeRevision(): Promise<string | undefined> {
  const value = await revisionStore().get<string>("revision");
  if (observedRevision !== value) {
    observedRevision = value;
    clearMemory();
    publish(snapshot.status, true);
  }
  return value;
}
if (typeof window !== "undefined") {
  window.addEventListener("focus", () => { void synchronizeRevision().catch(() => {}); });
  // Native windows can have different origins, and notifications may be lost.
  window.setInterval(() => {
    if (document.visibilityState === "visible") void synchronizeRevision().catch(() => {});
  }, 2000);
}
async function readRevision(): Promise<string | undefined> {
  if (await meta().get(DIRTY)) throw new DOMException("Analysis query invalidated", "AbortError");
  return synchronizeRevision();
}
export async function beginStoredAnalysis(entries: readonly StudioDemoEntry[], allowStale = false): Promise<{ revision: string | undefined; generation: number }> {
  await assertStoredFacts(entries, allowStale);
  const revision = await readRevision();
  return { revision, generation };
}
export async function endStoredAnalysis(entries: readonly StudioDemoEntry[], before: { revision: string | undefined; generation: number }, allowStale = false): Promise<void> {
  await assertStoredFacts(entries, allowStale);
  if (await readRevision() !== before.revision) throw new DOMException("Analysis query invalidated", "AbortError");
  assertAnalysisGeneration(before.generation);
}
export async function withStoredAnalysis<T>(entries: readonly StudioDemoEntry[], load: () => Promise<T>, allowStale = false): Promise<T> {
  await ensureAnalysisDataReady();
  const before = await beginStoredAnalysis(entries, allowStale);
  const value = await load();
  await endStoredAnalysis(entries, before, allowStale);
  return value;
}
export async function assertExportReady(entryIds: readonly string[], expectedGeneration: number): Promise<void> {
  const revision = await readRevision();
  assertAnalysisGeneration(expectedGeneration);
  const records = await getStorage().readRecords(entryIds.map(key => ({ namespace: "demos", key })));
  const stale = records.filter(record => {
    const entry = record.exists ? record.value as StudioDemoEntry : null;
    return !entry || !!entry.pendingCommit || isAnalysisStale(entry.builtWith);
  }).map(record => record.key);
  if (stale.length) throw new FactsNotReadyError(stale);
  if (await readRevision() !== revision) throw new DOMException("Analysis query invalidated", "AbortError");
  assertAnalysisGeneration(expectedGeneration);
}
function io<T>(fn: () => Promise<T>): Promise<T> { const job = ioQueue.then(fn); ioQueue = job.catch(() => {}); return job; }
function commit<T>(fn: () => Promise<T>): Promise<T> {
  pendingCommits++;
  const job = commitQueue.then(fn).finally(() => { pendingCommits--; });
  commitQueue = job.catch(() => {});
  return job;
}
function publish(status: AnalysisDataSnapshot["status"], advance = false) {
  if (advance) generation++;
  if (snapshot.generation === generation && snapshot.status === status) return;
  snapshot = { generation, status };
  listeners.forEach(listener => listener());
}
function clearMemory() { for (const bucket of buckets) bucket.clear(); }
export function getAnalysisDataGeneration(): number { return generation; }
export function getAnalysisDataSnapshot(): AnalysisDataSnapshot { return snapshot; }
export function subscribeAnalysisDataInvalidation(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function assertAnalysisGeneration(value: number): void {
  if (value !== generation || snapshot.status !== "ready") throw new DOMException("Analysis query invalidated", "AbortError");
}
export function createAnalysisBucket<T>(): Map<string, Promise<T>> {
  const bucket = new Map<string, Promise<T>>(); buckets.add(bucket as Map<string, Promise<unknown>>); return bucket;
}
async function clearLocked(): Promise<void> {
  publish("invalidating", true); clearMemory();
  try {
    await io(async () => { await cache().deleteByPrefix(""); await meta().deleteByPrefix(""); });
    if (pendingCommits === 1) publish("ready");
  } catch (error) { publish("error"); throw error; }
}
export function invalidateAnalysisQueries(): Promise<void> {
  return commit(async () => {
    publish("invalidating", true); clearMemory();
    try { await io(() => meta().put(DIRTY, { dirty: true })); }
    catch (error) { publish("error"); throw error; }
    await clearLocked();
  });
}
export function ensureAnalysisDataReady(): Promise<void> {
  if (snapshot.status === "ready") return Promise.resolve();
  if (snapshot.status === "error") return Promise.reject(new Error("分析缓存不可用，请重试刷新"));
  if (!initialization) {
    initialization = commit(async () => {
      try {
        const dirty = await io(() => meta().get(DIRTY));
        if (dirty) await clearLocked(); else if (pendingCommits === 1) publish("ready");
      } catch (error) { publish("error"); throw error; }
    }).finally(() => { initialization = null; });
  }
  return initialization;
}
export function withAnalysisQueryInvalidation<T>(write: () => Promise<T>): Promise<T> {
  return commit(async () => {
    publish("invalidating", true); clearMemory();
    await markRevision();
    try { await io(() => meta().put(DIRTY, { dirty: true })); }
    catch (error) { publish("error"); throw new Error("无法记录分析缓存失效，未执行数据写入", { cause: error }); }
    let value: T;
    try { value = await write(); }
    catch (error) {
      try { await clearLocked(); await markRevision(); } catch (cacheError) { throw new AggregateError([error, cacheError], "数据写入失败，分析缓存刷新也失败"); }
      throw error;
    }
    try { await clearLocked(); await markRevision(); }
    catch (error) { throw new Error("数据已写入，分析缓存刷新失败；请重试刷新", { cause: error }); }
    return value;
  });
}
export async function readPersistedValue<T>(key: string, current: number): Promise<T | undefined> {
  return io(async () => {
    assertAnalysisGeneration(current);
    const record = await cache().get<{ value: T }>(key);
    assertAnalysisGeneration(current);
    if (record) await meta().put(key, { touchedAt: Date.now() });
    assertAnalysisGeneration(current);
    return record?.value;
  });
}
export async function writePersistedValue<T>(key: string, value: T, current: number): Promise<void> {
  await io(async () => {
    assertAnalysisGeneration(current);
    await cache().put(key, { key, touchedAt: Date.now(), value });
    assertAnalysisGeneration(current);
    await meta().put(key, { touchedAt: Date.now() });
    const keys = await cache().keys();
    const entries = await meta().entries<{ touchedAt: number }>();
    const touched = new Map(entries.filter(([k]) => k !== DIRTY).map(([k, v]) => [k, v.touchedAt]));
    const live = keys.filter(k => k.startsWith(`v${CACHE_VERSION}:`)).sort((a, b) => (touched.get(b) ?? 0) - (touched.get(a) ?? 0));
    for (const k of [...keys.filter(k => !k.startsWith(`v${CACHE_VERSION}:`)), ...live.slice(12)]) {
      assertAnalysisGeneration(current);
      await cache().delete(k); await meta().delete(k);
    }
    assertAnalysisGeneration(current);
  });
}
export async function cachedQuery<T>(bucket: Map<string, Promise<T>>, key: string, limit: number, ready: () => void, entries: readonly StudioDemoEntry[], load: (generation: number) => Promise<T>): Promise<T> {
  ready(); await ensureAnalysisDataReady(); ready();
  await assertStoredFacts(entries);
  const revision = await readRevision();
  const current = generation; assertAnalysisGeneration(current);
  const validate = async () => {
    await assertStoredFacts(entries);
    if (await readRevision() !== revision) throw new DOMException("Analysis query invalidated", "AbortError");
    assertAnalysisGeneration(current); ready();
  };
  const cached = bucket.get(key);
  if (cached) { const value = await cached; await validate(); return value; }
  const job = (async () => { const value = await load(current); assertAnalysisGeneration(current); ready(); return value; })();
  bucket.set(key, job);
  while (bucket.size > limit) bucket.delete(bucket.keys().next().value!);
  try { const value = await job; await validate(); return value; } catch (error) { if (bucket.get(key) === job) bucket.delete(key); throw error; }
}
