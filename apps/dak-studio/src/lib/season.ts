import { buildSeasonCohort, type PlayerIdentityMap } from "@cs2dak/cohort";
import {
  buildAllPlayerSeasonProfiles,
  buildPlayerSeasonInsights,
  buildPlayerMechanicsProfile,
  buildPlayerWeaponStats,
  buildDuelInsights,
  buildSeasonLeaderboardModel,
  buildTournamentInsights,
  buildTeamComparison,
  buildPlayerFlashSummaries,
  type SeasonInsightsDemo,
  type PlayerFlashSummary,
  type PlayerSeasonInsights,
  type PlayerMechanicsProfile,
  type PlayerWeaponStat,
  type TournamentInsights,
  type TeamComparisonModel
} from "@cs2dak/presentation";
import { touchLimitedCache } from "./idb";
import { getStorage } from "./storage";
import { loadTriLookup } from "./tri";
import type {
  DuelInsightsModel,
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
const CACHE_VERSION = 7;

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

// ── 持久层：StorageAdapter 的 "cache" 命名空间。touchedAt 拆到伴随命名空间
//    "cache-meta"，命中只刷新轻量时间戳，不重写数 MB 的 summary 本体；prune 也只读它。 ──
const cacheStore = getStorage().records("cache");
const cacheMeta = getStorage().records("cache-meta");

/** 按 key 多条缓存（不同 scope 互不覆盖），LRU 清理只保留最近 MAX_CACHE_KEYS 条。 */
const MAX_CACHE_KEYS = 12;

interface MetaRecord {
  touchedAt: number;
}

interface PersistedValue<T> {
  key: string;
  touchedAt: number;
  value: T;
}

/** 只刷新 LRU 时间戳（轻量命名空间），不重写 summary 本体。 */
async function touchMeta(key: string): Promise<void> {
  try {
    await cacheMeta.put<MetaRecord>(key, { touchedAt: Date.now() });
  } catch { /* 忽略 */ }
}

async function readPersistedValue<T>(key: string): Promise<T | undefined> {
  try {
    const record = await cacheStore.get<PersistedValue<T>>(key);
    if (record) {
      await touchMeta(key);
      return record.value;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function writePersistedValue<T>(key: string, value: T): Promise<void> {
  try {
    await cacheStore.put<PersistedValue<T>>(key, { key, touchedAt: Date.now(), value });
    await touchMeta(key);
    void prunePersisted();
  } catch {
    // 写失败不影响功能
  }
}

/** 清理：旧版本 key（前缀不符）直接删，其余按 touchedAt 保留最近 MAX_CACHE_KEYS 条。
 *  只读 cache 的 key 列表与轻量 meta 命名空间，不反序列化任何 summary 本体。 */
async function prunePersisted(): Promise<void> {
  try {
    const keys = await cacheStore.keys();
    const metaEntries = await cacheMeta.entries<MetaRecord>();
    const touchedByKey = new Map<string, number>(metaEntries.map(([k, v]) => [k, v?.touchedAt ?? 0]));
    const prefix = `v${CACHE_VERSION}:`;
    const stale = keys.filter((k) => !k.startsWith(prefix));
    const staleSet = new Set(stale);
    const live = keys
      .filter((k) => !staleSet.has(k))
      .sort((a, b) => (touchedByKey.get(b) ?? 0) - (touchedByKey.get(a) ?? 0));
    const toDelete = [...stale, ...live.slice(MAX_CACHE_KEYS)];
    for (const k of toDelete) {
      await cacheStore.delete(k);
      await cacheMeta.delete(k);
    }
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
export function getSeasonDemos(entries: StudioDemoEntry[], identity?: IdentityOptions): Promise<SeasonInsightsDemo[]> {
  const key = keyOf(entries, identity?.version);
  if (demosPromise && key === demosKey) return demosPromise;
  demosKey = key;
  demosPromise = loadDemosWithRenames(entries, identity?.teamRenames);
  demosPromise.catch(() => {
    demosKey = "";
    demosPromise = null;
  });
  return demosPromise;
}

export interface PlayerSeasonDetails {
  insights: PlayerSeasonInsights;
  weaponStats: PlayerWeaponStat[];
  mechanics: PlayerMechanicsProfile;
}

const DETAILS_CACHE_LIMIT = 6;
const SMALL_CACHE_LIMIT = 3;
const detailsCache = new Map<string, Promise<PlayerSeasonDetails>>();
const flashCache = new Map<string, Promise<PlayerFlashSummary[]>>();
const duelInsightsCache = new Map<string, Promise<DuelInsightsModel>>();
const teamComparisonCache = new Map<string, Promise<TeamComparisonModel>>();

/** 选中选手的逐场洞察：只返回小结果，不把全量 DemoPackage 长期放进 React state。 */
export function getPlayerSeasonDetails(entries: StudioDemoEntry[], steamIds: string[], identity?: IdentityOptions): Promise<PlayerSeasonDetails> {
  const key = `${keyOf(entries, identity?.version)}:player:${[...steamIds].sort().join(",")}`;
  const cached = detailsCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<PlayerSeasonDetails>(key);
    if (persisted) return persisted;
    const demos = await getSeasonDemos(entries, identity);
    const visibilityFor = await loadTriLookup(demos.map((demo) => demo.pkg.match.mapName));
    const details = {
      insights: buildPlayerSeasonInsights(demos, steamIds),
      weaponStats: buildPlayerWeaponStats(demos, steamIds),
      mechanics: buildPlayerMechanicsProfile(demos, steamIds, { visibilityFor })
    };
    clearPkgCache();
    void writePersistedValue(key, details);
    return details;
  })();
  return touchLimitedCache(detailsCache, key, loading, DETAILS_CACHE_LIMIT);
}

/** 对枪实验室：DuelInsights 是 LOS-heavy 派生模型，持久化后反复切页不再重跑 tri 判定。 */
const DUEL_CACHE_VER = 2;
export function getDuelInsights(entries: StudioDemoEntry[], identity?: IdentityOptions): Promise<DuelInsightsModel> {
  const key = `${keyOf(entries, identity?.version)}:duels:v${DUEL_CACHE_VER}`;
  const cached = duelInsightsCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<DuelInsightsModel>(key);
    if (persisted) return persisted;
    const demos = await getSeasonDemos(entries, identity);
    const visibilityFor = await loadTriLookup(demos.map((demo) => demo.pkg.match.mapName));
    const model = buildDuelInsights(demos, { visibilityFor });
    clearPkgCache();
    void writePersistedValue(key, model);
    return model;
  })();
  return touchLimitedCache(duelInsightsCache, key, loading, SMALL_CACHE_LIMIT);
}

/** 道具页多人 Flash Value：单次扫描所有 demo，避免每个选手重复扫全量 events。 */
export function getPlayerFlashSummaries(
  entries: StudioDemoEntry[],
  players: Array<{ playerKey: string; name: string; steamIds: string[] }>,
  identity?: IdentityOptions
): Promise<PlayerFlashSummary[]> {
  const key = `${keyOf(entries, identity?.version)}:flash:${players.map((p) => `${p.playerKey}=${p.steamIds.join(",")}`).sort().join("|")}`;
  const cached = flashCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<PlayerFlashSummary[]>(key);
    if (persisted) return persisted;
    const demos = await getSeasonDemos(entries, identity);
    const summaries = buildPlayerFlashSummaries(demos, players);
    clearPkgCache();
    void writePersistedValue(key, summaries);
    return summaries;
  })();
  return touchLimitedCache(flashCache, key, loading, SMALL_CACHE_LIMIT);
}

