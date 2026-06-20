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
});
