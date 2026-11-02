import type { PlayerIdentityMap } from "@cs2dak/cohort";

export interface IdentityMapping {
  /** 稳定 key，默认取主 steamId64：steam:${id} */
  playerKey: string;
  displayName: string;
  steamIds: string[];
  updatedAt: number;
}

export interface IdentityStoreState {
  version: number;
  mappings: IdentityMapping[];
  /** 原名 → 显示名；不在此表中的队伍名保持原样。 */
  teamRenames: Record<string, string>;
}

/** 纯状态变换：合并多个 steamId 到同一身份（不含持久化）。 */
export function applyMerge(
  current: IdentityStoreState,
  primarySteamId: string,
  secondarySteamIds: string[],
  displayName: string
): IdentityStoreState {
  const allSteamIds = [primarySteamId, ...secondarySteamIds];
  const mergedSet = new Set(allSteamIds);
  const kept = current.mappings.filter((m) => !m.steamIds.some((id) => mergedSet.has(id)));
  const existingIds = current.mappings
    .filter((m) => m.steamIds.some((id) => mergedSet.has(id)))
    .flatMap((m) => m.steamIds);
  const finalSteamIds = [...new Set([...allSteamIds, ...existingIds])];
  const merged: IdentityMapping = {
    playerKey: `steam:${primarySteamId}`,
    displayName,
    steamIds: finalSteamIds,
    updatedAt: Date.now()
  };
  return { ...current, version: current.version + 1, mappings: [...kept, merged] };
}

/** 纯状态变换：拆分指定 steamIds（不含持久化）。 */
export function applySplit(
  current: IdentityStoreState,
  playerKey: string,
  steamIdsToSplit: string[]
): IdentityStoreState {
  const splitSet = new Set(steamIdsToSplit);
  const mappings = current.mappings.map((m) => {
    if (m.playerKey !== playerKey) return m;
    const remaining = m.steamIds.filter((id) => !splitSet.has(id));
    if (remaining.length === 0) return null;
    return { ...m, steamIds: remaining, updatedAt: Date.now() };
  }).filter((m): m is IdentityMapping => m !== null);
  return { ...current, version: current.version + 1, mappings };
}

/** 纯状态变换：重命名（不含持久化）。 */
export function applyRename(
  current: IdentityStoreState,
  playerKey: string,
  newDisplayName: string
): IdentityStoreState {
  const mappings = current.mappings.map((m) =>
    m.playerKey === playerKey ? { ...m, displayName: newDisplayName, updatedAt: Date.now() } : m
  );
  if (!mappings.some(m => m.playerKey === playerKey)) {
    if (!playerKey.startsWith("steam:") || !playerKey.slice(6)) throw new Error("无法重命名没有 Steam 身份的选手");
    mappings.push({ playerKey, steamIds: [playerKey.slice(6)], displayName: newDisplayName, updatedAt: Date.now() });
  }
  return { ...current, version: current.version + 1, mappings };
}

/** 纯状态变换：设置/清除队伍显示名（不含持久化）。 */
export function applyTeamRename(
  current: IdentityStoreState,
  originalName: string,
  displayName: string
): IdentityStoreState {
  const teamRenames = { ...current.teamRenames };
  if (displayName.trim()) {
    teamRenames[originalName] = displayName.trim();
  } else {
    delete teamRenames[originalName];
  }
  return { ...current, version: current.version + 1, teamRenames };
}

/**
 * 将 IdentityMapping[] 转为 buildSeasonCohort 所需的 PlayerIdentityMap。
 * 只写入有实际归并效果（2+ steamId 或有 displayName 覆盖）的记录，减少 map 体积。
 */
export function buildCohortIdentityMap(mappings: IdentityMapping[]): PlayerIdentityMap {
  const map: PlayerIdentityMap = {};
  for (const m of mappings) {
    for (const steamId of m.steamIds) {
      map[steamId] = { playerKey: m.playerKey, displayName: m.displayName };
    }
  }
  return map;
}

export interface IdentityOptions {
  /** 与 IdentityStoreState.version 一致；0 表示无自定义映射。 */
  version: number;
  map: PlayerIdentityMap;
  /** 队伍原名 → 显示名；不会改变 stable entity ID 或决定 Tournament 归并。 */
  teamRenames?: Record<string, string>;
}
