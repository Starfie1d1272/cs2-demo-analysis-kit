import { describe, expect, it } from "vitest";
import { eventPackageSchema } from "./event-package.js";

const valid = {
  version: "cs2-demo-analysis-kit/event-package-1.0",
  source: "manual",
  exportedAt: "2026-06-20T00:00:00Z",
  event: { slug: "cologne-major-2026", name: "IEM Cologne Major 2026", kind: "major", stages: [{ key: "playoffs", name: "淘汰赛", type: "single_elim", teamCount: 8, advanceCount: 1 }] },
  teams: [{ key: "a", name: "Team A", players: [] }, { key: "b", name: "Team B", players: [] }],
  series: [{ key: "final", stage: "playoffs", round: 1, format: "bo5", teamAKey: "a", teamBKey: "b", maps: [] }],
} as const;

describe("eventPackageSchema", () => {
  it("accepts a valid event package", () => {
    expect(eventPackageSchema.parse(valid).event.slug).toBe("cologne-major-2026");
  });

  it("rejects unknown team and stage references", () => {
    const result = eventPackageSchema.safeParse({ ...valid, series: [{ ...valid.series[0], teamBKey: "missing", stage: "missing" }] });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate keys and same-team series", () => {
    expect(eventPackageSchema.safeParse({ ...valid, teams: [valid.teams[0], valid.teams[0]] }).success).toBe(false);
    expect(eventPackageSchema.safeParse({ ...valid, series: [{ ...valid.series[0], teamBKey: "a" }] }).success).toBe(false);
  });

  it("validates bracket nodes and series node references", () => {
    const bracket = {
      ...valid,
      event: { ...valid.event, stages: [{ ...valid.event.stages[0], bracketNodes: [
        { id: "semi", label: "半决赛", round: 1, lane: "single", nextWinNodeId: "final" },
        { id: "final", label: "决赛", round: 2, lane: "single", nextWinNodeId: null },
      ] }] },
      series: [{ ...valid.series[0], bracketNodeId: "final" }],
    };
    expect(eventPackageSchema.safeParse(bracket).success).toBe(true);
    expect(eventPackageSchema.safeParse({ ...bracket, series: [{ ...bracket.series[0], bracketNodeId: "missing" }] }).success).toBe(false);
    expect(eventPackageSchema.safeParse({ ...bracket, event: { ...bracket.event, stages: [{ ...bracket.event.stages[0], bracketNodes: [{ id: "semi", label: "半决赛", round: 1, nextWinNodeId: "missing" }] }] } }).success).toBe(false);
    expect(eventPackageSchema.safeParse({ ...bracket, event: { ...bracket.event, stages: [{ ...bracket.event.stages[0], bracketNodes: [{ id: "self", label: "自环", round: 1, nextWinNodeId: "self" }] }] } }).success).toBe(false);
    expect(eventPackageSchema.safeParse({ ...bracket, event: { ...bracket.event, stages: [{ ...bracket.event.stages[0], bracketNodes: [
      { id: "later", label: "后轮", round: 2, nextWinNodeId: "early" }, { id: "early", label: "前轮", round: 1 },
    ] }] } }).success).toBe(false);
    expect(eventPackageSchema.safeParse({ ...bracket, event: { ...bracket.event, stages: [{ ...bracket.event.stages[0], bracketNodes: [
      { id: "a", label: "A", round: 1, nextWinNodeId: "b" }, { id: "b", label: "B", round: 2, nextWinNodeId: "a" },
    ] }] } }).success).toBe(false);
  });
});
