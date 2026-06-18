import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TacticalCluster } from "../../lib/tactics";
import type { TacticalRoundFact } from "../../lib/facts";
import { PatternExplorer } from "./PatternExplorer";

describe("PatternExplorer", () => {
  it("常驻代表回合回放，时间使用比赛时钟且不再渲染战术切片", () => {
    const cluster = {
      id: "de_ancient:t:default-a",
      mapName: "de_ancient",
      side: "t",
      teamName: "Team A",
      opponentName: "Team B",
      targetSite: "a",
      primaryCategory: "三A",
      openingSignature: "opening",
      defaultsBasis: "-",
      executeBucket: "mid",
      roundCount: 1,
      winRatePercent: 100,
      plantRatePercent: 100,
      fakeRoundCount: 0,
      rounds: [{ matchId: "m1", roundNumber: 7, won: true, economy: "full", planted: true }]
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
    expect(html).toContain("stu-info-tip");
    expect(html).not.toContain("胜回合站位");
    expect(html).not.toContain("▶ 回放");
    expect(html).not.toContain("88s");
  });
});
