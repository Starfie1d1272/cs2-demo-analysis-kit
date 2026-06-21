import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { importEventPackage } from "./events";
import type { StudioDemoEntry } from "./library";

function entry(id: string, mapName: string): StudioDemoEntry {
  return {
    id,
    fileName: `${mapName}.zip`,
    importedAt: 1,
    tags: [],
    sourceDemPath: null,
    meta: {
      mapName,
      durationSeconds: 1,
      teamAName: "Spirit",
      teamBName: "Falcons",
      teamAScore: 13,
      teamBScore: 10,
      playerCount: 10,
      roundCount: 23,
      hasReplay: true,
      source: "test",
      serverName: null,
    },
  };
}

describe("importEventPackage", () => {
  it("creates Event and Series records and pairs local maps", async () => {
    const result = await importEventPackage({
      version: "cs2-demo-analysis-kit/event-package-1.0",
      source: "manual",
      exportedAt: "2026-06-20T00:00:00Z",
      event: { slug: "test-event", name: "Test Event", kind: "major", stages: [{ key: "final", name: "决赛", type: "single_elim", teamCount: 2, advanceCount: 1 }] },
      teams: [{ key: "spirit", name: "Spirit", players: [] }, { key: "falcons", name: "Falcons", players: [] }],
      series: [{
        key: "s1", stage: "final", round: 1, format: "bo3", teamAKey: "spirit", teamBKey: "falcons",
        maps: [{ order: 1, mapName: "de_ancient" }, { order: 2, mapName: "de_dust2" }],
      }],
    }, [entry("a", "de_ancient")]);

    expect(result.event.id).toBe("event:test-event");
    expect(result.series[0]).toMatchObject({ eventId: "event:test-event", entryIds: ["a"] });
    expect(result.matchedMaps).toBe(1);
    expect(result.missingMaps).toBe(1);
  });

  it("按 sha256 全局匹配，不被 demo 与包的队名拼写差异（Team Liquid vs Liquid）挡住", async () => {
    // demo 内嵌队名是 "Team Liquid"，包内队名是 "Liquid"：sameTeams 不相等，但 sha256 一致应命中。
    const demo = entry("hash-xyz", "de_nuke");
    demo.meta.teamAName = "Team Liquid";
    demo.meta.teamBName = "BIG";
    const result = await importEventPackage({
      version: "cs2-demo-analysis-kit/event-package-1.0",
      source: "manual",
      exportedAt: "2026-06-20T00:00:00Z",
      event: { slug: "ev2", name: "Ev2", kind: "major", stages: [{ key: "s", name: "瑞士轮", type: "swiss", teamCount: 16, advanceCount: 8 }] },
      teams: [{ key: "liquid", name: "Liquid", players: [] }, { key: "big", name: "BIG", players: [] }],
      series: [{
        key: "s1", stage: "s", round: 1, format: "bo1", teamAKey: "liquid", teamBKey: "big",
        maps: [{ order: 1, mapName: "de_nuke", demoHint: { fileName: "x.zip", sha256: "hash-xyz" } }],
      }],
    }, [demo]);

    expect(result.matchedMaps).toBe(1);
    expect(result.missingMaps).toBe(0);
    expect(result.series[0]?.entryIds).toEqual(["hash-xyz"]);
  });
});
