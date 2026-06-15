import { describe, it, expect } from "vitest";
import {
  defaultsBasisKey,
  advancedBasisKey,
  tacticalClusterKey,
  buildTacticalClusters,
  suspectFake,
  autoName,
} from "./tactics.js";
import type { TacticalGrenadeOccurrence, TacticalRoundFact } from "./facts.js";

function grenade(p: Partial<TacticalGrenadeOccurrence> = {}): TacticalGrenadeOccurrence {
  return {
    id: "g",
    type: "smoke",
    throwTick: 800,
    effectTick: 900,
    throwPosition: { x: 0, y: 0, z: 0 },
    effectPosition: { x: 1, y: 1, z: 0 },
    throwCallout: "Ramp",
    effectCallout: "BombsiteA",
    effectCalloutSource: "exact",
    effectCalloutDistance: 0,
    confidence: 0.8,
    samples: 10,
    targetRegion: "a",
    ...p,
  };
}

function fact(p: Partial<TacticalRoundFact> = {}): TacticalRoundFact {
  return {
    matchId: "m",
    mapName: "de_mirage",
    side: "t",
    teamKey: "teamA",
    teamName: "Team A",
    opponentName: "Team B",
    economy: "full",
    won: true,
    roundNumber: 1,
    snapshots: [{ remainSec: 100, defaults: { a_ramp: 3, mid: 2 }, advanced: {}, positions: [] }],
    targetSite: "a",
    siteEntries: {
      a: { entrants: 4, firstEntryTick: 1000, secondEntryTick: 1100, firstEntryRemainSec: 90, executeRemainSec: 88, order: [] },
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
  it("key 含 map/side/经济/多切片/targetSite/节奏桶，不含道具", () => {
    expect(tacticalClusterKey(fact())).toBe(
      "de_mirage:t:full:a_ramp:3|mid:2:-:a:a:4:late"
    );
  });
  it("T key 使用前两切片 defaults/advanced、目标点和节奏", () => {
    expect(tacticalClusterKey(fact({
      snapshots: [
        { remainSec: 100, defaults: { a_ramp: 2, mid: 3 }, advanced: { Connector: 1 }, positions: [] },
        { remainSec: 85, defaults: { a_ramp: 1, mid: 2 }, advanced: { Jungle: 2 }, positions: [] },
      ],
      targetSite: "b",
      executeBucket: "fast",
    }))).toBe("de_mirage:t:full:a_ramp:2|mid:3+Connector:1:a_ramp:1|mid:2+Jungle:2:b:-:fast");
  });
  it("CT key 不使用 targetSite 或 executeBucket", () => {
    const a = tacticalClusterKey(fact({
      side: "ct",
      targetSite: "a",
      executeBucket: "rush",
    }));
    const b = tacticalClusterKey(fact({
      side: "ct",
      targetSite: "b",
      executeBucket: "late",
    }));
    expect(a).toBe(b);
    expect(a).toBe("de_mirage:ct:full:a_ramp:3|mid:2:-:-:-");
  });
  it("同站位不同节奏 → 两簇", () => {
    const rush = fact({ executeBucket: "rush", roundNumber: 2, won: false });
    const late = fact({ executeBucket: "late", roundNumber: 3 });
    expect(buildTacticalClusters([rush, late]).length).toBe(2);
  });
  it("簇聚合胜率", () => {
    const clusters = buildTacticalClusters([fact({ won: true }), fact({ won: false, roundNumber: 2, grenadeOccurrenceIds: ["g1"] })]);
    expect(clusters[0]!.roundCount).toBe(2);
    expect(clusters[0]!.winRatePercent).toBe(50);
  });
  it("CT 簇 targetSite / executeBucket 固定为 null（不带 T 方语义）", () => {
    const clusters = buildTacticalClusters([fact({ side: "ct", targetSite: "a", executeBucket: "rush" })]);
    expect(clusters[0]!.targetSite).toBeNull();
    expect(clusters[0]!.executeBucket).toBeNull();
  });
  it("plantRate 不跨 side 双算：同回合 T+CT 两条 fact 各归各簇，T 簇下包率=100%", () => {
    const tRow = fact({ side: "t", plant: { site: "a", tick: 1600, remainSec: 60 } });
    const ctRow = fact({ side: "ct", plant: { site: "a", tick: 1600, remainSec: 60 } });
    const clusters = buildTacticalClusters([tRow, ctRow]);
    const tCluster = clusters.find((c) => c.side === "t")!;
    expect(tCluster.roundCount).toBe(1);
    expect(tCluster.plantRatePercent).toBe(100); // 旧实现会算成 200
  });
  it("fakeRoundCount 簇级聚合，且 CT 簇恒为 0", () => {
    const fakeFact = fact({
      roundNumber: 5,
      targetSite: "b",
      siteEntries: {
        a: { entrants: 0, firstEntryTick: null, secondEntryTick: null, firstEntryRemainSec: null, executeRemainSec: null, order: [] },
        b: { entrants: 3, firstEntryTick: 1000, secondEntryTick: 1100, firstEntryRemainSec: 90, executeRemainSec: 88, order: [] },
      },
      grenades: [
        grenade({ id: "g1", type: "smoke", targetRegion: "a" }),
        grenade({ id: "g2", type: "flashbang", throwTick: 810, effectTick: 910, targetRegion: "a" }),
        grenade({ id: "g3", type: "hegrenade", throwTick: 820, effectTick: 920, targetRegion: "a" }),
      ],
    });
    const tClusters = buildTacticalClusters([fakeFact]);
    expect(tClusters[0]!.fakeRoundCount).toBe(1);
    const ctClusters = buildTacticalClusters([{ ...fakeFact, side: "ct" } as TacticalRoundFact]);
    expect(ctClusters[0]!.fakeRoundCount).toBe(0);
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
      siteEntries: {
        a: { entrants: 0, firstEntryTick: null, secondEntryTick: null, firstEntryRemainSec: null, executeRemainSec: null, order: [] },
        b: { entrants: 3, firstEntryTick: 1000, secondEntryTick: 1100, firstEntryRemainSec: 90, executeRemainSec: 88, order: [] },
      },
      grenades: [
        grenade({ id: "g1", type: "smoke" }),
        grenade({ id: "g2", type: "flashbang", throwTick: 810, effectTick: 910 }),
        grenade({ id: "g3", type: "hegrenade", throwTick: 820, effectTick: 920 }),
      ],
      targetSite: "b",
    });
    expect(suspectFake(f)).toEqual({ suspected: true, confidence: "medium", reason: "A 区疑似纯道具佯攻 · Experimental（道具3/烟1/进点0）" });
  });
  it("CT 方不判佯攻（佯攻是进攻方语义）", () => {
    const f = fact({
      side: "ct",
      targetSite: "b",
      siteEntries: {
        a: { entrants: 0, firstEntryTick: null, secondEntryTick: null, firstEntryRemainSec: null, executeRemainSec: null, order: [] },
        b: { entrants: 3, firstEntryTick: 1000, secondEntryTick: 1100, firstEntryRemainSec: 90, executeRemainSec: 88, order: [] },
      },
      grenades: [
        grenade({ id: "g1", type: "smoke" }),
        grenade({ id: "g2", type: "flashbang", throwTick: 810, effectTick: 910 }),
        grenade({ id: "g3", type: "hegrenade", throwTick: 820, effectTick: 920 }),
      ],
    });
    expect(suspectFake(f).suspected).toBe(false);
  });
  it("fake 判断要求至少 3 颗道具且至少 1 颗烟", () => {
    expect(suspectFake(fact({
      targetSite: "b",
      siteEntries: {
        a: { entrants: 0, firstEntryTick: null, secondEntryTick: null, firstEntryRemainSec: null, executeRemainSec: null, order: [] },
        b: { entrants: 3, firstEntryTick: 1000, secondEntryTick: 1100, firstEntryRemainSec: 90, executeRemainSec: 88, order: [] },
      },
      grenades: [
        grenade({ id: "g1", type: "flashbang" }),
        grenade({ id: "g2", type: "flashbang", throwTick: 810, effectTick: 910 }),
        grenade({ id: "g3", type: "hegrenade", throwTick: 820, effectTick: 920 }),
      ],
    })).suspected).toBe(false);
    expect(suspectFake(fact({
      targetSite: "b",
      siteEntries: {
        a: { entrants: 0, firstEntryTick: null, secondEntryTick: null, firstEntryRemainSec: null, executeRemainSec: null, order: [] },
        b: { entrants: 3, firstEntryTick: 1000, secondEntryTick: 1100, firstEntryRemainSec: 90, executeRemainSec: 88, order: [] },
      },
      grenades: [
        grenade({ id: "g1", type: "smoke" }),
        grenade({ id: "g2", type: "flashbang", throwTick: 810, effectTick: 910 }),
      ],
    })).suspected).toBe(false);
  });
  it("双点都出人不算 fake", () => {
    const f = fact({
      siteEntries: {
        a: { entrants: 1, firstEntryTick: 900, secondEntryTick: null, firstEntryRemainSec: 94, executeRemainSec: null, order: [] },
        b: { entrants: 3, firstEntryTick: 1000, secondEntryTick: 1100, firstEntryRemainSec: 90, executeRemainSec: 88, order: [] },
      },
      grenades: [
        grenade({ id: "g1", type: "smoke" }),
        grenade({ id: "g2", type: "flashbang", throwTick: 810, effectTick: 910 }),
        grenade({ id: "g3", type: "hegrenade", throwTick: 820, effectTick: 920 }),
      ],
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
      executeBucket: "rush",
      targetSite: "a",
    });
    // de_mirage T side: a_ramp → "坡道口", mid → "中路"
    expect(name).toMatch(/提速/);
    expect(name).toMatch(/A/);
  });
});
