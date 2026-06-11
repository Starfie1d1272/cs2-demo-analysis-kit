import { buildSeasonCohort } from "@cs2dak/cohort";
import {
  buildAllPlayerSeasonProfiles,
  buildSeasonLeaderboardModel,
  buildTournamentInsights,
  type SeasonInsightsDemo,
  type TournamentInsights
} from "@cs2dak/presentation";
import type {
  PlayerSeasonProfile,
  SeasonCohortBundle,
  SeasonLeaderboardModel
} from "@cs2dak/contract";
import { getDemoPackage, matchIdForEntry, type StudioDemoEntry } from "./library";

/**
 * 跨场聚合缓存，两层：
 * - 内存：同一会话内 id 集合不变时复用。
 * - IndexedDB：派生产物（bundle/排行榜/档案/赛事 insights）持久化，
 *   重开应用时无需重新解压解析全部 ZIP——这是赛事中台首屏慢的主因。
 * 原始 DemoPackage 列表只在需要逐场证据（个人洞察）时经 getSeasonDemos 懒加载。
 */

/** 聚合算法/口径变化时 +1，旧缓存自动失效重算。 */
const CACHE_VERSION = 3;

export interface SeasonSummary {
  bundle: SeasonCohortBundle;
  leaderboard: SeasonLeaderboardModel;
  profiles: PlayerSeasonProfile[];
  insights: TournamentInsights | null;
}

function keyOf(entries: StudioDemoEntry[]): string {
  return `v${CACHE_VERSION}:` + entries.map((entry) => entry.id).sort().join("|");
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

async function readPersisted(key: string): Promise<SeasonSummary | null> {
  try {
    const db = await openCacheDb();
    const record = await new Promise<{ key: string; summary: SeasonSummary } | undefined>((resolve, reject) => {
      const req = db.transaction(CACHE_STORE, "readonly").objectStore(CACHE_STORE).get("current");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record && record.key === key ? record.summary : null;
  } catch {
    return null; // 缓存只是加速，读失败回落重算
  }
}

async function writePersisted(key: string, summary: SeasonSummary): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const req = db
        .transaction(CACHE_STORE, "readwrite")
        .objectStore(CACHE_STORE)
        .put({ key, summary }, "current");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    // 写失败不影响功能
  }
}

// ── 内存层 ──
let demosKey = "";
let demosPromise: Promise<SeasonInsightsDemo[]> | null = null;

/** 与 cohort 同源的 {matchId, pkg} 列表；只有逐场派生（个人洞察）才需要。 */
export function getSeasonDemos(entries: StudioDemoEntry[]): Promise<SeasonInsightsDemo[]> {
  const key = keyOf(entries);
  if (demosPromise && key === demosKey) return demosPromise;
  demosKey = key;
  demosPromise = Promise.all(
    [...entries]
      .sort((a, b) => a.fileName.localeCompare(b.fileName))
      .map(async (entry) => ({
        matchId: matchIdForEntry(entry),
        pkg: await getDemoPackage(entry.id)
      }))
  );
  demosPromise.catch(() => {
    demosKey = "";
    demosPromise = null;
  });
  return demosPromise;
}

let summaryKey = "";
let summaryPromise: Promise<SeasonSummary> | null = null;

/** 聚合摘要：优先持久缓存命中（不触碰 ZIP），未命中才全量解析并回写。 */
export function getSeasonSummary(entries: StudioDemoEntry[]): Promise<SeasonSummary> {
  const key = keyOf(entries);
  if (summaryPromise && key === summaryKey) return summaryPromise;
  summaryKey = key;
  summaryPromise = (async () => {
    const persisted = await readPersisted(key);
    if (persisted) return persisted;
    const demos = await getSeasonDemos(entries);
    const bundle = buildSeasonCohort(demos);
    const summary: SeasonSummary = {
      bundle,
      leaderboard: buildSeasonLeaderboardModel(bundle),
      profiles: buildAllPlayerSeasonProfiles(bundle),
      insights: demos.length > 0 ? buildTournamentInsights(demos) : null
    };
    void writePersisted(key, summary);
    return summary;
  })();
  summaryPromise.catch(() => {
    summaryKey = "";
    summaryPromise = null;
  });
  return summaryPromise;
}
