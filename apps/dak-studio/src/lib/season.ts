import { buildSeasonCohort, type PlayerIdentityMap } from "@cs2dak/cohort";
import {
  buildAllPlayerSeasonProfiles,
  buildPlayerSeasonInsights,
  buildPlayerWeaponStats,
  buildSeasonLeaderboardModel,
  buildTournamentInsights,
  buildPlayerFlashSummaries,
  type SeasonInsightsDemo,
  type PlayerFlashSummary,
  type PlayerSeasonInsights,
  type PlayerWeaponStat,
  type TournamentInsights
} from "@cs2dak/presentation";
import type {
  PlayerSeasonProfile,
  SeasonCohortBundle,
  SeasonLeaderboardModel
} from "@cs2dak/contract";
import { clearPkgCache, getDemoPackage, matchIdForEntry, type StudioDemoEntry } from "./library";

export interface IdentityOptions {
  /** 与 IdentityStoreState.version 一致；0 表示无自定义映射。 */
  version: number;
  map: PlayerIdentityMap;
  /** 队伍原名 → 显示名；聚合时替换 pkg.match.teamA/B.name，同名队伍自动合并。 */
  teamRenames?: Record<string, string>;
}

/**
 * 跨场聚合缓存，两层：
 * - 内存：同一会话内 id 集合不变时复用。
 * - IndexedDB：派生产物（bundle/排行榜/档案/赛事 insights）持久化，
 *   重开应用时无需重新解压解析全部 ZIP——这是赛事中台首屏慢的主因。
 * 原始 DemoPackage 列表只在需要逐场证据（个人洞察）时经 getSeasonDemos 懒加载。
 */

/** 聚合算法/口径变化时 +1，旧缓存自动失效重算。 */
const CACHE_VERSION = 6;

export interface SeasonSummary {
  bundle: SeasonCohortBundle;
  leaderboard: SeasonLeaderboardModel;
  profiles: PlayerSeasonProfile[];
  insights: TournamentInsights | null;
}

function keyOf(entries: StudioDemoEntry[], identityVersion?: number): string {
  const idPart = identityVersion ? `:idv${identityVersion}` : "";
  return `v${CACHE_VERSION}${idPart}:` + entries.map((entry) => entry.id).sort().join("|");
}

// ── 持久层：独立小库，避免动主库（dak-studio）的 schema 版本 ──
const CACHE_DB = "dak-studio-cache";
const CACHE_STORE = "season";

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CACHE_STORE)) {
        request.result.createObjectStore(CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开缓存库"));
  });
}

/** 按 key 多条缓存（不同 scope 互不覆盖），LRU 清理只保留最近 MAX_CACHE_KEYS 条。 */
const MAX_CACHE_KEYS = 12;

interface PersistedSummary {
  key: string;
  touchedAt: number;
  summary: SeasonSummary;
}

interface PersistedTournamentInsights {
  key: string;
  touchedAt: number;
  insights: TournamentInsights | null;
}

function txRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readPersisted(key: string): Promise<SeasonSummary | null> {
  try {
    const db = await openCacheDb();
    const record = await txRequest(
      db.transaction(CACHE_STORE, "readonly").objectStore(CACHE_STORE).get(key) as IDBRequest<PersistedSummary | undefined>
    );
    if (record) {
      // 刷新 LRU 时间戳；失败无妨
      try {
        await txRequest(
          db.transaction(CACHE_STORE, "readwrite").objectStore(CACHE_STORE).put({ ...record, touchedAt: Date.now() }, key)
        );
      } catch { /* 忽略 */ }
    }
    db.close();
    return record?.summary ?? null;
  } catch {
    return null; // 缓存只是加速，读失败回落重算
  }
}

async function writePersisted(key: string, summary: SeasonSummary): Promise<void> {
  try {
    const db = await openCacheDb();
    const store = db.transaction(CACHE_STORE, "readwrite").objectStore(CACHE_STORE);
    await txRequest(store.put({ key, touchedAt: Date.now(), summary } satisfies PersistedSummary, key));
    db.close();
    void prunePersisted();
  } catch {
    // 写失败不影响功能
  }
}

