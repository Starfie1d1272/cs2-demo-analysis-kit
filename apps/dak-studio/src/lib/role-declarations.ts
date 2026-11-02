import { roleDeclarationSchema, type RoleDeclaration } from "@cs2dak/tactics";
import type { IdentityStoreState } from "./identity";

/** 独立于 facts / identity summary 的用户声明存储。 */
export const ROLE_DECLARATIONS_SCHEMA_VERSION = 3;

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


export function parseRoleDeclarations(value: unknown): RoleDeclarationsState | null {
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
