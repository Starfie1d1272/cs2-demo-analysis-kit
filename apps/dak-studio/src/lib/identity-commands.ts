import { getStorage } from "./storage";
import { getPywebviewStorageApi } from "./storage/pywebview-adapter";
import { applyMerge, applySplit, applyRename, applyTeamRename, type IdentityStoreState } from "./identity";
import { ROLE_DECLARATIONS_SCHEMA_VERSION, parseRoleDeclarations, migrateRoleDeclarationsForIdentity, type RoleDeclarationsState, type StoredRoleDeclaration } from "./role-declarations";
import { roleDeclarationSchema, type RoleDeclaration } from "@cs2dak/tactics";

const roleStore = getStorage().records("role-declarations");
async function readRoles(): Promise<RoleDeclarationsState> {
  const raw = await roleStore.get<unknown>("current");
  if (raw === undefined) return { version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations: [] };
  const state = parseRoleDeclarations(raw);
  if (!state) throw new Error("角色声明数据无法读取或格式无效，未进行修改");
  return state;
}
async function writeRoles(state: RoleDeclarationsState): Promise<RoleDeclarationsState> {
  await roleStore.put("current", state);
  return state;
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

async function withStorageLock<T>(run: () => Promise<T>): Promise<T> {
  const native = getPywebviewStorageApi();
  if (native) {
    if (!native.storage_identity_lock_acquire || !native.storage_identity_lock_release) throw new Error("桌面存储不支持身份资料锁，请更新应用后重试");
    const token = await native.storage_identity_lock_acquire();
    try { return await run(); } finally { await native.storage_identity_lock_release(token); }
  }
  if (!navigator.locks) throw new Error("浏览器不支持身份资料锁，无法安全修改资料");
  return navigator.locks.request("dak-identity-roles", { mode: "exclusive" }, run);
}

function serialized<T>(run: () => Promise<T>): Promise<T> {
  const guarded = () => withStorageLock(run);
  const result = commandQueue.then(guarded, guarded);
  commandQueue = result.catch(() => {});
  return result;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const newestAuditFirst = (a: AuditEntry, b: AuditEntry) => (b.after?.version ?? -1) - (a.after?.version ?? -1) || b.timestamp - a.timestamp;

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
  const current = await readRoles();
  const rows = new Map(current.declarations.map(row => [row.id, row]));
  for (const change of changes) {
    const from = reverse ? change.after : change.before;
    const to = reverse ? change.before : change.after;
    const actual = rows.get(change.id) ?? null;
    // 可重复恢复，也不会覆盖命令之后对同一记录的修改。
    if (!same(actual, from) && !same(actual, to)) throw new Error("相关角色声明已变化，无法安全恢复身份操作");
    if (to) rows.set(change.id, to); else rows.delete(change.id);
  }
  await writeRoles({ ...current, declarations: [...rows.values()] });
}

async function recoverPending(): Promise<void> {
  const pending = await stateStore.get<PendingIdentityCommand>(PENDING_KEY);
  if (!pending) return;
  if (pending.phase === "rollback") {
    const actual = await stateStore.get<IdentityStoreState>(STATE_KEY) ?? EMPTY_STATE;
    const restored = { ...pending.before, version: pending.after.version + 1 };
    if (!same(actual, pending.before) && !same(actual, pending.after) && !same(actual, restored)) throw new Error("身份数据已变化，无法安全恢复未完成的操作");
    await applyRoleChanges(pending.roleChanges, true);
    await stateStore.put(STATE_KEY, restored);
    if (pending.action === "add") await auditStore.delete(pending.audit.id);
    else await auditStore.put(pending.audit.id, pending.audit);
  }
  await stateStore.delete(PENDING_KEY);
}

/** 角色读取先完成身份命令恢复，避免展示跨存储的中间结果。 */
function withIdentityRoleAccess<T>(operation: () => Promise<T>): Promise<T> {
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
      const roles = await readRoles();
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
      const stale = all.sort(newestAuditFirst).slice(MAX_AUDIT);
      for (const entry of stale) await auditStore.delete(entry.id);
    } catch { /* 下次再清理 */ }
    return next;
  });
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

/** 将已归并身份拆分：把指定 steamIds 从 playerKey 的 mapping 中移除，各自还原为默认身份。 */
export async function splitIdentity(
  current: IdentityStoreState,
  playerKey: string,
  steamIdsToSplit: string[]
): Promise<IdentityStoreState> {
  const next = applySplit(current, playerKey, steamIdsToSplit);
  return commitChange(current, next, `拆分 ${steamIdsToSplit.length} 个账号从 ${playerKey}`);
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
    const latest = all.sort(newestAuditFirst)[0];
    if (!latest.after || !latest.roleChanges) throw new Error("旧操作缺少完整的角色声明记录，无法安全撤销");
    const current = await stateStore.get<IdentityStoreState>(STATE_KEY) ?? EMPTY_STATE;
    if (!same({ ...current, version: 0 }, { ...latest.after, version: 0 })) throw new Error("身份数据已变化，无法安全撤销");
    const next = { ...latest.snapshot, version: current.version + 1 };
    const changes = latest.roleChanges.map(change => ({ ...change, before: change.after, after: change.before }));
    await executeCommand({ phase: "rollback", before: current, after: next, roleChanges: changes, audit: latest, action: "remove" });
    return next;
  });
}

