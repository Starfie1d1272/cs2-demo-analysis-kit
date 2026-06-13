import { describe, expect, it } from "vitest";
import { seriesVetoSchema } from "@cs2dak/contract";
import { deriveVetoSummary, suggestSeriesGroups, vetoSkeleton } from "./series";
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

    expect(groups.find((group) => group.id === "series:2026-06-01:A|B")?.format).toBe("bo1");
    expect(groups.find((group) => group.id === "series:2026-06-02:A|C")?.format).toBe("bo3");
    expect(groups.find((group) => group.id === "series:2026-06-03:A|D")?.format).toBe("bo5");
  });

  it("BO5 骨架是 2 ban + 4 pick + 1 decider（与打了几张图无关）", () => {
    const bo5 = vetoSkeleton("bo5");
    expect(bo5.filter((s) => s.actionType === "ban").length).toBe(2);
    expect(bo5.filter((s) => s.actionType === "pick").length).toBe(4);
    expect(bo5.filter((s) => s.actionType === "decider").length).toBe(1);
    // decider 留空队伍 = 拼刀选边
    expect(bo5.at(-1)?.teamKey).toBeNull();
  });

  it("BO3 骨架是 ban-ban-pick-pick-ban-ban-decider", () => {
    const bo3 = vetoSkeleton("bo3");
    expect(bo3.map((s) => s.actionType)).toEqual(["ban", "ban", "pick", "pick", "ban", "ban", "decider"]);
  });

  it("填满地图的 veto 通过 schema 并派生出 picked/banned/decider", () => {
    const maps = ["de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_dust2", "de_overpass"];
    const steps = vetoSkeleton("bo3").map((step, i) => ({
      stepOrder: i + 1,
      actionType: step.actionType,
      teamKey: step.teamKey,
      mapName: maps[i]!,
      side: null as "t" | "ct" | null
    }));
    const veto = {
      version: "cs2-demo-analysis-kit/series-veto-0.1" as const,
      seriesId: "s1",
      format: "bo3" as const,
      teamAName: "A",
      teamBName: "B",
      mapPool: maps,
      ...deriveVetoSummary(steps),
      steps
    };
    expect(() => seriesVetoSchema.parse(veto)).not.toThrow();
    expect(veto.maps.picked.length).toBe(2);
    expect(veto.maps.banned.length).toBe(4);
    expect(veto.maps.decider).toBeTruthy();
  });
});

