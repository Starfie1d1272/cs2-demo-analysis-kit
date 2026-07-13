import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { ROLE_DECLARATIONS_SCHEMA_VERSION, loadRoleDeclarations, migrateRoleDeclarationsForIdentity, removeRoleDeclaration, upsertRoleDeclaration, type RoleDeclarationsState } from "./role-declarations";
import { getStorage } from "./storage";

describe("role declaration state", () => {
  it("persists CRUD independently from facts namespaces", async () => {
    expect(ROLE_DECLARATIONS_SCHEMA_VERSION).toBe(1);
    let state: RoleDeclarationsState = { version: 1, declarations: [] };
    state = await upsertRoleDeclaration(state, { playerKey: "steam:a", role: "igl", source: "user", provenance: "用户声明" }, "crud");
    await getStorage().records("facts:player_position_rounds").put("m1", { disposable: true });
    await getStorage().records("facts:player_position_rounds").deleteByPrefix("m1");
    expect((await loadRoleDeclarations()).declarations).toHaveLength(1);
    state = await removeRoleDeclaration(state, "crud");
    expect(state.declarations).toEqual([]);
  });
  it("keeps declaration fields separate from Studio record metadata", () => {
    const state: RoleDeclarationsState = { version: 1, declarations: [{ id: "d1", createdAt: 1, updatedAt: 1, declaration: { playerKey: "steam:a", role: "igl", source: "user", provenance: "用户声明" } }] };
    expect(state.declarations[0]?.declaration).not.toHaveProperty("id");
  });

  it("migrates declarations by steamId intersection after an identity merge", async () => {
    const state: RoleDeclarationsState = { version: 1, declarations: [] };
    await upsertRoleDeclaration(state, { playerKey: "steam:b", role: "awper", source: "user", provenance: "用户声明" }, "merge");
    const migrated = await migrateRoleDeclarationsForIdentity({ version: 1, teamRenames: {}, mappings: [{ playerKey: "steam:a", displayName: "A", steamIds: ["a", "b"], updatedAt: 0 }] });
    expect(migrated.declarations.find((row) => row.id === "merge")?.declaration.playerKey).toBe("steam:a");
    await removeRoleDeclaration(migrated, "merge");
  });
});
