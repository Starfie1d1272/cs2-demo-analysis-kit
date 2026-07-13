import { describe, it, expect } from "vitest";
import {
  defaultsBasisKey,
  advancedBasisKey,
  positionGroupSetKey,
  tacticalClusterKey,
  buildTacticalClusters,
  withTacticalTeamIdentities,
  autoName,
} from "./tactics.js";
import type { TacticalRoundFact } from "./facts.js";

function fact(p: Partial<TacticalRoundFact> = {}): TacticalRoundFact {
  return {
    analysisVersion: 4,
    c4Route: null,
    matchId: "m",
    mapName: "de_mirage",
    side: "t",
    teamKey: "teamA",
    teamName: "Team A",
    opponentName: "Team B",
    economy: "full",
    opponentEconomy: "full",
    won: true,
    roundNumber: 1,
    openingPressure: [],
    openingPattern: {
      side: "t",
      regionCounts: { a: 3, b: 0, mid: 2, unknown: 0 },
      positionGroupCounts: { a_ramp: 3, top_mid: 2 },
      spread: "split",
      coarseSignature: "T:3A-2MID-0B:split",
      detailedSignature: "T:a_ramp:3|top_mid:2",
      evidence: [],
    },
    targetSite: "a",
    siteEntries: {
      a: { entrants: 4, firstEntryTick: 1000, secondEntryTick: 1100, firstEntryRemainSec: 90, executeRemainSec: 88, order: [{ entryCallout: "PalaceInterior", entryChokeId: "a_palace", routeFamilyId: "a_palace" }] },
      b: { entrants: 0, firstEntryTick: null, secondEntryTick: null, firstEntryRemainSec: null, executeRemainSec: null, order: [] },
    },
    plant: { site: "a", tick: 1600, remainSec: 60 },
    grenades: [],
    executeRemainSec: 30,
    executeBucket: "late",
    firstKillForTeam: true,
    grenadeOccurrenceIds: [],
    ...p,
  } as TacticalRoundFact;
}

function noEntries(): TacticalRoundFact["siteEntries"] {
  const base = fact().siteEntries;
  return { a: { ...base.a, entrants: 0, order: [] }, b: { ...base.b, entrants: 0, order: [] } };
}

function entryOccurrence(entryChokeId: string): TacticalRoundFact["siteEntries"]["a"]["order"][number] {
  return {
    playerIndex: 1,
    tick: 1000,
    remainSec: 90,
    callout: "BombsiteA",
    entryCallout: "PalaceInterior",
    entryChokeId,
    routeFamilyId: entryChokeId,
    routeMarkerCallout: "PalaceInterior",
    trajectory: ["PalaceInterior", "BombsiteA"],
  };
}

describe("basis 序列化", () => {
  it("defaults 精确人头，按 anchorId 排序稳定", () => {
    expect(defaultsBasisKey({ a_ramp: 3, mid: 1, a_palace: 1 })).toBe("a_palace:1|a_ramp:3|mid:1");
  });
  it("空分布返回空串", () => {
    expect(defaultsBasisKey({})).toBe("");
  });
  it("过滤 0 人头条目", () => {
    expect(defaultsBasisKey({ a_ramp: 3, mid: 0 })).toBe("a_ramp:3");
  });
  it("advanced 同样可序列化", () => {
    expect(advancedBasisKey({ Catwalk: 1, Connector: 1 })).toBe("Catwalk:1|Connector:1");
  });
  it("聚类默认位身份保留精确人数结构", () => {
    expect(positionGroupSetKey({ a_ramp: 3, top_mid: 2 })).toBe("a_ramp:3|top_mid:2");
    expect(positionGroupSetKey({ a_ramp: 1, top_mid: 4 })).toBe("a_ramp:1|top_mid:4");
  });
});

