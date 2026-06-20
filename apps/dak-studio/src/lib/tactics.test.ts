import { describe, it, expect } from "vitest";
import {
  defaultsBasisKey,
  advancedBasisKey,
  tacticalClusterKey,
  openingPatternKey,
  buildTacticalClusters,
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
    won: true,
    roundNumber: 1,
    openingPressure: [],
    openingPattern: {
      side: "t",
      regionCounts: { a: 3, b: 0, mid: 2, unknown: 0 },
      defaultAnchorCounts: { a_ramp: 3, top_mid: 2 },
      spread: "split",
      coarseSignature: "T:3A-2MID-0B:split",
      detailedSignature: "T:a_ramp:3|top_mid:2",
      evidence: [],
    },
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
  it("key 使用开局双层签名 + 稳定入口结构，不使用经济或时间桶", () => {
    expect(tacticalClusterKey(fact())).toBe(
      "de_mirage:t:T:3A-2MID-0B:split:T:a_ramp:3|top_mid:2:a:a:4"
    );
  });
  it("开局模式 key 与最终打点、经济和节奏正交", () => {
    const a = fact({ targetSite: "a", economy: "full", executeBucket: "rush" });
    const b = fact({ targetSite: "b", economy: "eco", executeBucket: "late" });
    expect(openingPatternKey(a)).toBe(openingPatternKey(b));
    expect(openingPatternKey(a)).toBe("de_mirage:t:T:3A-2MID-0B:split:T:a_ramp:3|top_mid:2");
  });
  it("CT key 不使用 targetSite 或 executeBucket", () => {
    const a = tacticalClusterKey(fact({
      side: "ct",
      targetSite: "a",
    }));
    const b = tacticalClusterKey(fact({
      side: "ct",
      targetSite: "b",
      executeBucket: "late",
    }));
    expect(a).toBe(b);
    expect(a).toBe("de_mirage:ct:T:3A-2MID-0B:split:T:a_ramp:3|top_mid:2");
  });
  it("同站位同入口不同节奏仍为同一事实簇", () => {
    const rush = fact({ executeBucket: "rush", roundNumber: 2, won: false });
    const late = fact({ executeBucket: "late", roundNumber: 3 });
    const clusters = buildTacticalClusters([rush, late]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.roundCount).toBe(2);
  });
  it("簇聚合胜率", () => {
    const clusters = buildTacticalClusters([fact({ won: true }), fact({ won: false, roundNumber: 2, grenadeOccurrenceIds: ["g1"] })]);
    expect(clusters[0]!.roundCount).toBe(2);
    expect(clusters[0]!.winRatePercent).toBe(50);
  });
  it("CT 簇 targetSite 固定为 null（不带 T 方进点语义）", () => {
    const clusters = buildTacticalClusters([fact({ side: "ct", targetSite: "a", executeBucket: "rush" })]);
    expect(clusters[0]!.targetSite).toBeNull();
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
      fact({ roundNumber: 3, targetSite: "b", executeBucket: "rush" }),
    ];
    const clusters = buildTacticalClusters(rows);
    expect(clusters[0]!.roundCount).toBeGreaterThanOrEqual(clusters[1]!.roundCount);
  });
});

describe("展示命名", () => {
  it("autoName：只拼接目标事实与 anchor，不把时间桶命名成战术", () => {
    const name = autoName({
      mapName: "de_mirage",
      side: "t",
      defaultsBasis: "a_ramp:3|mid:1",
      targetSite: "a",
    });
    // de_mirage T side: a_ramp → "坡道口", mid → "中路"
    expect(name).toContain("A 进点");
    expect(name).not.toMatch(/提速|速爆|后打/);
  });
  it("autoName：无默认位时不泄漏序列化占位符", () => {
    expect(autoName({
      mapName: "de_mirage",
      side: "t",
      defaultsBasis: "-",
      targetSite: null,
    })).toBe("进攻开局");
  });
});