async function readPersistedTournamentInsights(key: string): Promise<TournamentInsights | null | undefined> {
  try {
    const db = await openCacheDb();
    const record = await txRequest(
      db.transaction(CACHE_STORE, "readonly").objectStore(CACHE_STORE).get(key) as IDBRequest<PersistedTournamentInsights | undefined>
    );
    if (record) {
      try {
        await txRequest(
          db.transaction(CACHE_STORE, "readwrite").objectStore(CACHE_STORE).put({ ...record, touchedAt: Date.now() }, key)
        );
      } catch { /* 忽略 */ }
    }
    db.close();
    return record ? record.insights : undefined;
  } catch {
    return undefined;
  }
}

async function writePersistedTournamentInsights(key: string, insights: TournamentInsights | null): Promise<void> {
  try {
    const db = await openCacheDb();
    const store = db.transaction(CACHE_STORE, "readwrite").objectStore(CACHE_STORE);
    await txRequest(store.put({ key, touchedAt: Date.now(), insights } satisfies PersistedTournamentInsights, key));
    db.close();
    void prunePersisted();
  } catch {
    // 写失败不影响功能
  }
}

/** 清理：旧版本 key（前缀不符）直接删，其余按 touchedAt 保留最近 MAX_CACHE_KEYS 条。 */
async function prunePersisted(): Promise<void> {
  try {
    const db = await openCacheDb();
    const store = db.transaction(CACHE_STORE, "readwrite").objectStore(CACHE_STORE);
    const keys = await txRequest(store.getAllKeys() as IDBRequest<IDBValidKey[]>);
    const records = await txRequest(store.getAll() as IDBRequest<(PersistedSummary | { key?: string })[]>);
    const prefix = `v${CACHE_VERSION}:`;
    const rows = keys.map((k, i) => ({ k, record: records[i] as PersistedSummary | undefined }));
    const stale = rows.filter((row) => typeof row.k !== "string" || !row.k.startsWith(prefix));
    const live = rows
      .filter((row) => !stale.includes(row))
      .sort((a, b) => (b.record?.touchedAt ?? 0) - (a.record?.touchedAt ?? 0));
    for (const row of [...stale, ...live.slice(MAX_CACHE_KEYS)]) {
      await txRequest(store.delete(row.k));
    }
    db.close();
  } catch {
    // 清理失败不影响功能
  }
}

// ── 内存层 ──
let demosKey = "";
let demosPromise: Promise<SeasonInsightsDemo[]> | null = null;

/** 分批并行加载 DemoPackage 并应用队伍改名。批大小 BATCH_SIZE 控制内存峰值。 */
const BATCH_SIZE = 5;

async function loadDemosWithRenames(
  entries: StudioDemoEntry[],
  teamRenames?: Record<string, string>
): Promise<SeasonInsightsDemo[]> {
  const sorted = [...entries].sort((a, b) => a.fileName.localeCompare(b.fileName));
  const demos: SeasonInsightsDemo[] = [];
  const hasRenames = teamRenames && Object.keys(teamRenames).length > 0;
  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    const batch = sorted.slice(i, i + BATCH_SIZE);
    const loaded = await Promise.all(
      batch.map(async (entry) => {
        const pkg = await getDemoPackage(entry.id);
        if (hasRenames) {
          const rename = (name: string | null) => name == null ? name : (teamRenames![name] ?? name);
          pkg.match.teamA.name = rename(pkg.match.teamA.name);
          pkg.match.teamB.name = rename(pkg.match.teamB.name);
        }
        return { matchId: matchIdForEntry(entry), pkg };
      })
    );
    demos.push(...loaded);
  }
  return demos;
}

/** 与 cohort 同源的 {matchId, pkg} 列表；只有逐场派生（个人洞察）才需要。 */
export function getSeasonDemos(entries: StudioDemoEntry[]): Promise<SeasonInsightsDemo[]> {
  const key = keyOf(entries);
  if (demosPromise && key === demosKey) return demosPromise;
  demosKey = key;
  demosPromise = loadDemosWithRenames(entries);
  demosPromise.catch(() => {
    demosKey = "";
    demosPromise = null;
  });
  return demosPromise;
}

export interface PlayerSeasonDetails {
  insights: PlayerSeasonInsights;
  weaponStats: PlayerWeaponStat[];
}

const DETAILS_CACHE_LIMIT = 24;
const detailsCache = new Map<string, Promise<PlayerSeasonDetails>>();
const flashCache = new Map<string, Promise<PlayerFlashSummary[]>>();