describe("tactical 聚类", () => {
  it("key = side|map|经济入口|opening intent|默认位集合", () => {
    expect(tacticalClusterKey(fact())).toBe("t|de_mirage|team a|gun|3A-2MID-0B:split|a_ramp:3|top_mid:2");
  });
  it("经济入口进入 key：长枪/eco 分属不同簇", () => {
    const gun = tacticalClusterKey(fact({ economy: "full", opponentEconomy: "full" }));
    const eco = tacticalClusterKey(fact({ economy: "eco", opponentEconomy: "full" }));
    expect(gun).toContain("|gun|");
    expect(eco).toContain("|eco|");
  });
  it("节奏不进 key：同目标点同入口不同 executeBucket 仍同簇", () => {
    const a = tacticalClusterKey(fact({ executeBucket: "rush" }));
    const b = tacticalClusterKey(fact({ executeBucket: "late" }));
    expect(a).toBe(b);
  });
  it("CT 同样使用 opening intent + 默认位，不使用 targetSite/节奏", () => {
    const a = tacticalClusterKey(fact({ side: "ct", targetSite: "a" }));
    const b = tacticalClusterKey(fact({ side: "ct", targetSite: "b", executeBucket: "late" }));
    expect(a).toBe(b);
    expect(a).toBe("ct|de_mirage|team a|gun|3A-2MID-0B:split|a_ramp:3|top_mid:2");
  });
  it("同默认位不同 plant/进点/节奏仍为同一开局簇", () => {
    const rush = fact({ targetSite: "a", plant: { site: "a", tick: 1600, remainSec: 60 }, executeBucket: "rush", roundNumber: 2, won: false });
    const late = fact({
      targetSite: "b",
      plant: { site: "b", tick: 1600, remainSec: 60 },
      siteEntries: {
        a: { ...fact().siteEntries.a, entrants: 0, order: [] },
        b: { ...fact().siteEntries.b, entrants: 4, order: [entryOccurrence("b_apps")] },
      },
      executeBucket: "late",
      roundNumber: 3,
    });
    const clusters = buildTacticalClusters([rush, late]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.roundCount).toBe(2);
  });
  it("不同默认位集合分属不同簇", () => {
    const other = fact({ openingPattern: { ...fact().openingPattern, positionGroupCounts: { a_palace: 1, top_mid: 4 } } });
    expect(buildTacticalClusters([fact(), other])).toHaveLength(2);
  });
  it("相同 anchor 不同人数结构分属不同簇", () => {
    const shifted = fact({ openingPattern: { ...fact().openingPattern, positionGroupCounts: { a_ramp: 1, top_mid: 4 } } });
    expect(buildTacticalClusters([fact(), shifted])).toHaveLength(2);
  });
  it("全部队伍视角不会把不同 identity 合并，并保留真实对手集合", () => {
    const teamA1 = fact({ opponentName: "Team B" });
    const teamA2 = fact({ roundNumber: 2, opponentName: "Team C" });
    const teamD = fact({ teamKey: "teamA", teamName: "Team D", opponentName: "Team B" });
    const clusters = buildTacticalClusters([teamA1, teamA2, teamD]);
    expect(clusters).toHaveLength(2);
    const teamACluster = clusters.find((cluster) => cluster.teamIdentity === "team a")!;
    expect(teamACluster.opponentNames).toEqual(["Team B", "Team C"]);
  });
  it("调用方 canonical rename 可将 NAVI/Natus Vincere 合为同队", () => {
    const rows = withTacticalTeamIdentities([
      fact({ teamName: "NAVI", matchId: "m1" }),
      fact({ teamName: "Natus Vincere", matchId: "m2" }),
    ], { NAVI: "Natus Vincere" });
    expect(rows.map((row) => row.teamIdentity)).toEqual(["natus vincere", "natus vincere"]);
    expect(buildTacticalClusters(rows)).toHaveLength(1);
  });
  it("同队跨 demo 的 teamA/teamB 槽位合并，round provenance 可追溯", () => {
    const asA = { ...fact({ matchId: "m1", teamKey: "teamA" }), teamIdentity: "team a" };
    const asB = { ...fact({ matchId: "m2", teamKey: "teamB" }), teamIdentity: "team a" };
    const [cluster] = buildTacticalClusters([asA, asB]);
    expect(cluster?.rounds.map(({ matchId, teamKey }) => ({ matchId, teamKey }))).toEqual([
      { matchId: "m1", teamKey: "teamA" },
      { matchId: "m2", teamKey: "teamB" },
    ]);
  });
  it("没有进包的回合照常聚类，且不伪造 evidence", () => {
    const noEntry = fact({ targetSite: null, plant: null, siteEntries: noEntries() });
    const [cluster] = buildTacticalClusters([noEntry]);
    expect(cluster?.roundCount).toBe(1);
    expect(cluster?.entryEvidence).toEqual({ coveredRounds: 0, totalRounds: 1, coveragePercent: 0, routes: [] });
  });
  it("残局转点/C4 末端不改变主身份", () => {
    const direct = fact({ c4Route: { callouts: ["TRamp"], startRegion: "a", endRegion: "a", rotated: false, plantCallout: "BombsiteA" } });
    const rotated = fact({ targetSite: "b", c4Route: { callouts: ["TRamp", "Apartments"], startRegion: "a", endRegion: "b", rotated: true, plantCallout: "BombsiteB" } });
    expect(tacticalClusterKey(direct)).toBe(tacticalClusterKey(rotated));
  });
  it("进点 evidence 聚合路线分布与覆盖率", () => {
    const a1 = fact({ roundNumber: 1 });
    const a2 = fact({
      roundNumber: 2,
      siteEntries: { ...fact().siteEntries, a: { ...fact().siteEntries.a, entrants: 4, order: [entryOccurrence("a_ramp")] } },
    });
    const noEntry = fact({ roundNumber: 3, targetSite: null, plant: null, siteEntries: noEntries() });
    const [cluster] = buildTacticalClusters([a1, a2, noEntry]);
    expect(cluster?.entryEvidence.coveragePercent).toBe(66.7);
    expect(cluster?.entryEvidence.routes).toEqual([
      { site: "a", combo: "a_palace", roundCount: 1, percentOfCovered: 50 },
      { site: "a", combo: "a_ramp", roundCount: 1, percentOfCovered: 50 },
    ]);
  });
  it("簇聚合胜率", () => {
    const clusters = buildTacticalClusters([fact({ won: true }), fact({ won: false, roundNumber: 2, grenadeOccurrenceIds: ["g1"] })]);
    expect(clusters[0]!.roundCount).toBe(2);
    expect(clusters[0]!.winRatePercent).toBe(50);
  });
  it("plantRate 不跨 side 双算：同回合 T+CT 两条 fact 各归各簇，T 簇下包率=100%", () => {
    const tRow = fact({ side: "t", plant: { site: "a", tick: 1600, remainSec: 60 } });
    const ctRow = fact({ side: "ct", plant: { site: "a", tick: 1600, remainSec: 60 } });
    const clusters = buildTacticalClusters([tRow, ctRow]);
    const tCluster = clusters.find((c) => c.side === "t")!;
    expect(tCluster.roundCount).toBe(1);
    expect(tCluster.plantRatePercent).toBe(100); // 旧实现会算成 200
  });
  it("按 roundCount 降序", () => {
    const rows = [
      fact({ roundNumber: 1, executeBucket: "mid" }),
      fact({ roundNumber: 2, executeBucket: "mid" }),
      fact({ roundNumber: 3, openingPattern: { ...fact().openingPattern, positionGroupCounts: { b_apps: 5 } } }),
    ];
    const clusters = buildTacticalClusters(rows);
    expect(clusters[0]!.roundCount).toBeGreaterThanOrEqual(clusters[1]!.roundCount);
  });
});

describe("展示命名", () => {
  it("autoName：主名来自 opening intent 与默认位，不来自进点词典", () => {
    const name = autoName({
      mapName: "de_mirage",
      side: "t",
      economyEntry: "gun",
      openingIntent: fact().openingPattern,
      positionGroupCounts: { a_ramp: 3, top_mid: 2 },
    });
    expect(name).toBe("长枪局 · 3A-2中-0B · A1×3 / 匪口/中远×2");
    expect(name).not.toMatch(/A2|进点|走|夹A/);
  });
  it("autoName：CT 同样显示真实默认位结构", () => {
    expect(autoName({
      mapName: "de_mirage",
      side: "ct",
      economyEntry: "gun",
      openingIntent: fact().openingPattern,
      positionGroupCounts: { a_site: 3, connector: 2 },
    })).toBe("CT 长枪局 · 3A-2中-0B · A包×3 / 拱门×2");
  });
});
