import type { PlayerIdentityMap } from "@cs2dak/cohort";
import { getStorage } from "./storage";

/**
 * 选手身份归并存储。
 * - 经 StorageAdapter 的 "identity"（当前状态）/ "identity-audit"（审计）命名空间持久化。
 * - version 每次变更 +1，调用方将其并入 season 缓存 key。
 * - 审计留最近 MAX_AUDIT 条；每条保存变更前快照，支持单步撤销。
 */

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

interface AuditEntry {
  id: string;
  timestamp: number;
  description: string;
  snapshot: IdentityStoreState;
}

const STATE_KEY = "current";
const MAX_AUDIT = 20;

const EMPTY_STATE: IdentityStoreState = { version: 0, mappings: [], teamRenames: {} };

const stateStore = () => getStorage().records("identity");
const auditStore = () => getStorage().records("identity-audit");

export interface TeamRenameGroup {
  displayName: string;
  originals: string[];
  matchCount: number;
}

export async function loadIdentityState(): Promise<IdentityStoreState> {
  try {
    const record = await stateStore().get<IdentityStoreState>(STATE_KEY);
    return record ?? EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

async function commitChange(
  current: IdentityStoreState,
  next: IdentityStoreState,
  description: string
): Promise<IdentityStoreState> {
  // 写新状态
  await stateStore().put(STATE_KEY, next);
  // 写审计（保存变更前快照）
  const entry: AuditEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    description,
    snapshot: current
  };
  await auditStore().put(entry.id, entry);
  // 清理超出上限的旧条目
  const all = await auditStore().getAll<AuditEntry>();
  if (all.length > MAX_AUDIT) {
    const stale = all.sort((a, b) => a.timestamp - b.timestamp).slice(0, all.length - MAX_AUDIT);
    for (const e of stale) await auditStore().delete(e.id);
  }
  return next;
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

/** 将多个 steamId64 归并到同一身份。primary 是保留的主 playerKey 的 steamId64。 */
export async function mergeIdentities(
  current: IdentityStoreState,
  primarySteamId: string,
  secondarySteamIds: string[],
  displayName: string
): Promise<IdentityStoreState> {
  const next = applyMerge(current, primarySteamId, secondarySteamIds, displayName);
  return commitChange(current, next, `合并 ${next.mappings.at(-1)?.steamIds.length ?? 0} 个账号 → ${displayName}`);
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

/** 将已归并身份拆分：把指定 steamIds 从 playerKey 的 mapping 中移除，各自还原为默认身份。 */
export async function splitIdentity(
  current: IdentityStoreState,
  playerKey: string,
  steamIdsToSplit: string[]
): Promise<IdentityStoreState> {
  const next = applySplit(current, playerKey, steamIdsToSplit);
  return commitChange(current, next, `拆分 ${steamIdsToSplit.length} 个账号从 ${playerKey}`);
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
  return { ...current, version: current.version + 1, mappings };
}

/** 修改选手的显示名。 */
export async function renamePlayer(
  current: IdentityStoreState,
  playerKey: string,
  newDisplayName: string
): Promise<IdentityStoreState> {
  const next = applyRename(current, playerKey, newDisplayName);
  return commitChange(current, next, `重命名 ${playerKey} → ${newDisplayName}`);
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

export function displayTeamName(teamName: string, teamRenames: Record<string, string> = {}): string {
  return teamRenames[teamName] ?? teamName;
}

export function originalTeamNamesForDisplay(
  displayName: string,
  teamRenames: Record<string, string> = {}
): string[] {
  const names = new Set<string>([displayName]);
  for (const [original, display] of Object.entries(teamRenames)) {
    if (display === displayName || original === displayName) names.add(original);
  }
  return [...names].sort();
}

export function teamRenameGroups(
  matches: Array<{ teamA: string; teamB: string }>,
  teamRenames: Record<string, string> = {}
): TeamRenameGroup[] {
  const byDisplay = new Map<string, { originals: Set<string>; matchIds: Set<number> }>();
  matches.forEach((match, index) => {
    for (const rawName of [match.teamA, match.teamB]) {
      const display = displayTeamName(rawName, teamRenames);
      const group = byDisplay.get(display) ?? { originals: new Set<string>(), matchIds: new Set<number>() };
      group.originals.add(rawName);
      group.matchIds.add(index);
      byDisplay.set(display, group);
    }
  });
  return [...byDisplay.entries()]
    .map(([displayName, group]) => ({
      displayName,
      originals: [...group.originals].sort(),
      matchCount: group.matchIds.size
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** 设置或清除队伍显示名（原名 → 空字符串即清除）。 */
export async function setTeamRename(
  current: IdentityStoreState,
  originalName: string,
  displayName: string
): Promise<IdentityStoreState> {
  const next = applyTeamRename(current, originalName, displayName);
  return commitChange(current, next, `队伍改名 "${originalName}" → "${displayName || "(清除)"}"`);
}

/** 撤销最近一次操作，返回恢复后的状态；无可撤销时返回 null。 */
export async function undoLastAction(current: IdentityStoreState): Promise<IdentityStoreState | null> {
  try {
    const all = await auditStore().getAll<AuditEntry>();
    if (all.length === 0) return null;
    const latest = all.sort((a, b) => b.timestamp - a.timestamp)[0];
    await stateStore().put(STATE_KEY, latest.snapshot);
    await auditStore().delete(latest.id);
    return latest.snapshot;
  } catch {
    return null;
  }
}

export async function listAuditEntries(): Promise<AuditEntry[]> {
  try {
    const all = await auditStore().getAll<AuditEntry>();
    return all.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
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
