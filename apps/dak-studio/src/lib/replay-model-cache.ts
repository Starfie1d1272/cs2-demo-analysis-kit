import type { MatchWorkspaceModel } from "@cs2dak/contract";

/** 回放 workspace 是 Studio 最大的常驻对象；预算保持私有，后续 benchmark 可调整。 */
export const REPLAY_MODEL_CACHE_ENTRY_LIMIT = 3;
export const REPLAY_MODEL_CACHE_BYTE_LIMIT = 160 * 1024 * 1024;

interface CacheEntry<T> { value: T; estimatedBytes: number }

function estimateScalarBytes(value: unknown): number {
  if (typeof value === "string") return value.length * 2;
  if (typeof value === "number") return 8;
  if (typeof value === "boolean") return 4;
  return 16;
}

/** 通用小对象兜底；大型 workspace 使用下面的领域估算器，避免完整序列化。 */
function estimateShallowBytes(value: unknown): number {
  if (Array.isArray(value)) return 64 + value.reduce((total, item) => total + estimateScalarBytes(item), 0);
  if (value && typeof value === "object") {
    return 64 + Object.entries(value).reduce(
      (total, [key, item]) => total + key.length * 2 + estimateScalarBytes(item),
      0,
    );
  }
  return Math.max(1, estimateScalarBytes(value));
}

export class ReplayModelCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly active = new Set<string>();

  constructor(
    private readonly entryLimit = REPLAY_MODEL_CACHE_ENTRY_LIMIT,
    private readonly byteLimit = REPLAY_MODEL_CACHE_BYTE_LIMIT,
    private readonly estimateBytes: (value: T) => number = estimateShallowBytes,
  ) {}

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
  invalidate(key: string): void { this.entries.delete(key); }
  clear(key?: string): void { if (key) this.invalidate(key); else this.entries.clear(); }
  get size(): number { return this.entries.size; }
  get estimatedBytes(): number { return [...this.entries.values()].reduce((total, entry) => total + entry.estimatedBytes, 0); }
  private put(key: string, value: T): void {
    this.entries.delete(key); this.entries.set(key, { value, estimatedBytes: Math.max(1, this.estimateBytes(value)) });
    while ((this.entries.size > this.entryLimit || this.estimatedBytes > this.byteLimit) && this.entries.size > 0) {
      const victim = [...this.entries.keys()].find((candidate) => !this.active.has(candidate));
      if (!victim) break;
      this.entries.delete(victim);
    }
  }
}

const REPLAY_FRAME_ESTIMATED_BYTES = 160;

/** 按已知列和数组长度估算 workspace；不创建与模型同体量的临时字符串。 */
export function estimateMatchWorkspaceModelBytes(model: MatchWorkspaceModel): number {
  let bytes = 64 * 1024;
  bytes += model.scoreboard.length * 1_024;
  bytes += model.rounds.length * 2_048;
  bytes += model.players.length * 4_096;
  bytes += model.economy.length * 512;
  bytes += model.weapons.length * 512;
  bytes += model.map.points.length * 192;
  bytes += model.adminQa.issues.length * 512;
  bytes += model.duels.matrix.reduce((total, row) => total + row.length * 8, 0);

  if (model.replay.available) {
    for (const round of model.replay.rounds) {
      bytes += 2_048;
      bytes += round.kills.length * 256;
      bytes += round.grenades.length * 384;
      bytes += (round.groundBombs?.length ?? 0) * 128;
      bytes += (round.groundDefusers?.length ?? 0) * 128;
      for (const player of round.players) {
        bytes += 512 + player.frames.length * REPLAY_FRAME_ESTIMATED_BYTES;
      }
      for (const projectile of round.projectiles) {
        bytes += 256 + (projectile.x.length + projectile.y.length + projectile.z.length) * 8;
      }
    }
  }
  return bytes;
}
