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
});
