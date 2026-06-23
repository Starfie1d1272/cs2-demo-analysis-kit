import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TacticalCluster } from "../../lib/tactics";
import type { TacticalRoundFact } from "../../lib/facts";
import { PatternExplorer, resolveEconomyFilter } from "./PatternExplorer";

describe("PatternExplorer", () => {
  it("常驻代表回合回放，时间使用比赛时钟且不再渲染战术切片", () => {
    const cluster = {
      id: "t|de_ancient|team a|gun|3A-1MID-1B:split|a_hall:3|b_outer:1|mid:1",
      mapName: "de_ancient",
      side: "t",
      economyEntry: "gun",
      teamIdentity: "team a",
      teamName: "Team A",
      opponentNames: ["Team B"],
      opponentIdentities: ["team b"],
      openingIntent: { regionCounts: { a: 3, mid: 1, b: 1, unknown: 0 }, spread: "split" },
      defaultAnchorCounts: { a_hall: 3, b_outer: 1, mid: 1 },
      primaryCategory: "A侧控图",
      openingSignature: "de_ancient:t:3A-1MID-1B:split:a_hall+b_outer+mid",
      entryEvidence: {
        coveredRounds: 1,
        totalRounds: 1,
        coveragePercent: 100,
        routes: [{ site: "a", combo: "a_main", roundCount: 1, percentOfCovered: 100 }],
      },
      roundCount: 1,
      winRatePercent: 100,
      plantRatePercent: 100,
      rounds: [{ matchId: "m1", roundNumber: 7, teamKey: "teamA", won: true, economy: "full", planted: true }]
    } satisfies TacticalCluster;
    const fact = {
      analysisVersion: 5,
      matchId: "m1",
      mapName: "de_ancient",
      side: "t",
      teamName: "Team A",
      opponentName: "Team B",
      roundNumber: 7,
      economy: "full",
      won: true,
      executeRemainSec: 88,
      plant: { site: "a", tick: 9000, remainSec: 50 },
      firstKillForTeam: true,
      c4Route: null,
      targetSite: "a",
      siteEntries: {
        a: { entrants: 4, secondEntryTick: 8800, order: [{ entryChokeId: "a_main", routeFamilyId: "a_main" }] },
        b: { entrants: 0, secondEntryTick: null, order: [] },
      },
      openingPressure: [{ callout: "Outside", calloutLabel: "匪口", kind: "deep" }],
      grenades: []
    } as unknown as TacticalRoundFact;

    const html = renderToStaticMarkup(React.createElement(PatternExplorer, {
      clusters: [cluster],
      facts: [fact],
      entryByMatchId: new Map(),
      onOpenMatch: () => undefined
    }));

    expect(html).toContain("stu-pe-cluster-active");
    expect(html).toContain("读取本地回放");
    expect(html).toContain("1:28");
    expect(html).toContain("A 0:50");
    expect(html).toContain("匪口（深入）");
    expect(html).toContain("常见进点路线");
    expect(html).toContain("覆盖 1/1（100.0%）");
    expect(html).toContain("dak-info-tip");
    expect(html).not.toContain("胜回合站位");
    expect(html).not.toContain("▶ 回放");
    expect(html).not.toContain("88s");
  });

  it("当前 side 不存在所选经济层时回退到第一个可用入口", () => {
    expect(resolveEconomyFilter("gun", ["eco", "force"])).toBe("eco");
    expect(resolveEconomyFilter("gun", [])).toBe("all");
    expect(resolveEconomyFilter("gun", ["gun", "eco"])).toBe("gun");
  });
});
