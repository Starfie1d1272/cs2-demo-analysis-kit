import { describe, expect, it } from "vitest";
import { elimModelFromResults, swissModelFromResults } from "./event-bracket";
import type { StudioSeriesRecord } from "./series";
import type { EventStage } from "@cs2dak/contract";

function series(partial: Partial<StudioSeriesRecord> & { id: string; teamAName: string; teamBName: string }): StudioSeriesRecord {
  return {
    eventId: "e", externalKey: partial.id, name: `${partial.teamAName} vs ${partial.teamBName}`,
    entryIds: [], format: "bo1", veto: null, stageKey: "s", round: null, entryRound: null,
    bracketNodeId: null, status: "finished", scoreA: null, scoreB: null,
    teamARecordBefore: null, teamBRecordBefore: null, scheduledAt: null, completedAt: null,
    mapAssignments: [], updatedAt: 0, ...partial,
  } as StudioSeriesRecord;
}

describe("swissModelFromResults", () => {
  it("按轮次累积战绩，归入赛前战绩组，并推算晋级/淘汰", () => {
    const rows = [
      series({ id: "r1a", teamAName: "A", teamBName: "B", round: 1, scoreA: 1, scoreB: 0 }),
      series({ id: "r1b", teamAName: "C", teamBName: "D", round: 1, scoreA: 1, scoreB: 0 }),
      series({ id: "r2a", teamAName: "A", teamBName: "C", round: 2, scoreA: 1, scoreB: 0 }),
      series({ id: "r2b", teamAName: "B", teamBName: "D", round: 2, scoreA: 1, scoreB: 0 }),
    ];
    const model = swissModelFromResults(rows, 2, 2);
    expect(model.columns[0]?.round).toBe(1);
    expect(model.columns[0]?.groups[0]?.record).toBe("0-0");
    expect(model.columns[0]?.groups[0]?.matches).toHaveLength(2);
    // 第二轮：A、C 都是 1-0 → "1-0" 组；B、D 都是 0-1 → "0-1" 组
    const r2 = model.columns[1]!;
    expect(r2.groups.map((g) => g.record).sort()).toEqual(["0-1", "1-0"]);
    expect(model.advanced.map((a) => a.team)).toContain("A");
    expect(model.advanced.find((a) => a.team === "A")?.record).toBe("2-0");
    expect(model.eliminated.map((e) => e.team)).toContain("D");
    // 胜者标记正确
    expect(model.columns[0]?.groups[0]?.matches[0]?.winner).toBe("A");
  });
});

describe("elimModelFromResults", () => {
  const stage = (nodes?: EventStage["bracketNodes"]): EventStage => ({ key: "p", name: "淘汰赛", type: "single_elim", teamCount: 4, advanceCount: 1, bracketNodes: nodes });

  it("无 bracketNodes 时按 round 推算列（决赛在最后一轮）", () => {
    const rows = [
      series({ id: "qf1", teamAName: "A", teamBName: "B", round: 1, scoreA: 2, scoreB: 1 }),
      series({ id: "qf2", teamAName: "C", teamBName: "D", round: 1, scoreA: 2, scoreB: 0 }),
      series({ id: "f", teamAName: "A", teamBName: "C", round: 2, scoreA: 2, scoreB: 0 }),
    ];
    const model = elimModelFromResults(rows, stage());
    expect(model.columns).toHaveLength(2);
    expect(model.columns.at(-1)?.label).toBe("决赛");
    expect(model.columns.at(-1)?.matches[0]?.winner).toBe("A");
  });

  it("有 bracketNodes 时用节点标签与轮次", () => {
    const nodes = [
      { id: "r1-m1", label: "半决赛 1", round: 1, lane: "single" as const, nextWinNodeId: "r2-m1", nextLossNodeId: null },
      { id: "r2-m1", label: "决赛", round: 2, lane: "single" as const, nextWinNodeId: null, nextLossNodeId: null },
    ];
    const rows = [series({ id: "f", teamAName: "A", teamBName: "C", round: 2, bracketNodeId: "r2-m1", scoreA: 2, scoreB: 1 })];
    const model = elimModelFromResults(rows, stage(nodes));
    expect(model.columns.at(-1)?.label).toBe("决赛");
    expect(model.columns.at(-1)?.matches[0]?.teamA).toBe("A");
  });
});
