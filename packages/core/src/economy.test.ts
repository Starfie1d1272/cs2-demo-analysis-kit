import { describe, expect, it } from "vitest";
import type { EconomyPoint } from "@cs2dak/contract";
import { buildEconomyConversion, economyLabelCn } from "./economy";

function pt(p: Partial<EconomyPoint> & Pick<EconomyPoint, "teamAEconomy" | "teamBEconomy" | "winnerTeamKey">): EconomyPoint {
  return {
    roundNumber: 1,
    teamA: 0,
    teamB: 0,
    advantage: 0,
    ...p,
  };
}

describe("buildEconomyConversion", () => {
  it("aggregates per-team win rate by economy type", () => {
    const points: EconomyPoint[] = [
      pt({ teamAEconomy: "full", teamBEconomy: "eco", winnerTeamKey: "teamA" }),
      pt({ teamAEconomy: "full", teamBEconomy: "full", winnerTeamKey: "teamB" }),
      pt({ teamAEconomy: "eco", teamBEconomy: "full", winnerTeamKey: "teamA" }),
    ];
    const { teamA, teamB } = buildEconomyConversion(points);

    // teamA played full twice, won once.
    expect(teamA.full).toEqual({ played: 2, won: 1, winRate: 0.5 });
    // teamA played eco once, won it (an eco upset).
    expect(teamA.eco).toEqual({ played: 1, won: 1, winRate: 1 });
    // teamB played full twice, won once.
    expect(teamB.full).toEqual({ played: 2, won: 1, winRate: 0.5 });
    // teamB played eco once, lost it.
    expect(teamB.eco).toEqual({ played: 1, won: 0, winRate: 0 });
  });

  it("returns empty conversions for no rounds", () => {
    expect(buildEconomyConversion([])).toEqual({ teamA: {}, teamB: {} });
  });
});

describe("economyLabelCn", () => {
  it("maps known economy types to Chinese labels", () => {
    expect(economyLabelCn("full")).toBe("全枪全弹");
    expect(economyLabelCn("ECO")).toBe("纯ECO");
    // conversion = the pistol-winner's follow-up full buy.
    expect(economyLabelCn("conversion")).toBe("转换局");
  });

  it("passes through unknowns and empties", () => {
    expect(economyLabelCn(null)).toBe("");
    expect(economyLabelCn("mystery")).toBe("mystery");
  });
});
