import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { ROLE_DECLARATIONS_SCHEMA_VERSION, loadRoleDeclarations, migrateRoleDeclarationsForIdentity, removeRoleDeclaration, upsertRoleDeclaration, type RoleDeclarationsState } from "./role-declarations";
import { getStorage } from "./storage";

describe("role declaration state", () => {
  beforeEach(async () => { await getStorage().records("role-declarations").delete("current"); });

  it("persists CRUD independently from facts namespaces", async () => {
    expect(ROLE_DECLARATIONS_SCHEMA_VERSION).toBe(2);
    let state: RoleDeclarationsState = { version: 2, declarations: [] };
    state = await upsertRoleDeclaration(state, { playerKey: "steam:a", role: "igl", priority: "primary", source: "user", provenance: "用户声明" }, "crud");
    await getStorage().records("facts:player_position_rounds").put("m1", { disposable: true });
    await getStorage().records("facts:player_position_rounds").deleteByPrefix("m1");
    expect((await loadRoleDeclarations()).declarations).toHaveLength(1);
    expect((await removeRoleDeclaration(state, "crud")).declarations).toEqual([]);
  });

  it("migrates v1 rows without losing ids, timestamps or user data", async () => {
    await getStorage().records("role-declarations").put("current", { version: 1, declarations: [
      { id: "d1", createdAt: 1, updatedAt: 2, declaration: { playerKey: "steam:a", role: "igl", source: "user", provenance: "用户声明" } },
      { id: "d2", createdAt: 3, updatedAt: 4, declaration: { playerKey: "steam:a", role: "anchor", source: "user", provenance: "用户声明" } },
    ] });
    const migrated = await loadRoleDeclarations();
    expect(migrated.version).toBe(2);
    expect(migrated.declarations).toMatchObject([
      { id: "d1", createdAt: 1, updatedAt: 2, declaration: { role: "igl", priority: "primary" } },
      { id: "d2", createdAt: 3, updatedAt: 4, declaration: { role: "anchor", priority: "secondary" } },
    ]);
  });

  it("keeps at most one primary per player/team/map/time scope", async () => {
    let state: RoleDeclarationsState = { version: 2, declarations: [] };
    state = await upsertRoleDeclaration(state, { playerKey: "p", role: "anchor", priority: "primary", source: "user", provenance: "first" }, "first");
    state = await upsertRoleDeclaration(state, { playerKey: "p", role: "igl", priority: "primary", source: "user", provenance: "second" }, "second");
    expect(state.declarations.filter((row) => row.declaration.priority === "primary")).toHaveLength(1);
    expect(state.declarations.find((row) => row.id === "first")?.declaration.priority).toBe("secondary");
  });

  it("migrates declarations by steamId intersection after an identity merge", async () => {
    const state: RoleDeclarationsState = { version: 2, declarations: [] };
    await upsertRoleDeclaration(state, { playerKey: "steam:b", role: "awper", priority: "secondary", source: "user", provenance: "用户声明" }, "merge");
    const migrated = await migrateRoleDeclarationsForIdentity({ version: 1, teamRenames: {}, mappings: [{ playerKey: "steam:a", displayName: "A", steamIds: ["a", "b"], updatedAt: 0 }] });
    expect(migrated.declarations.find((row) => row.id === "merge")?.declaration.playerKey).toBe("steam:a");
  });
});