export function listAuditEntries(): Promise<AuditEntry[]> {
  return withIdentityRoleAccess(async () => (await auditStore.getAll<AuditEntry>()).sort(newestAuditFirst));
}

export function loadRoleDeclarations(): Promise<RoleDeclarationsState> {
  return withIdentityRoleAccess(readRoles);
}
export function removeRoleDeclaration(current: RoleDeclarationsState, id: string): Promise<RoleDeclarationsState> {
  return withIdentityRoleAccess(async () => {
    const actual = await readRoles();
    const expectedRow = current.declarations.find(row => row.id === id);
    const actualRow = actual.declarations.find(row => row.id === id);
    if (!expectedRow || !same(expectedRow, actualRow)) throw new Error("角色声明已变化，请刷新后重试");
    return writeRoles({ ...actual, declarations: actual.declarations.filter(row => row.id !== id) });
  });
}
async function assertCurrentPlayerKey(playerKey: string): Promise<void> {
  const identity = await stateStore.get<IdentityStoreState>(STATE_KEY) ?? EMPTY_STATE;
  if (playerKey.startsWith("steam:")) {
    const steamId = playerKey.slice(6);
    const mapping = identity.mappings.find(item => item.steamIds.includes(steamId));
    if (mapping && mapping.playerKey !== playerKey) throw new Error("选手身份已归并，请刷新后重试");
  }
}

export function replaceOrdinaryUserRoleDeclarations(playerKey: string, teamKey: string | null, inputs: RoleDeclaration[], expected: RoleDeclarationsState): Promise<RoleDeclarationsState> {
  return withIdentityRoleAccess(async () => {
    await assertCurrentPlayerKey(playerKey);
    const declarations = inputs.map(input => roleDeclarationSchema.parse(input));
    if (declarations.some(item => item.source !== "user" || item.playerKey !== playerKey || (item.teamKey ?? null) !== teamKey || item.mapName != null || item.validFrom != null || item.validTo != null)) throw new Error("角色声明范围不一致");
    const current = await readRoles();
    const now = Date.now();
    const inScope = (row: StoredRoleDeclaration) => row.declaration.source === "user" && row.declaration.playerKey === playerKey && (row.declaration.teamKey ?? null) === teamKey && row.declaration.mapName == null && row.declaration.validFrom == null && row.declaration.validTo == null;
    if (!same(current.declarations.filter(inScope), expected.declarations.filter(inScope))) throw new Error("当前选手的角色声明已变化，请刷新后重试");
    const retained = current.declarations.filter(row => !inScope(row));
    const added = declarations.map(declaration => ({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, declaration }));
    return writeRoles({ ...current, declarations: [...retained, ...added] });
  });
}

export function upsertRoleDeclaration(current: RoleDeclarationsState, input: RoleDeclaration, id?: string): Promise<RoleDeclarationsState> {
  return withIdentityRoleAccess(async () => {
    const actual = await readRoles();
    if (!same(current, actual)) throw new Error("角色声明已变化，请刷新后重试");
    const declaration = roleDeclarationSchema.parse(input);
    await assertCurrentPlayerKey(declaration.playerKey);
    const now = Date.now();
    const nextId = id ?? `${now}-${Math.random().toString(36).slice(2, 8)}`;
    const existing = actual.declarations.find(row => row.id === nextId);
    const scope = (d: RoleDeclaration) => [d.playerKey, d.teamKey ?? "", d.mapName ?? "", d.validFrom ?? "", d.validTo ?? ""].join("\t");
    const rows = actual.declarations.filter(row => row.id !== nextId).map(row =>
      declaration.kind === "main_role" && declaration.priority === "primary" && row.declaration.kind === "main_role" && row.declaration.priority === "primary" && scope(row.declaration) === scope(declaration)
        ? { ...row, updatedAt: now, declaration: { ...row.declaration, priority: "secondary" as const } } : row
    ).filter(row => declaration.kind !== "weapon_duty" || row.declaration.kind !== "weapon_duty" || scope(row.declaration) !== scope(declaration));
    return writeRoles({ ...actual, declarations: [...rows, { id: nextId, createdAt: existing?.createdAt ?? now, updatedAt: now, declaration }] });
  });
}