function touchLimitedCache<T>(cache: Map<string, Promise<T>>, key: string, value: Promise<T>, limit: number): Promise<T> {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
  value.catch(() => cache.delete(key));
  return value;
}

/** 选中选手的逐场洞察：只返回小结果，不把全量 DemoPackage 长期放进 React state。 */
export function getPlayerSeasonDetails(entries: StudioDemoEntry[], steamIds: string[]): Promise<PlayerSeasonDetails> {
  const key = `${keyOf(entries)}:player:${[...steamIds].sort().join(",")}`;
  const cached = detailsCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const demos = await loadDemosWithRenames(entries);
    const details = {
      insights: buildPlayerSeasonInsights(demos, steamIds),
      weaponStats: buildPlayerWeaponStats(demos, steamIds)
    };
    clearPkgCache();
    return details;
  })();
  return touchLimitedCache(detailsCache, key, loading, DETAILS_CACHE_LIMIT);
}

/** 道具页多人 Flash Value：单次扫描所有 demo，避免每个选手重复扫全量 events。 */
export function getPlayerFlashSummaries(
  entries: StudioDemoEntry[],
  players: Array<{ playerKey: string; name: string; steamIds: string[] }>
): Promise<PlayerFlashSummary[]> {
  const key = `${keyOf(entries)}:flash:${players.map((p) => `${p.playerKey}=${p.steamIds.join(",")}`).sort().join("|")}`;
  const cached = flashCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const demos = await loadDemosWithRenames(entries);
    const summaries = buildPlayerFlashSummaries(demos, players);
    clearPkgCache();
    return summaries;
  })();
  return touchLimitedCache(flashCache, key, loading, DETAILS_CACHE_LIMIT);
}

let summaryKey = "";
let summaryPromise: Promise<SeasonSummary> | null = null;
let tournamentKey = "";
let tournamentPromise: Promise<TournamentInsights | null> | null = null;

/** 赛事/经济页面只需要 TournamentInsights，不必冷启动时构建 cohort + profiles + RR/PRISM。 */
export function getTournamentInsights(entries: StudioDemoEntry[], identity?: IdentityOptions): Promise<TournamentInsights | null> {
  const key = `${keyOf(entries, identity?.version)}:tournament`;
  if (tournamentPromise && key === tournamentKey) return tournamentPromise;
  tournamentKey = key;
  tournamentPromise = (async () => {
    const persisted = await readPersistedTournamentInsights(key);
    if (persisted !== undefined) return persisted;
    const demos = await loadDemosWithRenames(entries, identity?.teamRenames);
    const insights = demos.length > 0 ? buildTournamentInsights(demos) : null;
    clearPkgCache();
    void writePersistedTournamentInsights(key, insights);
    return insights;
  })();
  tournamentPromise.catch(() => {
    tournamentKey = "";
    tournamentPromise = null;
  });
  return tournamentPromise;
}

/** 聚合摘要：优先持久缓存命中（不触碰 ZIP），未命中才全量解析并回写。
 *  传入 identity 时将其并入缓存 key，identityMap 作为归并参数传给 buildSeasonCohort。
 *  teamRenames 在加载阶段应用，同名队伍自动合并。聚合后释放 pkgCache 降低峰值内存。 */
export function getSeasonSummary(entries: StudioDemoEntry[], identity?: IdentityOptions): Promise<SeasonSummary> {
  const key = keyOf(entries, identity?.version);
  if (summaryPromise && key === summaryKey) return summaryPromise;
  summaryKey = key;
  summaryPromise = (async () => {
    const persisted = await readPersisted(key);
    if (persisted) return persisted;
    const demos = await loadDemosWithRenames(entries, identity?.teamRenames);
    const cohortOpts = identity?.version ? { identityMap: identity.map } : {};
    const bundle = buildSeasonCohort(demos, cohortOpts);
    const summary: SeasonSummary = {
      bundle,
      leaderboard: buildSeasonLeaderboardModel(bundle),
      profiles: buildAllPlayerSeasonProfiles(bundle),
      insights: demos.length > 0 ? buildTournamentInsights(demos) : null
    };
    // 聚合完成，释放 DemoPackage 缓存降低峰值内存；后续读取从 derived 表重建
    clearPkgCache();
    void writePersisted(key, summary);
    return summary;
  })();
  summaryPromise.catch(() => {
    summaryKey = "";
    summaryPromise = null;
  });
  return summaryPromise;
}
