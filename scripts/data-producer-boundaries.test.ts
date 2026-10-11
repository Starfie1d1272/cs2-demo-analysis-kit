import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("frozen Tournament producer boundaries", () => {
  it("Evidence consumes the canonical data adapter, never a presentation ViewModel", async () => {
    const source = await readFile("packages/rivalhub-upload/src/evidence.ts", "utf8");
    const manifest = JSON.parse(await readFile("packages/rivalhub-upload/package.json", "utf8"));
    expect(source).not.toContain("@cs2dak/presentation");
    expect(manifest.dependencies).not.toHaveProperty("@cs2dak/presentation");
    expect(source).toContain("extractTournamentSourceFacts");
    expect(source).toContain("row.team.entityKey === identity.teamEntityKeys[teamKey]");
    expect(source).not.toMatch(/\.find\([^\n]*teamName/);
  });
  it("Core uses Tournament DTO types without importing its merge runtime or display labels", async () => {
    const source = await readFile("packages/core/src/tournament-facts.ts", "utf8");
    const tournamentImports = [...source.matchAll(/\bimport\s+([^;]*?)\s+from\s+["'](@cs2dak\/tournament)["']/g)];
    expect(tournamentImports).toHaveLength(1);
    expect(tournamentImports[0]![1]!.trim().startsWith("type ")).toBe(true);
    expect(source).not.toContain("@cs2dak/presentation");
    expect(source).not.toMatch(/legacy-team:|team[AB]\.name|player\.name|teams\.team[AB]/);
  });
});
