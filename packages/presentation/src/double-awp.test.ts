import { describe, expect, it } from "vitest";
import type { TeamAwpRoundFact } from "@cs2dak/contract";
import { buildDoubleAwpAnalyses } from "./double-awp.js";

function row(roundNumber: number, overrides: Partial<TeamAwpRoundFact> = {}): TeamAwpRoundFact {
  return {
    analysisVersion: 5, matchId: `m${Math.ceil(roundNumber / 3)}`, mapName: roundNumber % 2 ? "de_nuke" : "de_inferno", roundNumber,
    teamKey: "teamA", side: "ct", economyType: "full", opponentEconomyType: "full", scorePhase: "first_half", won: roundNumber % 2 === 0,
    roundStartAwpPlayerIndices: [0, 1], doubleAwpActiveSeconds: 12, awpActiveSeconds: 28, awpShots: 4, awpKills: 2, awpDamage: null,
    openingKills: 1, openingDeaths: 0,
    availability: { replay: "available", nav: "available", callouts: "available", shots: "available" }, ...overrides,
  };
}

describe("double AWP analysis", () => {
  it("keeps CT qualified conditions, combinations and observable contribution fields", () => {
    const model = buildDoubleAwpAnalyses(Array.from({ length: 6 }, (_, index) => row(index + 1)), { teamKeyFor: () => "Team", playerKeyFor: (_match, index) => `p${index}` })[0]!;
    expect(model).toMatchObject({ teamKey: "Team", side: "ct", status: "ready", doubleAwpRoundCount: 6, qualifiedRoundCount: 6, openingKills: 6, awpKills: 12, awpDamage: null });
    expect(model.combinations[0]).toEqual({ playerKeys: ["p0", "p1"], rounds: 6 });
    expect(model.mapDistribution).toHaveLength(2);
  });

  it("does not merge T-side double AWP into CT output and excludes force rounds from the denominator", () => {
    const models = buildDoubleAwpAnalyses([row(1), row(2, { side: "t" }), row(3, { economyType: "force" })], { teamKeyFor: () => "Team" });
    expect(models).toHaveLength(2);
    expect(models.find((model) => model.side === "ct")?.qualifiedRoundCount).toBe(1);
    expect(models.find((model) => model.side === "t")?.doubleAwpRoundCount).toBe(1);
  });
});
