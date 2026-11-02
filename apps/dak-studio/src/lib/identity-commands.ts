import { getNativeStorageApiForCurrentAdapter, getStorage } from "./storage";
import type { RecordRef, RecordSnapshot, RecordMutation } from "./storage/types";
import { applyMerge, applySplit, applyRename, applyTeamRename, type IdentityStoreState } from "./identity";
import { ROLE_DECLARATIONS_SCHEMA_VERSION, parseRoleDeclarations, migrateRoleDeclarationsForIdentity, type RoleDeclarationsState, type StoredRoleDeclaration } from "./role-declarations";
import { roleDeclarationSchema, type RoleDeclaration } from "@cs2dak/tactics";

interface RoleChange { id: string; before: StoredRoleDeclaration | null; after: StoredRoleDeclaration | null }
interface AuditEntry { id: string; timestamp: number; description: string; snapshot: IdentityStoreState; after?: IdentityStoreState; roleChanges?: RoleChange[] }
const identityRef = { namespace: "identity", key: "current" };
const rolesRef = { namespace: "role-declarations", key: "current" };
const historyRef = { namespace: "identity-audit", key: "__atomic_history_v1" };
const markerRef = { namespace: "identity-workspace", key: "initialized-v1" };
const EMPTY_STATE: IdentityStoreState = { version: 0, mappings: [], teamRenames: {} };
const EMPTY_ROLES: RoleDeclarationsState = { version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations: [] };
const storage = getStorage();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const newestAuditFirst = (a: AuditEntry, b: AuditEntry) => (b.after?.version ?? -1) - (a.after?.version ?? -1) || b.timestamp - a.timestamp;

function validIdentity(value: unknown): value is IdentityStoreState {
  if (!value || typeof value !== "object") return false;
  const s = value as IdentityStoreState;
  return Number.isSafeInteger(s.version) && s.version >= 0 && Array.isArray(s.mappings)
    && s.mappings.every(m => m && typeof m.playerKey === "string" && typeof m.displayName === "string" && Array.isArray(m.steamIds) && m.steamIds.every(id => typeof id === "string") && typeof m.updatedAt === "number" && Number.isFinite(m.updatedAt))
    && !!s.teamRenames && typeof s.teamRenames === "object" && !Array.isArray(s.teamRenames)
    && (Object.getPrototypeOf(s.teamRenames) === Object.prototype || Object.getPrototypeOf(s.teamRenames) === null)
    && Object.values(s.teamRenames).every(v => typeof v === "string");
}
function validRoleChange(value: unknown): value is RoleChange {
  if (!value || typeof value !== "object") return false;
  const change = value as RoleChange;
  const validRow = (row: StoredRoleDeclaration | null) => row === null || (!!row && row.id === change.id && !!parseRoleDeclarations({ version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations: [row] }));
  return typeof change.id === "string" && validRow(change.before) && validRow(change.after) && (change.before !== null || change.after !== null);
}
function validAudit(value: unknown): value is AuditEntry {
  if (!value || typeof value !== "object") return false;
  const a = value as AuditEntry;
  return typeof a.id === "string" && typeof a.timestamp === "number" && Number.isFinite(a.timestamp) && typeof a.description === "string" && validIdentity(a.snapshot)
    && (a.after === undefined || validIdentity(a.after)) && (a.roleChanges === undefined || (Array.isArray(a.roleChanges) && a.roleChanges.every(validRoleChange) && new Set(a.roleChanges.map(change => change.id)).size === a.roleChanges.length));
}

async function readLegacyRecord(ref: RecordRef): Promise<RecordSnapshot> {
  const entries = await storage.records(ref.namespace).entries<unknown>();
  const entry = entries.find(([key]) => key === ref.key);
  return entry ? { ...ref, exists: true, value: entry[1] } : { ...ref, exists: false };
}