const tournamentInsightsCache = new Map<string, Promise<TournamentInsights | null>>();

/** 赛事/经济页面只需要 TournamentInsights，不必冷启动时构建 cohort + profiles + RR/PRISM。 */
export function getTournamentInsights(entries: StudioDemoEntry[], identity?: IdentityOptions): Promise<TournamentInsights | null> {
  const key = `${keyOf(entries, identity?.version)}:tournament`;
  const cached = tournamentInsightsCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<TournamentInsights | null>(key);
    if (persisted !== undefined) return persisted;
    const demos = await getSeasonDemos(entries, identity);
    const insights = demos.length > 0 ? buildTournamentInsights(demos) : null;
    clearPkgCache();
    void writePersistedValue(key, insights);
    return insights;
  })();
  return touchLimitedCache(tournamentInsightsCache, key, loading, SMALL_CACHE_LIMIT);
}

export async function getTeamComparison(entries: StudioDemoEntry[], identity?: IdentityOptions): Promise<TeamComparisonModel> {
  const key = `${keyOf(entries, identity?.version)}:team-comparison`;
  const cached = teamComparisonCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<TeamComparisonModel>(key);
    if (persisted) return persisted;
    const demos = await getSeasonDemos(entries, identity);
    const model = buildTeamComparison(demos);
    clearPkgCache();
    void writePersistedValue(key, model);
    return model;
  })();
  return touchLimitedCache(teamComparisonCache, key, loading, SMALL_CACHE_LIMIT);
}

const seasonSummaryCache = new Map<string, Promise<SeasonSummary>>();

/** 聚合摘要：优先持久缓存命中（不触碰 ZIP），未命中才全量解析并回写。
 *  传入 identity 时将其并入缓存 key，identityMap 作为归并参数传给 buildSeasonCohort。
 *  teamRenames 在加载阶段应用，同名队伍自动合并。聚合后释放 pkgCache 降低峰值内存。 */
export function getSeasonSummary(entries: StudioDemoEntry[], identity?: IdentityOptions): Promise<SeasonSummary> {
  const key = keyOf(entries, identity?.version);
  const cached = seasonSummaryCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<SeasonSummary>(key);
    if (persisted) return persisted;
    const demos = await getSeasonDemos(entries, identity);
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
    void writePersistedValue(key, summary);
    return summary;
  })();
  return touchLimitedCache(seasonSummaryCache, key, loading, SMALL_CACHE_LIMIT);
}
