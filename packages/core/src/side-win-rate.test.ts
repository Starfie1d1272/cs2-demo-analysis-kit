import { describe, expect, it } from "vitest";
import type { DemoPackage } from "@cs2dak/contract";
import { buildTeamSideWinRates } from "./side-win-rate";

describe("buildTeamSideWinRates", () => {
  it("aggregates T/CT win rates for both teams from canonical rounds", () => {
    const pkg = {
      rounds: [
        { teamASide: "ct", teamBSide: "t", winnerTeamKey: "teamA" },
        { teamASide: "ct", teamBSide: "t", winnerTeamKey: "teamB" },
        { teamASide: "t", teamBSide: "ct", winnerTeamKey: "teamA" }
      ]
    } as DemoPackage;

    expect(buildTeamSideWinRates(pkg)).toEqual({
      teamA: {
        ct: { played: 2, won: 1, winRate: 0.5 },
        t: { played: 1, won: 1, winRate: 1 }
      },
      teamB: {
        t: { played: 2, won: 1, winRate: 0.5 },
        ct: { played: 1, won: 0, winRate: 0 }
      }
    });
  });

  it("returns empty team summaries when rounds are unavailable", () => {
    expect(buildTeamSideWinRates({ rounds: [] } as unknown as DemoPackage)).toEqual({
      teamA: {},
      teamB: {}
    });
  });
});