/** 浏览器只读复制旧三库并原子接管；SQLite 保留原身份/声明位置，仅建立审计索引。 */
async function ensureInitialized(): Promise<void> {
  const [marker] = await storage.readRecords([markerRef]);
  if (marker.exists) {
    if (marker.value !== 1) throw new Error("身份资料接管标记无效，未进行修改");
    return;
  }
  const native = !!getNativeStorageApiForCurrentAdapter();
  const [legacyValues, oldHistory] = await Promise.all([
    native ? storage.readRecords([identityRef, rolesRef]) : Promise.all([readLegacyRecord(identityRef), readLegacyRecord(rolesRef)]),
    storage.records("identity-audit").entries<unknown>(),
  ]);
  const oldIdentity = legacyValues[0].exists ? legacyValues[0].value : undefined;
  const oldRoles = legacyValues[1].exists ? legacyValues[1].value : undefined;
  const snapshots = await storage.readRecords([markerRef, identityRef, rolesRef, historyRef]);
  if (snapshots[0].exists) {
    if (snapshots[0].value !== 1) throw new Error("身份资料接管标记无效，未进行修改");
    return;
  }
  if (legacyValues[0].exists && !validIdentity(oldIdentity)) throw new Error("身份数据格式无效，未进行修改");
  if (legacyValues[1].exists && !parseRoleDeclarations(oldRoles)) throw new Error("角色声明数据格式无效，未进行修改");
  if (oldHistory.some(([key, value]) => !validAudit(value) || value.id !== key)) throw new Error("身份审计数据格式无效，未进行修改");
  if (snapshots[3].exists || (!native && (snapshots[1].exists || snapshots[2].exists))) throw new Error("身份资料接管未完成，请检查存储后重试");
  if (native && (!same(snapshots[1].exists ? snapshots[1].value : undefined, oldIdentity) || !same(snapshots[2].exists ? snapshots[2].value : undefined, oldRoles))) throw new Error("身份资料已变化，请重试");
  const writes: RecordMutation[] = [
    { ...markerRef, kind: "put", value: 1 },
    { ...historyRef, kind: "put", value: oldHistory.map(([, row]) => row) },
  ];
  if (!native || !legacyValues[0].exists) writes.push({ ...identityRef, kind: "put", value: legacyValues[0].exists ? oldIdentity : EMPTY_STATE });
  if (!native || !legacyValues[1].exists) writes.push({ ...rolesRef, kind: "put", value: legacyValues[1].exists ? oldRoles : EMPTY_ROLES });
  if (!await storage.compareAndWriteRecords(snapshots, writes)) {
    const [winner] = await storage.readRecords([markerRef]);
    if (!winner.exists || winner.value !== 1) throw new Error("身份资料已变化，请重试");
  }
}

