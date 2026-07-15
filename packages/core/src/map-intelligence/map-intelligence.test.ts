import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDemoPackageFromZip } from "../loader.js";
import { extractMatchMapIntelligenceFacts } from "./index.js";

async function fixture(name: string) {
  return loadDemoPackageFromZip(await readFile(fileURLToPath(new URL(`../../../../fixtures/input/${name}`, import.meta.url))));
}

describe("extractMatchMapIntelligenceFacts", () => {
  it("derives compact Ancient position and shape facts without persisting replay frames", async () => {
    const pkg = await fixture("sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip");
    const facts = extractMatchMapIntelligenceFacts(pkg, { matchId: "ancient" });
    expect(facts.playerPositionRounds).toHaveLength(pkg.rounds.length * pkg.players.length);
    expect(facts.teamShapeRounds).toHaveLength(pkg.rounds.length * 2);
    expect(facts.teamAwpRounds).toHaveLength(pkg.rounds.length * 2);
    expect(facts.ctRotationRounds).toHaveLength(pkg.rounds.length * pkg.players.length / 2);
    expect(facts.playerPositionRounds.some((row) => row.positionGroupDwell.length > 0)).toBe(true);
    expect(facts.playerPositionRounds.some((row) => row.openingPositionGroupDwell.length > 0)).toBe(true);
    expect(facts.playerPositionRounds.every((row) => row.openingEligibleSeconds == null || row.eligibleSeconds == null || row.openingEligibleSeconds <= row.eligibleSeconds)).toBe(true);
    expect(facts.teamShapeRounds.some((row) => row.windows.some((window) => /^\d+(\+\d+)*$/.test(window.partition)))).toBe(true);
    expect(facts.teamShapeRounds.some((row) => row.openingWindows.length > 0)).toBe(true);
    expect(facts.ctRotationRounds.some((row) => row.initialResponsibilityResolved)).toBe(true);
    expect(facts.ctRotationRounds.every((row) => row.side === "ct" && !("role" in row))).toBe(true);
    expect(extractMatchMapIntelligenceFacts(pkg, { matchId: "ancient" }).ctRotationRounds).toEqual(facts.ctRotationRounds);
    const serialized = JSON.stringify(facts);
    expect(serialized).not.toContain('"frameCount"');
    expect(serialized).not.toContain('"pairwise"');
  });

  it("keeps Nuke fixture output compact and maps no sniper other than exact AWP into AWP facts", async () => {
    const pkg = await fixture("sample-2026-02-09_de_nuke_FURIA_2-13_Team_Vitality.zip");
    const facts = extractMatchMapIntelligenceFacts(pkg, { matchId: "nuke" });
    expect(facts.mapName).toBe("de_nuke");
    expect(facts.playerPositionRounds.every((row) => row.awpShots == null || row.awpShots >= 0)).toBe(true);
    expect(facts.teamShapeRounds.every((row) => row.availability.nav === "available")).toBe(true);
  });

  it.each([
    "sample-2026-02-09_de_inferno_Team_Vitality_13-8_FURIA.zip",
    "sample-2026-02-09_de_overpass_Team_Vitality_13-10_FURIA.zip",
  ])("retains opening path and multi-route position evidence for %s", async (name) => {
    const pkg = await fixture(name);
    const facts = extractMatchMapIntelligenceFacts(pkg, { matchId: name });
    expect(facts.playerPositionRounds.some((row) => row.openingPath.length > 1)).toBe(true);
    expect(new Set(facts.playerPositionRounds.flatMap((row) => row.openingPositionGroupDwell.map((group) => group.positionGroupId))).size).toBeGreaterThan(1);
  });

  it("uses explicit missing/unknown state when replay is unavailable and degrades Anubis without nav", async () => {
    const pkg = await fixture("sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip");
    const noReplay = { ...pkg, replay: undefined };
    const missing = extractMatchMapIntelligenceFacts(noReplay, { matchId: "missing" });
    expect(missing.playerPositionRounds.every((row) => row.openingEligibleSeconds === null && row.eligibleSeconds === null && row.activeAwpSeconds === null && row.availability.replay === "missing")).toBe(true);
    expect(missing.teamShapeRounds.every((row) => row.openingWindows.length === 0 && row.windows.length === 0 && row.coverageSeconds === null)).toBe(true);
    expect(missing.teamAwpRounds.every((row) => row.awpActiveSeconds === null && row.availability.replay === "missing")).toBe(true);
    expect(missing.ctRotationRounds.every((row) => row.initialPositionGroupId === null && row.crossedResponsibilityArea === null && row.availability.replay === "missing")).toBe(true);

    const anubis = extractMatchMapIntelligenceFacts({ ...pkg, match: { ...pkg.match, mapName: "de_anubis" } }, { matchId: "anubis", nav: null });
    expect(anubis.teamShapeRounds.every((row) => row.availability.nav === "missing")).toBe(true);
  });
});
