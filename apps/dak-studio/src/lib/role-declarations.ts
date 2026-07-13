import { roleDeclarationSchema, type RoleDeclaration } from "@cs2dak/contract";
import type { IdentityStoreState } from "./identity";
import { getStorage } from "./storage";

/** 独立于 facts / identity summary 的用户声明存储。 */
export const ROLE_DECLARATIONS_SCHEMA_VERSION = 2;
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

function migrateV1(value: { version?: unknown; declarations?: unknown }): RoleDeclarationsState | null {
  if (value.version !== 1 || !Array.isArray(value.declarations)) return null;
  const primaries = new Set<string>();
  const declarations: StoredRoleDeclaration[] = [];
  for (const raw of [...value.declarations].sort((a, b) => Number((a as StoredRoleDeclaration).createdAt ?? 0) - Number((b as StoredRoleDeclaration).createdAt ?? 0))) {
    const row = raw as Partial<StoredRoleDeclaration> & { declaration?: Partial<RoleDeclaration> };
    if (typeof row.id !== "string" || typeof row.createdAt !== "number" || typeof row.updatedAt !== "number" || !row.declaration) continue;
    const key = scopeKey(row.declaration as RoleDeclaration);
    const priority = primaries.has(key) ? "secondary" : "primary";
    primaries.add(key);
    const parsed = roleDeclarationSchema.safeParse({ ...row.declaration, priority });
    if (parsed.success) declarations.push({ id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, declaration: parsed.data });
  }
  return { version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations };
}

function valid(value: unknown): RoleDeclarationsState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<RoleDeclarationsState>;
  const migrated = migrateV1(state);
  if (migrated) return migrated;
  if (state.version !== ROLE_DECLARATIONS_SCHEMA_VERSION || !Array.isArray(state.declarations)) return null;
  const declarations = state.declarations.filter((row): row is StoredRoleDeclaration => {
    const candidate = row as Partial<StoredRoleDeclaration>;
    return typeof candidate.id === "string" && typeof candidate.createdAt === "number" && typeof candidate.updatedAt === "number"
      && roleDeclarationSchema.safeParse(candidate.declaration).success;
  });
  return { version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations };
}

export async function loadRoleDeclarations(): Promise<RoleDeclarationsState> {
  try {
    const raw = await store.get<unknown>(STATE_KEY);
    const state = valid(raw) ?? EMPTY;
    if ((raw as { version?: unknown } | null)?.version === 1) await store.put(STATE_KEY, state);
    return state;
  } catch { return EMPTY; }
}

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
    declaration.priority === "primary" && item.declaration.priority === "primary" && scopeKey(item.declaration) === scopeKey(declaration)
      ? { ...item, updatedAt: now, declaration: { ...item.declaration, priority: "secondary" as const } }
      : item
  );
  return save({ ...current, declarations: [...declarations, row] });
}

export async function removeRoleDeclaration(current: RoleDeclarationsState, id: string): Promise<RoleDeclarationsState> {
  return save({ ...current, declarations: current.declarations.filter((row) => row.id !== id) });
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
  for (const row of declarations) {
    if (row.declaration.priority !== "primary") continue;
    const key = scopeKey(row.declaration);
    primaryByScope.set(key, [...(primaryByScope.get(key) ?? []), row]);
  }
  for (const rows of primaryByScope.values()) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    for (const row of rows.slice(1)) {
      row.updatedAt = migratedAt;
      row.declaration = { ...row.declaration, priority: "secondary" };
      changed = true;
    }
  }
  return changed ? save({ ...current, declarations }) : current;
}
