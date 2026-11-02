import { roleDeclarationSchema, type RoleDeclaration } from "@cs2dak/tactics";
import { withIdentityRoleAccess, type IdentityStoreState } from "./identity";
import { getStorage } from "./storage";

/** 独立于 facts / identity summary 的用户声明存储。 */
export const ROLE_DECLARATIONS_SCHEMA_VERSION = 3;
const STATE_KEY = "current";
const store = getStorage().records("role-declarations");

export interface StoredRoleDeclaration {
  id: string;
  createdAt: number;
  updatedAt: number;
  declaration: RoleDeclaration;
}

export interface RoleDeclarationsState {
  version: typeof ROLE_DECLARATIONS_SCHEMA_VERSION;
  declarations: StoredRoleDeclaration[];
}

const EMPTY: RoleDeclarationsState = { version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations: [] };

function scopeKey(declaration: Pick<RoleDeclaration, "playerKey" | "teamKey" | "mapName" | "validFrom" | "validTo">): string {
  return [declaration.playerKey, declaration.teamKey ?? "", declaration.mapName ?? "", declaration.validFrom ?? "", declaration.validTo ?? ""].join("\t");
}

function valid(value: unknown): RoleDeclarationsState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<RoleDeclarationsState>;
  if (state.version !== ROLE_DECLARATIONS_SCHEMA_VERSION || !Array.isArray(state.declarations)) return null;
  const declarations = state.declarations.filter((row): row is StoredRoleDeclaration => {
    if (!row || typeof row !== "object") return false;
    const candidate = row as Partial<StoredRoleDeclaration>;
    return typeof candidate.id === "string" && typeof candidate.createdAt === "number" && typeof candidate.updatedAt === "number"
      && roleDeclarationSchema.safeParse(candidate.declaration).success;
  });
  return declarations.length === state.declarations.length ? { version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations } : null;
}

export async function loadRoleDeclarations(): Promise<RoleDeclarationsState> {
  return withIdentityRoleAccess(loadRoleDeclarationsForIdentity);
}

/** 身份命令持有恢复锁时使用，避免递归恢复。 */
export async function loadRoleDeclarationsForIdentity(): Promise<RoleDeclarationsState> {
  const raw = await store.get<unknown>(STATE_KEY);
  if (raw === undefined) return EMPTY;
  const state = valid(raw);
  if (!state) throw new Error("角色声明数据无法读取或格式无效，未进行修改");
  return state;
}

export async function saveRoleDeclarationsForIdentity(state: RoleDeclarationsState): Promise<RoleDeclarationsState> {
  await store.put(STATE_KEY, state);
  return state;
}

export async function upsertRoleDeclaration(current: RoleDeclarationsState, input: RoleDeclaration, id?: string): Promise<RoleDeclarationsState> {
  return withIdentityRoleAccess(async () => {
    const actual = await loadRoleDeclarationsForIdentity();
    if (JSON.stringify(current) !== JSON.stringify(actual)) throw new Error("角色声明已变化，请刷新后重试");
    const declaration = roleDeclarationSchema.parse(input);
    const now = Date.now();
    const nextId = id ?? `${now}-${Math.random().toString(36).slice(2, 8)}`;
    const existing = current.declarations.find((row) => row.id === nextId);
    const row: StoredRoleDeclaration = { id: nextId, createdAt: existing?.createdAt ?? now, updatedAt: now, declaration };
    const declarations = current.declarations.filter((item) => item.id !== nextId).map((item) =>
      declaration.kind === "main_role" && declaration.priority === "primary" && item.declaration.kind === "main_role" && item.declaration.priority === "primary" && scopeKey(item.declaration) === scopeKey(declaration)
        ? { ...item, updatedAt: now, declaration: { ...item.declaration, priority: "secondary" as const } }
        : item
    ).filter((item) => declaration.kind !== "weapon_duty" || item.declaration.kind !== "weapon_duty" || scopeKey(item.declaration) !== scopeKey(declaration));
    return saveRoleDeclarationsForIdentity({ ...current, version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations: [...declarations, row] });
  });
}

export async function removeRoleDeclaration(current: RoleDeclarationsState, id: string): Promise<RoleDeclarationsState> {
  return withIdentityRoleAccess(async () => {
    const actual = await loadRoleDeclarationsForIdentity();
    if (JSON.stringify(current) !== JSON.stringify(actual)) throw new Error("角色声明已变化，请刷新后重试");
    return saveRoleDeclarationsForIdentity({ ...current, declarations: current.declarations.filter((row) => row.id !== id) });
  });
}

/** 一次替换当前选手/队伍的普通用户声明；其余作用域和来源保持原样。 */
export async function replaceOrdinaryUserRoleDeclarations(
  playerKey: string,
  teamKey: string | null,
  inputs: RoleDeclaration[],
): Promise<RoleDeclarationsState> {
  return withIdentityRoleAccess(async () => {
    const declarations = inputs.map(input => roleDeclarationSchema.parse(input));
    if (declarations.some(item => item.source !== "user" || item.playerKey !== playerKey || (item.teamKey ?? null) !== teamKey || item.mapName != null || item.validFrom != null || item.validTo != null)) {
      throw new Error("角色声明范围不一致");
    }
    const current = await loadRoleDeclarationsForIdentity();
    const now = Date.now();
    const retained = current.declarations.filter(row => !(row.declaration.source === "user" && row.declaration.playerKey === playerKey
      && (row.declaration.teamKey ?? null) === teamKey && row.declaration.mapName == null
      && row.declaration.validFrom == null && row.declaration.validTo == null));
    const added = declarations.map(declaration => ({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, declaration }));
    return saveRoleDeclarationsForIdentity({ ...current, version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations: [...retained, ...added] });
  });
}

/** 身份合并后按 steamId 交集迁移；没有交集的声明保持原 key，绝不猜测。 */
export function migrateRoleDeclarationsForIdentity(current: RoleDeclarationsState, identity: IdentityStoreState, targetPlayerKey: string): RoleDeclarationsState {
  const playerKeyBySteamId = new Map(identity.mappings.filter(mapping => mapping.playerKey === targetPlayerKey).flatMap((mapping) => mapping.steamIds.map((id) => [id, mapping.playerKey] as const)));
  let changed = false;
  const migratedAt = Date.now();
  const declarations = current.declarations.map((row) => {
    const steamId = row.declaration.playerKey.startsWith("steam:") ? row.declaration.playerKey.slice(6) : null;
    const playerKey = steamId ? playerKeyBySteamId.get(steamId) : undefined;
    if (!playerKey || playerKey === row.declaration.playerKey) return { ...row, declaration: { ...row.declaration } };
    changed = true;
    return { ...row, updatedAt: migratedAt, declaration: { ...row.declaration, playerKey } };
  });
  // 合并只改变身份归属，职责内容及冲突声明全部保留。
  return changed ? { ...current, version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations } : current;
}
