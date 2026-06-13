/**
 * 关注选手（"这是我"）。普通玩家自我复盘入口：
 * 选手档案默认定位到关注选手，列表置顶标星。
 * 经 StorageAdapter 的 "kv" 命名空间持久化（取代旧 localStorage，统一走可换后端的接缝）。
 */

import { getStorage } from "./storage";

export interface PinnedPlayer {
  playerKey: string;
  steamIds: string[];
  name: string;
}

const KEY = "pinned-player";
const kv = () => getStorage().records("kv");

export async function getPinnedPlayer(): Promise<PinnedPlayer | null> {
  try {
    const parsed = await kv().get<PinnedPlayer>(KEY);
    if (!parsed || typeof parsed.playerKey !== "string" || !Array.isArray(parsed.steamIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setPinnedPlayer(pinned: PinnedPlayer | null): Promise<void> {
  try {
    if (pinned) await kv().put(KEY, pinned);
    else await kv().delete(KEY);
  } catch {
    // 偏好持久化失败不阻塞 UI
  }
}

/** 在档案列表中找回关注选手：playerKey 优先，身份归并变化时退回 steamId 交集。 */
export function matchPinned<T extends { playerKey: string; steamIds: string[] }>(
  pinned: PinnedPlayer | null,
  profiles: T[]
): T | null {
  if (!pinned) return null;
  return (
    profiles.find((p) => p.playerKey === pinned.playerKey) ??
    profiles.find((p) => p.steamIds.some((id) => pinned.steamIds.includes(id))) ??
    null
  );
}
