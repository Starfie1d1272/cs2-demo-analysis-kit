import { describe, expect, it } from "vitest";
import { seriesVetoSchema } from "@cs2dak/contract";
import { buildVetoTemplate, suggestSeriesGroups } from "./series";
import type { StudioDemoEntry } from "./library";

function entry(id: string, date: string, teamAName: string, teamBName: string): StudioDemoEntry {
  return {
    id,
    fileName: `${date}_de_mirage_${teamAName}-vs-${teamBName}.zip`,
    importedAt: 0,
    tags: [],
    sourceDemPath: null,
    meta: {
      mapName: "de_mirage",
      teamAName,
      teamBName,
      teamAScore: 13,
      teamBScore: 10,
      roundCount: 23,
      durationSeconds: 2400,
      playerCount: 10,
      hasReplay: true,
      source: "test"
    }
  };
}

describe("series grouping", () => {
  it("clusters BO1/BO3/BO5 by renamed teams and match date", () => {
    const groups = suggestSeriesGroups([
      entry("bo1", "2026-06-01", "A", "B"),
      entry("bo3-1", "2026-06-02", "A", "C"),
      entry("bo3-2", "2026-06-02", "C", "A"),
      entry("bo5-1", "2026-06-03", "Alpha", "D"),
      entry("bo5-2", "2026-06-03", "D", "Alpha"),
      entry("bo5-3", "2026-06-03", "Alpha", "D"),
      entry("bo5-4", "2026-06-03", "D", "Alpha"),
    ], { Alpha: "A" });

    expect(groups.find((group) => group.id === "bo1")?.format).toBe("bo1");
    expect(groups.find((group) => group.entryIds.includes("bo3-1"))?.format).toBe("bo3");
    expect(groups.find((group) => group.entryIds.includes("bo5-1"))?.format).toBe("bo5");
  });

  it("builds SeriesVeto with maps summary and side choices", () => {
    const veto = buildVetoTemplate("s1", "bo3", "A", "B", ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Overpass"]);
    expect(() => seriesVetoSchema.parse(veto)).not.toThrow();
    expect(veto.maps.picked.length).toBe(2);
    expect(veto.maps.banned.length).toBe(4);
    expect(veto.maps.decider).toBeTruthy();
  });
});

