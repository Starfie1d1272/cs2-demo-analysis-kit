import { describe, expect, it } from "vitest";
import type { StudioDemoEntry } from "../lib/library";
import { seriesScore } from "./SeriesWorkspace";

function entry(teamAName: string, teamAScore: number, teamBName: string, teamBScore: number): StudioDemoEntry {
  return { meta: { teamAName, teamAScore, teamBName, teamBScore } } as StudioDemoEntry;
}

describe("seriesScore", () => {
  it("keeps the series team order when individual maps reverse teamA/teamB", () => {
    const series = { teamAName: "Team Falcons", teamBName: "Team Spirit" };
    const maps = [
      entry("Team Spirit", 16, "Team Falcons", 12),
      entry("Team Falcons", 7, "Team Spirit", 13),
      entry("Team Spirit", 13, "Team Falcons", 10),
    ];

    expect(seriesScore(series, maps)).toEqual({ winsA: 0, winsB: 3 });
  });
});