type Bundle = { snapshots: RecordSnapshot[]; identity: IdentityStoreState; roles: RoleDeclarationsState; history: AuditEntry[] };
async function readBundle(): Promise<Bundle> {
  await ensureInitialized();
  const snapshots = await storage.readRecords([identityRef, rolesRef, historyRef]);
  const [identity, roles, history] = snapshots;
  if (!identity.exists || !validIdentity(identity.value)) throw new Error("身份数据缺失或格式无效，未进行修改");
  const parsedRoles = roles.exists ? parseRoleDeclarations(roles.value) : null;
  if (!parsedRoles) throw new Error("角色声明数据格式无效，未进行修改");
  const parsedHistory = parseHistory(history);
  return { snapshots, identity: identity.value as IdentityStoreState, roles: parsedRoles, history: parsedHistory };
}
function parseHistory(snapshot: RecordSnapshot): AuditEntry[] {
  if (!snapshot.exists || !Array.isArray(snapshot.value) || !snapshot.value.every(validAudit) || new Set(snapshot.value.map(entry => entry.id)).size !== snapshot.value.length) throw new Error("身份审计数据格式无效，未进行修改");
  return snapshot.value;
}
async function commit(bundle: Bundle, writes: RecordMutation[]): Promise<void> {
  if (!await storage.compareAndWriteRecords(bundle.snapshots, writes)) throw new Error("身份或角色资料已变化，请刷新后重试");
}
function roleChanges(before: RoleDeclarationsState, after: RoleDeclarationsState): RoleChange[] {
  const old = new Map(before.declarations.map(row => [row.id, row]));
  const next = new Map(after.declarations.map(row => [row.id, row]));
  return [...new Set([...old.keys(), ...next.keys()])].flatMap(id => {
    const a = old.get(id) ?? null, b = next.get(id) ?? null;
    return same(a, b) ? [] : [{ id, before: a, after: b }];
  });
}
function restoreRoles(current: RoleDeclarationsState, changes: RoleChange[]): RoleDeclarationsState {
  const rows = new Map(current.declarations.map(row => [row.id, row]));
  for (const change of changes) {
    const actual = rows.get(change.id) ?? null;
    if (!same(actual, change.after)) throw new Error("相关角色声明已变化，无法安全撤销身份操作");
    if (change.before) rows.set(change.id, change.before); else rows.delete(change.id);
  }
  return { ...current, declarations: [...rows.values()] };
}
async function trimHistory(): Promise<void> {
  try {
    const [snapshot] = await storage.readRecords([historyRef]);
    if (snapshot.exists && Array.isArray(snapshot.value) && snapshot.value.length > 20 && snapshot.value.every(validAudit)) {
      await storage.compareAndWriteRecords([snapshot], [{ ...historyRef, kind: "put", value: [...snapshot.value].sort(newestAuditFirst).slice(0, 20) }]);
    }
  } catch { /* 审计裁剪失败不改变已提交命令 */ }
}
async function commitChange(current: IdentityStoreState, next: IdentityStoreState, description: string, migrateRolesFor?: string): Promise<IdentityStoreState> {
  const bundle = await readBundle();
  if (!same(current, bundle.identity)) throw new Error("身份数据已变化，请刷新后重试");
  if (!validIdentity(next)) throw new Error("身份版本或数据无效，未进行修改");
  const roles = migrateRolesFor ? migrateRoleDeclarationsForIdentity(bundle.roles, next, migrateRolesFor) : bundle.roles;
  const entry: AuditEntry = { id: crypto.randomUUID(), timestamp: Date.now(), description, snapshot: bundle.identity, after: next, roleChanges: roleChanges(bundle.roles, roles) };
  const writes: RecordMutation[] = [{ ...identityRef, kind: "put", value: next }, { ...historyRef, kind: "put", value: [...bundle.history, entry] }];
  if (!same(roles, bundle.roles)) writes.push({ ...rolesRef, kind: "put", value: roles });
  await commit(bundle, writes);
  await trimHistory();
  return next;
}
export async function loadIdentityState(): Promise<IdentityStoreState> {
  await ensureInitialized();
  const [identity] = await storage.readRecords([identityRef]);
  if (!identity.exists || !validIdentity(identity.value)) throw new Error("身份数据缺失或格式无效，未进行修改");
  return identity.value;
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

/** 撤销恢复业务内容，同时生成新的缓存版本。 */
export async function undoLastAction(): Promise<IdentityStoreState | null> {
  const bundle = await readBundle();
  if (!bundle.history.length) return null;
  const latest = [...bundle.history].sort(newestAuditFirst)[0];
  if (!latest.after || !latest.roleChanges) throw new Error("旧操作缺少完整的角色声明记录，无法安全撤销");
  if (!same({ ...bundle.identity, version: 0 }, { ...latest.after, version: 0 })) throw new Error("身份数据已变化，无法安全撤销");
  const next = { ...latest.snapshot, version: bundle.identity.version + 1 };
  if (!validIdentity(next)) throw new Error("身份版本或数据无效，未进行修改");
  const roles = restoreRoles(bundle.roles, latest.roleChanges);
  const writes: RecordMutation[] = [
    { ...identityRef, kind: "put", value: next },
    { ...historyRef, kind: "put", value: bundle.history.filter(entry => entry.id !== latest.id) },
  ];
  if (!same(roles, bundle.roles)) writes.push({ ...rolesRef, kind: "put", value: roles });
  await commit(bundle, writes);
  return next;
}
export async function listAuditEntries(): Promise<AuditEntry[]> {
  await ensureInitialized();
  const [history] = await storage.readRecords([historyRef]);
  return [...parseHistory(history)].sort(newestAuditFirst);
}
export async function loadRoleDeclarations(): Promise<RoleDeclarationsState> {
  await ensureInitialized();
  const [roles] = await storage.readRecords([rolesRef]);
  const parsed = roles.exists ? parseRoleDeclarations(roles.value) : null;
  if (!parsed) throw new Error("角色声明数据缺失或格式无效，未进行修改");
  return parsed;
}
export async function removeRoleDeclaration(current: RoleDeclarationsState, id: string): Promise<RoleDeclarationsState> {
  const bundle = await readBundle();
  const expected = current.declarations.find(row => row.id === id);
  const actual = bundle.roles.declarations.find(row => row.id === id);
  if (!expected || !same(expected, actual)) throw new Error("角色声明已变化，请刷新后重试");
  const next = { ...bundle.roles, declarations: bundle.roles.declarations.filter(row => row.id !== id) };
  await commit(bundle, [{ ...rolesRef, kind: "put", value: next }]);
  return next;
}
function assertCurrentPlayerKey(identity: IdentityStoreState, playerKey: string): void {
  if (playerKey.startsWith("steam:")) {
    const mapping = identity.mappings.find(item => item.steamIds.includes(playerKey.slice(6)));
    if (mapping && mapping.playerKey !== playerKey) throw new Error("选手身份已归并，请刷新后重试");
  }
}
export async function replaceOrdinaryUserRoleDeclarations(playerKey: string, teamKey: string | null, inputs: RoleDeclaration[], expected: RoleDeclarationsState): Promise<RoleDeclarationsState> {
  const bundle = await readBundle();
  assertCurrentPlayerKey(bundle.identity, playerKey);
  const declarations = inputs.map(input => roleDeclarationSchema.parse(input));
  if (declarations.some(item => item.source !== "user" || item.playerKey !== playerKey || (item.teamKey ?? null) !== teamKey || item.mapName != null || item.validFrom != null || item.validTo != null)) throw new Error("角色声明范围不一致");
  const inScope = (row: StoredRoleDeclaration) => row.declaration.source === "user" && row.declaration.playerKey === playerKey && (row.declaration.teamKey ?? null) === teamKey && row.declaration.mapName == null && row.declaration.validFrom == null && row.declaration.validTo == null;
  if (!same(bundle.roles.declarations.filter(inScope), expected.declarations.filter(inScope))) throw new Error("当前选手的角色声明已变化，请刷新后重试");
  const now = Date.now();
  const added = declarations.map(declaration => ({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, declaration }));
  const next = { ...bundle.roles, declarations: [...bundle.roles.declarations.filter(row => !inScope(row)), ...added] };
  await commit(bundle, [{ ...rolesRef, kind: "put", value: next }]);
  return next;
}
export async function upsertRoleDeclaration(current: RoleDeclarationsState, input: RoleDeclaration, id?: string): Promise<RoleDeclarationsState> {
  const bundle = await readBundle();
  if (!same(current, bundle.roles)) throw new Error("角色声明已变化，请刷新后重试");
  const declaration = roleDeclarationSchema.parse(input);
  assertCurrentPlayerKey(bundle.identity, declaration.playerKey);
  const now = Date.now(), nextId = id ?? crypto.randomUUID();
  const existing = bundle.roles.declarations.find(row => row.id === nextId);
  const scope = (d: RoleDeclaration) => [d.playerKey, d.teamKey ?? "", d.mapName ?? "", d.validFrom ?? "", d.validTo ?? ""].join("\t");
  const rows = bundle.roles.declarations.filter(row => row.id !== nextId).map(row =>
    declaration.kind === "main_role" && declaration.priority === "primary" && row.declaration.kind === "main_role" && row.declaration.priority === "primary" && scope(row.declaration) === scope(declaration)
      ? { ...row, updatedAt: now, declaration: { ...row.declaration, priority: "secondary" as const } } : row
  ).filter(row => declaration.kind !== "weapon_duty" || row.declaration.kind !== "weapon_duty" || scope(row.declaration) !== scope(declaration));
  const next = { ...bundle.roles, declarations: [...rows, { id: nextId, createdAt: existing?.createdAt ?? now, updatedAt: now, declaration }] };
  await commit(bundle, [{ ...rolesRef, kind: "put", value: next }]);
  return next;
}
