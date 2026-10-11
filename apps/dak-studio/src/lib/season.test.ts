import { describe, expect, it } from "vitest";
import { buildTournamentInsightsFromFacts, type DuelInsightsFacts, type TournamentFacts } from "@cs2dak/presentation";
import { filterDuelFactsByTeam, withTeamRenames } from "./season";

/** 一张地图的最小 TournamentFacts：teamA 赢全部 N 个回合（手枪局走 ct 侧）。 */
function makeFacts(matchId: string, teamA: string, teamB: string, teamAId = `observed:${matchId}:A`): TournamentFacts {
  const rounds = Array.from({ length: 4 }, (_, i) => ({
    roundNumber: i + 1,
    winnerSide: "ct" as const,
    winnerTeamKey: "teamA" as const,
    teamAEconomy: "full",
    teamBEconomy: "full"
  }));
  return {
    matchId,
    teamEntityKeys: { teamA: teamAId, teamB: `observed:${matchId}:B` },
    playerEntityKeys: {},
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

  it("相同显示名不会把两个不同稳定 ID 合并", () => {
    const facts = [makeFacts("m1", "NJU.A", "OPP1"), makeFacts("m2", "NJU_LegacyTag", "OPP2")];
    const renames = { "NJU.A": "NJU", "NJU_LegacyTag": "NJU" };

    const before = buildTournamentInsightsFromFacts(facts);
    const after = buildTournamentInsightsFromFacts(withTeamRenames(facts, renames));

    // 未改名前：NJU.A 与 NJU_LegacyTag 各占一行
    expect(before.teamEconomySummaries.filter((t) => t.teamName.startsWith("NJU"))).toHaveLength(2);
    // 改名仅修改标签，两个独立观察身份仍保持两行。
    const merged = after.teamEconomySummaries.filter((t) => t.teamName === "NJU");
    expect(merged).toHaveLength(2);
    expect(merged.map(row => row.maps)).toEqual([1, 1]);
    expect(new Set(merged.map(row => row.teamEntityKey)).size).toBe(2);
  });
  it("相同 stable ID 跨图改名仍归并，统计不变", () => {
    const facts = [makeFacts("m1", "NJU.A", "OPP1", "stable-nju"), makeFacts("m2", "NJU_LegacyTag", "OPP2", "stable-nju")];
    const before = buildTournamentInsightsFromFacts(facts);
    const after = buildTournamentInsightsFromFacts(withTeamRenames(facts, { "NJU.A": "NJU", "NJU_LegacyTag": "NJU" }));
    expect(before.teamEconomySummaries.filter(row => row.teamName.startsWith("NJU"))).toHaveLength(1);
    expect(after.teamEconomySummaries.find(row => row.teamName === "NJU")).toMatchObject({ maps: 2, rounds: 8, roundWins: 8 });
    expect(after.roundCount).toBe(before.roundCount);
    expect(after.economyMatrix).toEqual(before.economyMatrix);
  });
  it("缺少稳定身份的旧缓存明确失败，不按显示名回退", () => {
    const legacy = makeFacts("m1", "A", "B");
    delete (legacy as Partial<TournamentFacts>).teamEntityKeys;
    expect(() => buildTournamentInsightsFromFacts([legacy])).toThrow("explicit stable team IDs");
  });
});

describe("team row filtering", () => {
  it("keeps focus-team duels with opponent context, while removing opponent mechanics rows", () => {
    const facts = [{
      matchId: "m1",
      teamNamesBySteamId: { a: "Alpha", b: "Bravo", c: "Bravo" },
      duelRows: [
        { killerSteamId64: "a", victimSteamId64: "b", id: "keep" },
        { killerSteamId64: "b", victimSteamId64: "c", id: "drop" },
      ],
      openingRows: [],
      mechanicsRows: [{ steamId64: "a" }, { steamId64: "b" }],
    }] as unknown as DuelInsightsFacts[];

    const filtered = filterDuelFactsByTeam(facts, ["Alpha"]);
    expect(filtered[0]!.duelRows.map((row) => row.id)).toEqual(["keep"]);
    expect(filtered[0]!.mechanicsRows.map((row) => row.steamId64)).toEqual(["a"]);
    expect(filtered[0]!.teamNamesBySteamId).toEqual({ a: "Alpha", b: "Bravo", c: "Bravo" });
  });
});
