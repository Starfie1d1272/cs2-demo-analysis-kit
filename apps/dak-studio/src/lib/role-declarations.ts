import { roleDeclarationSchema, type RoleDeclaration } from "@cs2dak/contract";
import type { IdentityStoreState } from "./identity";
import { getStorage } from "./storage";

/** 独立于 facts / identity summary 的用户声明存储。 */
export const ROLE_DECLARATIONS_SCHEMA_VERSION = 1;
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

function valid(value: unknown): RoleDeclarationsState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<RoleDeclarationsState>;
  if (state.version !== ROLE_DECLARATIONS_SCHEMA_VERSION || !Array.isArray(state.declarations)) return null;
  const declarations = state.declarations.filter((row): row is StoredRoleDeclaration => {
    const candidate = row as Partial<StoredRoleDeclaration>;
    return typeof candidate.id === "string" && typeof candidate.createdAt === "number" && typeof candidate.updatedAt === "number"
      && roleDeclarationSchema.safeParse(candidate.declaration).success;
  });
  return { version: ROLE_DECLARATIONS_SCHEMA_VERSION, declarations };
}

export async function loadRoleDeclarations(): Promise<RoleDeclarationsState> {
  try { return valid(await store.get<unknown>(STATE_KEY)) ?? EMPTY; } catch { return EMPTY; }
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
  return save({ ...current, declarations: [...current.declarations.filter((item) => item.id !== nextId), row] });
}

export async function removeRoleDeclaration(current: RoleDeclarationsState, id: string): Promise<RoleDeclarationsState> {
  return save({ ...current, declarations: current.declarations.filter((row) => row.id !== id) });
}

/** 身份合并后按 steamId 交集迁移；没有交集的声明保持原 key，绝不猜测。 */
export async function migrateRoleDeclarationsForIdentity(identity: IdentityStoreState): Promise<RoleDeclarationsState> {
  const current = await loadRoleDeclarations();
  const playerKeyBySteamId = new Map(identity.mappings.flatMap((mapping) => mapping.steamIds.map((id) => [id, mapping.playerKey] as const)));
  let changed = false;
  const declarations = current.declarations.map((row) => {
    const steamId = row.declaration.playerKey.startsWith("steam:") ? row.declaration.playerKey.slice(6) : null;
    const playerKey = steamId ? playerKeyBySteamId.get(steamId) : undefined;
    if (!playerKey || playerKey === row.declaration.playerKey) return row;
    changed = true;
    return { ...row, updatedAt: Date.now(), declaration: { ...row.declaration, playerKey } };
  });
  return changed ? save({ ...current, declarations }) : current;
}
