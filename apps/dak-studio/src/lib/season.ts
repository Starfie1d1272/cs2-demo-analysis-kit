import { buildSeasonCohort } from "@cs2dak/cohort";
import {
  buildAllPlayerSeasonProfiles,
  buildSeasonLeaderboardModel
} from "@cs2dak/presentation";
import type {
  PlayerSeasonProfile,
  SeasonCohortBundle,
  SeasonLeaderboardModel
} from "@cs2dak/contract";
import { getDemoPackage, matchIdForEntry, type StudioDemoEntry } from "./library";

/**
 * 跨场聚合缓存：资料库内容（id 集合）不变时复用同一个 cohort bundle，
 * 选手档案与排行榜共享一次聚合。
 */

export interface SeasonData {
  bundle: SeasonCohortBundle;
  leaderboard: SeasonLeaderboardModel;
  profiles: PlayerSeasonProfile[];
}

let cacheKey = "";
let cachePromise: Promise<SeasonData> | null = null;

export function getSeasonData(entries: StudioDemoEntry[]): Promise<SeasonData> {
  const key = entries
    .map((entry) => entry.id)
    .sort()
    .join("|");
  if (cachePromise && key === cacheKey) return cachePromise;
  cacheKey = key;
  cachePromise = (async () => {
    const demos = await Promise.all(
      [...entries]
        .sort((a, b) => a.fileName.localeCompare(b.fileName))
        .map(async (entry) => ({
          matchId: matchIdForEntry(entry),
          pkg: await getDemoPackage(entry.id)
        }))
    );
    const bundle = buildSeasonCohort(demos);
    return {
      bundle,
      leaderboard: buildSeasonLeaderboardModel(bundle),
      profiles: buildAllPlayerSeasonProfiles(bundle)
    };
  })();
  cachePromise.catch(() => {
    cacheKey = "";
    cachePromise = null;
  });
  return cachePromise;
}
