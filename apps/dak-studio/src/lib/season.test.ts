import { describe, expect, it } from "vitest";
import { buildTournamentInsightsFromFacts, type TournamentFacts } from "@cs2dak/presentation";
import { withTeamRenames } from "./season";

/** 一张地图的最小 TournamentFacts：teamA 赢全部 N 个回合（手枪局走 ct 侧）。 */
function makeFacts(matchId: string, teamA: string, teamB: string): TournamentFacts {
  const rounds = Array.from({ length: 4 }, (_, i) => ({
    roundNumber: i + 1,
    winnerSide: "ct" as const,
    winnerTeamKey: "teamA" as const,
    teamAEconomy: "full",
    teamBEconomy: "full"
  }));
  return {
    matchId,
    mapName: "de_mirage",
    teams: { teamA, teamB },
    players: [],
    kills: [],
    rounds
  };
}

describe("withTeamRenames", () => {
  it("不传 renames 时原样返回（同一引用）", () => {
    const facts = [makeFacts("m1", "NJU", "OPP")];
    expect(withTeamRenames(facts, undefined)).toBe(facts);
    expect(withTeamRenames(facts, {})).toBe(facts);
  });

  it("把原始队名按 teamRenames 重映射", () => {
    const facts = [makeFacts("m1", "NJU.A", "OPP")];
    const mapped = withTeamRenames(facts, { "NJU.A": "NJU" });
    expect(mapped[0].teams.teamA).toBe("NJU");
    expect(mapped[0].teams.teamB).toBe("OPP");
    // 纯函数：不改原对象
    expect(facts[0].teams.teamA).toBe("NJU.A");
  });

  it("改名后两场不同原名的同队在明细矩阵里合并成一行（bug 回归）", () => {
    const facts = [makeFacts("m1", "NJU.A", "OPP1"), makeFacts("m2", "NJU_LegacyTag", "OPP2")];
    const renames = { "NJU.A": "NJU", "NJU_LegacyTag": "NJU" };

    const before = buildTournamentInsightsFromFacts(facts);
    const after = buildTournamentInsightsFromFacts(withTeamRenames(facts, renames));

    // 未改名前：NJU.A 与 NJU_LegacyTag 各占一行
    expect(before.teamEconomySummaries.filter((t) => t.teamName.startsWith("NJU"))).toHaveLength(2);
    // 改名后：合并为单行 "NJU"，maps 累加
    const merged = after.teamEconomySummaries.filter((t) => t.teamName === "NJU");
    expect(merged).toHaveLength(1);
    expect(merged[0].maps).toBe(2);
  });
});
