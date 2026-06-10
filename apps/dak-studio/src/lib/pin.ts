/**
 * 关注选手（"这是我"）。普通玩家自我复盘入口：
 * 选手档案默认定位到关注选手，列表置顶标星。localStorage 持久化。
 */

export interface PinnedPlayer {
  playerKey: string;
  steamIds: string[];
  name: string;
}

const KEY = "dak-studio:pinned-player";

export function getPinnedPlayer(): PinnedPlayer | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PinnedPlayer;
    if (typeof parsed.playerKey !== "string" || !Array.isArray(parsed.steamIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setPinnedPlayer(pinned: PinnedPlayer | null): void {
  if (pinned) localStorage.setItem(KEY, JSON.stringify(pinned));
  else localStorage.removeItem(KEY);
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
