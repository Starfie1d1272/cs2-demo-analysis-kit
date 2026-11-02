import { getStorage } from "../storage";
import { CACHE_VERSION } from "./cache-version";

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
    try { await io(() => meta().put(DIRTY, { dirty: true })); }
    catch (error) { publish("error"); throw new Error("无法记录分析缓存失效，未执行数据写入", { cause: error }); }
    let value: T;
    try { value = await write(); }
    catch (error) {
      try { await clearLocked(); } catch (cacheError) { throw new AggregateError([error, cacheError], "数据写入失败，分析缓存刷新也失败"); }
      throw error;
    }
    try { await clearLocked(); }
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
export async function cachedQuery<T>(bucket: Map<string, Promise<T>>, key: string, limit: number, ready: () => void, load: (generation: number) => Promise<T>): Promise<T> {
  ready(); await ensureAnalysisDataReady(); ready();
  const current = generation; assertAnalysisGeneration(current);
  const cached = bucket.get(key);
  if (cached) { const value = await cached; assertAnalysisGeneration(current); ready(); return value; }
  const job = (async () => { const value = await load(current); assertAnalysisGeneration(current); ready(); return value; })();
  bucket.set(key, job);
  while (bucket.size > limit) bucket.delete(bucket.keys().next().value!);
  try { const value = await job; assertAnalysisGeneration(current); ready(); return value; } catch (error) { if (bucket.get(key) === job) bucket.delete(key); throw error; }
}
