/** 回放 workspace 是 Studio 最大的常驻对象；预算保持私有，后续 benchmark 可调整。 */
export const REPLAY_MODEL_CACHE_ENTRY_LIMIT = 3;
export const REPLAY_MODEL_CACHE_BYTE_LIMIT = 160 * 1024 * 1024;

interface CacheEntry<T> { value: T; estimatedBytes: number }

function estimateBytes(value: unknown): number {
  try { return Math.max(1, JSON.stringify(value).length * 2); }
  catch { return 1024 * 1024; }
}

export class ReplayModelCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly active = new Set<string>();

  constructor(private readonly entryLimit = REPLAY_MODEL_CACHE_ENTRY_LIMIT, private readonly byteLimit = REPLAY_MODEL_CACHE_BYTE_LIMIT) {}

  setActive(key: string | null): void { this.active.clear(); if (key) this.active.add(key); }
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.value;
  }
  load(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached) return Promise.resolve(cached);
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const loading = loader().then((value) => { this.put(key, value); return value; }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, loading);
    return loading;
  }
  clear(key?: string): void { if (key) this.entries.delete(key); else this.entries.clear(); }
  get size(): number { return this.entries.size; }
  get estimatedBytes(): number { return [...this.entries.values()].reduce((total, entry) => total + entry.estimatedBytes, 0); }
  private put(key: string, value: T): void {
    this.entries.delete(key); this.entries.set(key, { value, estimatedBytes: estimateBytes(value) });
    while ((this.entries.size > this.entryLimit || this.estimatedBytes > this.byteLimit) && this.entries.size > 0) {
      const victim = [...this.entries.keys()].find((candidate) => !this.active.has(candidate));
      if (!victim) break;
      this.entries.delete(victim);
    }
  }
}
