import type { PlayerIdentityMap } from "@cs2dak/cohort";
import { getStorage } from "./storage";
import { loadRoleDeclarationsForIdentity, migrateRoleDeclarationsForIdentity, saveRoleDeclarationsForIdentity, type RoleDeclarationsState, type StoredRoleDeclaration } from "./role-declarations";

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

interface RoleChange {
  id: string;
  before: StoredRoleDeclaration | null;
  after: StoredRoleDeclaration | null;
}

interface AuditEntry {
  id: string;
  timestamp: number;
  description: string;
  snapshot: IdentityStoreState;
  after?: IdentityStoreState;
  roleChanges?: RoleChange[];
}

interface PendingIdentityCommand {
  phase: "rollback" | "committed";
  before: IdentityStoreState;
  after: IdentityStoreState;
  roleChanges: RoleChange[];
  audit: AuditEntry;
  action: "add" | "remove";
}

const STATE_KEY = "current";
const PENDING_KEY = "pending-command";
const MAX_AUDIT = 20;
const EMPTY_STATE: IdentityStoreState = { version: 0, mappings: [], teamRenames: {} };
const stateStore = getStorage().records("identity");
const auditStore = getStorage().records("identity-audit");
let commandQueue: Promise<unknown> = Promise.resolve();

function serialized<T>(run: () => Promise<T>): Promise<T> {
  const result = commandQueue.then(run, run);
  commandQueue = result.catch(() => {});
  return result;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function roleChanges(before: RoleDeclarationsState, after: RoleDeclarationsState): RoleChange[] {
  const old = new Map(before.declarations.map(row => [row.id, row]));
  const next = new Map(after.declarations.map(row => [row.id, row]));
  return [...new Set([...old.keys(), ...next.keys()])].flatMap(id => {
    const a = old.get(id) ?? null;
    const b = next.get(id) ?? null;
    return same(a, b) ? [] : [{ id, before: a, after: b }];
  });
}

/** 只恢复命令改动过的声明；后续对同一声明的编辑必须由用户处理。 */
async function applyRoleChanges(changes: RoleChange[], reverse: boolean): Promise<void> {
  if (!changes.length) return;
  const current = await loadRoleDeclarationsForIdentity();
  const rows = new Map(current.declarations.map(row => [row.id, row]));
  for (const change of changes) {
    const from = reverse ? change.after : change.before;
    const to = reverse ? change.before : change.after;
    const actual = rows.get(change.id) ?? null;
    // 可重复恢复，也不会覆盖命令之后对同一记录的修改。
    if (!same(actual, from) && !same(actual, to)) throw new Error("相关角色声明已变化，无法安全恢复身份操作");
    if (to) rows.set(change.id, to); else rows.delete(change.id);
  }
  await saveRoleDeclarationsForIdentity({ ...current, declarations: [...rows.values()] });
}

async function recoverPending(): Promise<void> {
  const pending = await stateStore.get<PendingIdentityCommand>(PENDING_KEY);
  if (!pending) return;
  if (pending.phase === "rollback") {
    const actual = await stateStore.get<IdentityStoreState>(STATE_KEY) ?? EMPTY_STATE;
    if (!same(actual, pending.before) && !same(actual, pending.after)) throw new Error("身份数据已变化，无法安全恢复未完成的操作");
    await applyRoleChanges(pending.roleChanges, true);
    await stateStore.put(STATE_KEY, pending.before);
    if (pending.action === "add") await auditStore.delete(pending.audit.id);
    else await auditStore.put(pending.audit.id, pending.audit);
  }
  await stateStore.delete(PENDING_KEY);
}

/** 角色读取先完成身份命令恢复，避免展示跨存储的中间结果。 */
export function withIdentityRoleAccess<T>(operation: () => Promise<T>): Promise<T> {
  return serialized(async () => { await recoverPending(); return operation(); });
}

export function loadIdentityState(): Promise<IdentityStoreState> {
  return serialized(async () => {
    await recoverPending();
    return await stateStore.get<IdentityStoreState>(STATE_KEY) ?? EMPTY_STATE;
  });
}

async function executeCommand(pending: PendingIdentityCommand): Promise<void> {
  await stateStore.put(PENDING_KEY, pending);
  try {
    await applyRoleChanges(pending.roleChanges, false);
    await stateStore.put(STATE_KEY, pending.after);
    if (pending.action === "add") await auditStore.put(pending.audit.id, pending.audit);
    else await auditStore.delete(pending.audit.id);
    await stateStore.put(PENDING_KEY, { ...pending, phase: "committed" });
  } catch (error) {
    try { await recoverPending(); }
    catch { throw new Error("身份操作未完成，恢复也失败；请重试或重新打开后再操作"); }
    throw error;
  }
  // 命令已经提交；清理失败时留给下一次读取恢复，不伪报操作失败。
  try { await stateStore.delete(PENDING_KEY); } catch { /* 以后清理 */ }
}

async function commitChange(
  current: IdentityStoreState,
  next: IdentityStoreState,
  description: string,
  migrateRolesFor?: string,
): Promise<IdentityStoreState> {
  return serialized(async () => {
    await recoverPending();
    const stored = await stateStore.get<IdentityStoreState>(STATE_KEY) ?? EMPTY_STATE;
    if (!same(current, stored)) throw new Error("身份数据已变化，请刷新后重试");
    let changes: RoleChange[] = [];
    if (migrateRolesFor) {
      const roles = await loadRoleDeclarationsForIdentity();
      changes = roleChanges(roles, migrateRoleDeclarationsForIdentity(roles, next, migrateRolesFor));
    }
    const entry: AuditEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(), description, snapshot: stored, after: next, roleChanges: changes,
    };
    await executeCommand({ phase: "rollback", before: stored, after: next, roleChanges: changes, audit: entry, action: "add" });
    // 审计裁剪不属于命令提交，不让清理失败冒充业务失败。
    try {
      const all = await auditStore.getAll<AuditEntry>();
      const stale = all.sort((a, b) => a.timestamp - b.timestamp || (a.after?.version ?? 0) - (b.after?.version ?? 0)).slice(0, Math.max(0, all.length - MAX_AUDIT));
      for (const entry of stale) await auditStore.delete(entry.id);
    } catch { /* 下次再清理 */ }
    return next;
  });
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
  return commitChange(current, next, `合并 ${next.mappings.at(-1)?.steamIds.length ?? 0} 个账号 → ${displayName}`, `steam:${primarySteamId}`);
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
  if (!mappings.some(m => m.playerKey === playerKey)) {
    if (!playerKey.startsWith("steam:") || !playerKey.slice(6)) throw new Error("无法重命名没有 Steam 身份的选手");
    mappings.push({ playerKey, steamIds: [playerKey.slice(6)], displayName: newDisplayName, updatedAt: Date.now() });
  }
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
export function undoLastAction(): Promise<IdentityStoreState | null> {
  return serialized(async () => {
    await recoverPending();
    const all = await auditStore.getAll<AuditEntry>();
    if (!all.length) return null;
    const latest = all.sort((a, b) => b.timestamp - a.timestamp || (b.after?.version ?? 0) - (a.after?.version ?? 0))[0];
    if (!latest.after || !latest.roleChanges) throw new Error("旧操作缺少完整的角色声明记录，无法安全撤销");
    const current = await stateStore.get<IdentityStoreState>(STATE_KEY) ?? EMPTY_STATE;
    if (!same({ ...current, version: 0 }, { ...latest.after, version: 0 })) throw new Error("身份数据已变化，无法安全撤销");
    const next = { ...latest.snapshot, version: current.version + 1 };
    const changes = latest.roleChanges.map(change => ({ ...change, before: change.after, after: change.before }));
    await executeCommand({ phase: "rollback", before: current, after: next, roleChanges: changes, audit: latest, action: "remove" });
    return next;
  });
}

export async function listAuditEntries(): Promise<AuditEntry[]> {
  try {
    const all = await auditStore.getAll<AuditEntry>();
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

export interface IdentityOptions {
  /** 与 IdentityStoreState.version 一致；0 表示无自定义映射。 */
  version: number;
  map: PlayerIdentityMap;
  /** 队伍原名 → 显示名；不会改变 stable entity ID 或决定 Tournament 归并。 */
  teamRenames?: Record<string, string>;
}
