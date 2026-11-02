import { roleDeclarationSchema, type RoleDeclaration } from "@cs2dak/tactics";
import type { IdentityStoreState } from "./identity";
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

function migrateLegacy(value: { version?: unknown; declarations?: unknown }): RoleDeclarationsState | null {
  if ((value.version !== 1 && value.version !== 2) || !Array.isArray(value.declarations)) return null;
  const primaries = new Set<string>();
  const declarations: StoredRoleDeclaration[] = [];
  for (const raw of [...value.declarations].sort((a, b) => Number((a as StoredRoleDeclaration).createdAt ?? 0) - Number((b as StoredRoleDeclaration).createdAt ?? 0))) {
    const row = raw as Partial<StoredRoleDeclaration> & { declaration?: Partial<RoleDeclaration> & { role?: unknown; priority?: unknown } };
    if (typeof row.id !== "string" || typeof row.createdAt !== "number" || typeof row.updatedAt !== "number" || !row.declaration) return null;
    const key = scopeKey(row.declaration as RoleDeclaration);
    const priority = value.version === 1 ? (primaries.has(key) ? "secondary" : "primary") : row.declaration.priority;
    if (priority === "primary") primaries.add(key);
    const parsed = roleDeclarationSchema.safeParse({ ...row.declaration, kind: "main_role", priority });
    if (!parsed.success) return null;
    declarations.push({ id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, declaration: parsed.data });
  }
  return { version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations };
}

function valid(value: unknown): RoleDeclarationsState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<RoleDeclarationsState>;
  const migrated = migrateLegacy(state);
  if (migrated) return migrated;
  if (state.version !== ROLE_DECLARATIONS_SCHEMA_VERSION || !Array.isArray(state.declarations)) return null;
  const declarations = state.declarations.filter((row): row is StoredRoleDeclaration => {
    const candidate = row as Partial<StoredRoleDeclaration>;
    return typeof candidate.id === "string" && typeof candidate.createdAt === "number" && typeof candidate.updatedAt === "number"
      && roleDeclarationSchema.safeParse(candidate.declaration).success;
  });
  return declarations.length === state.declarations.length ? { version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations } : null;
}

async function readRoleDeclarations(persistMigration: boolean): Promise<RoleDeclarationsState> {
  const raw = await store.get<unknown>(STATE_KEY);
  if (raw === undefined) return EMPTY;
  const state = valid(raw);
  if (!state) throw new Error("角色声明数据无法读取或格式无效，未进行修改");
  if (persistMigration && [1, 2].includes(Number((raw as { version?: unknown }).version))) await store.put(STATE_KEY, state);
  return state;
}

export function loadRoleDeclarations(): Promise<RoleDeclarationsState> { return readRoleDeclarations(true); }

async function save(state: RoleDeclarationsState): Promise<RoleDeclarationsState> {
  await store.put(STATE_KEY, state);
  return state;
}

export async function upsertRoleDeclaration(current: RoleDeclarationsState, input: RoleDeclaration, id?: string): Promise<RoleDeclarationsState> {
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
  return save({ ...current, version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations: [...declarations, row] });
}

export async function removeRoleDeclaration(current: RoleDeclarationsState, id: string): Promise<RoleDeclarationsState> {
  return save({ ...current, declarations: current.declarations.filter((row) => row.id !== id) });
}

/** 一次替换当前选手/队伍的普通用户声明；其余作用域和来源保持原样。 */
export async function replaceOrdinaryUserRoleDeclarations(
  playerKey: string,
  teamKey: string | null,
  inputs: RoleDeclaration[],
): Promise<RoleDeclarationsState> {
  const declarations = inputs.map(input => roleDeclarationSchema.parse(input));
  if (declarations.some(item => item.source !== "user" || item.playerKey !== playerKey || (item.teamKey ?? null) !== teamKey || item.mapName != null || item.validFrom != null || item.validTo != null)) {
    throw new Error("角色声明范围不一致");
  }
  const current = await readRoleDeclarations(false);
  const now = Date.now();
  const retained = current.declarations.filter(row => !(row.declaration.source === "user" && row.declaration.playerKey === playerKey
    && (row.declaration.teamKey ?? null) === teamKey && row.declaration.mapName == null
    && row.declaration.validFrom == null && row.declaration.validTo == null));
  const added = declarations.map(declaration => ({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, declaration }));
  return save({ ...current, version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations: [...retained, ...added] });
}

/** 身份合并后按 steamId 交集迁移；没有交集的声明保持原 key，绝不猜测。 */
export async function migrateRoleDeclarationsForIdentity(identity: IdentityStoreState): Promise<RoleDeclarationsState> {
  const current = await loadRoleDeclarations();
  const playerKeyBySteamId = new Map(identity.mappings.flatMap((mapping) => mapping.steamIds.map((id) => [id, mapping.playerKey] as const)));
  let changed = false;
  const migratedAt = Date.now();
  const declarations = current.declarations.map((row) => {
    const steamId = row.declaration.playerKey.startsWith("steam:") ? row.declaration.playerKey.slice(6) : null;
    const playerKey = steamId ? playerKeyBySteamId.get(steamId) : undefined;
    if (!playerKey || playerKey === row.declaration.playerKey) return row;
    changed = true;
    return { ...row, updatedAt: migratedAt, declaration: { ...row.declaration, playerKey } };
  });
  const primaryByScope = new Map<string, StoredRoleDeclaration[]>();
  const weaponDutyByScope = new Map<string, StoredRoleDeclaration[]>();
  for (const row of declarations) {
    const key = scopeKey(row.declaration);
    if (row.declaration.kind === "main_role" && row.declaration.priority === "primary") primaryByScope.set(key, [...(primaryByScope.get(key) ?? []), row]);
    if (row.declaration.kind === "weapon_duty") weaponDutyByScope.set(key, [...(weaponDutyByScope.get(key) ?? []), row]);
  }
  for (const rows of primaryByScope.values()) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    for (const row of rows.slice(1)) {
      if (row.declaration.kind !== "main_role") continue;
      row.updatedAt = migratedAt;
      row.declaration = { ...row.declaration, priority: "secondary" };
      changed = true;
    }
  }
  const discarded = new Set<string>();
  for (const rows of weaponDutyByScope.values()) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    for (const row of rows.slice(1)) { discarded.add(row.id); changed = true; }
  }
  const next = discarded.size ? declarations.filter((row) => !discarded.has(row.id)) : declarations;
  return changed ? save({ ...current, version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations: next }) : current;
}
