import { describe, it, expect } from "vitest";
import {
  defaultsBasisKey,
  advancedBasisKey,
  tacticalClusterKey,
  buildTacticalClusters,
  suspectFake,
  autoName,
} from "./tactics.js";
import type { TacticalRoundFact } from "./facts.js";

function fact(p: Partial<TacticalRoundFact> = {}): TacticalRoundFact {
  return {
    matchId: "m",
    mapName: "de_mirage",
    side: "t",
    teamKey: "teamA",
    economy: "full",
    won: true,
    roundNumber: 1,
    snapshots: [{ remainSec: 100, defaults: { a_ramp: 3, mid: 2 }, advanced: {} }],
    targetSite: "a",
    siteInvestment: {
      a: { entryCount: 4, grenadeCount: 3, deepestAnchor: "a_ramp", planted: true },
      b: { entryCount: 0, grenadeCount: 0, deepestAnchor: null, planted: false },
    },
    entryAnchors: ["a_palace", "a_ramp"],
    executeRemainSec: 30,
    executeBucket: "late",
    firstKillForTeam: true,
    grenadeIds: [],
    ...p,
  } as TacticalRoundFact;
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
});

describe("tactical 聚类", () => {
  it("key 含 map/side/targetSite/首切片defaults/entryAnchors/节奏桶，不含道具", () => {
    expect(tacticalClusterKey(fact())).toBe(
      "de_mirage:t:a:a_ramp:3|mid:2:a_palace,a_ramp:late"
    );
  });
  it("同站位不同节奏 → 两簇", () => {
    const rush = fact({ executeBucket: "rush", roundNumber: 2, won: false });
    const late = fact({ executeBucket: "late", roundNumber: 3 });
    expect(buildTacticalClusters([rush, late]).length).toBe(2);
  });
  it("簇聚合胜率", () => {
    const clusters = buildTacticalClusters([fact({ won: true }), fact({ won: false, roundNumber: 2, grenadeIds: ["g1"] })]);
    expect(clusters[0]!.roundCount).toBe(2);
    expect(clusters[0]!.winRatePercent).toBe(50);
  });
  it("按 roundCount 降序", () => {
    const rows = [
      fact({ roundNumber: 1, executeBucket: "mid" }),
      fact({ roundNumber: 2, executeBucket: "mid" }),
      fact({ roundNumber: 3, executeBucket: "rush" }),
    ];
    const clusters = buildTacticalClusters(rows);
    expect(clusters[0]!.roundCount).toBeGreaterThanOrEqual(clusters[1]!.roundCount);
  });
});

describe("判断层 v0", () => {
  it("某 site 道具≥2 且进点 0 人 → 疑似道具佯攻", () => {
    const f = fact({
      siteInvestment: {
        a: { entryCount: 0, grenadeCount: 2, deepestAnchor: null, planted: false },
        b: { entryCount: 3, grenadeCount: 1, deepestAnchor: "b_apps", planted: true },
      },
      targetSite: "b",
    });
    expect(suspectFake(f)).toEqual({ suspected: true, reason: "A 区道具佯攻（道具2/进点0）" });
  });
  it("双点都出人不算 fake", () => {
    const f = fact({
      siteInvestment: {
        a: { entryCount: 1, grenadeCount: 1, deepestAnchor: "a_ramp", planted: false },
        b: { entryCount: 3, grenadeCount: 1, deepestAnchor: "b_apps", planted: true },
      },
      targetSite: "b",
    });
    expect(suspectFake(f).suspected).toBe(false);
  });
  it("targetSite 为 null 时不判断 fake", () => {
    expect(suspectFake(fact({ targetSite: null })).suspected).toBe(false);
  });
  it("autoName：模板拼接 anchor 名 + 节奏（de_mirage T side）", () => {
    const name = autoName({
      mapName: "de_mirage",
      side: "t",
      defaultsBasis: "a_ramp:3|mid:1",
      entryAnchors: ["a_ramp"],
      executeBucket: "rush",
      targetSite: "a",
    });
    // de_mirage T side: a_ramp → "坡道口", mid → "中路"
    expect(name).toMatch(/提速/);
    expect(name).toMatch(/A/);
  });
});
