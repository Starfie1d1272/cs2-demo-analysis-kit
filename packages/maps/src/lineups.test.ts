import { describe, expect, it } from "vitest";
import { buildLineupClusters } from "./lineups.js";

const throwAt = (roundNumber: number, tick: number, x: number, effectX = 500) => ({
  entryId: "d1",
  freezeEndTick: 0,
  roundNumber,
  grenade: "smoke",
  throwerIndex: 0,
  throwTick: tick,
  throwPosition: { x, y: 0, z: 0 },
  effectPosition: { x: effectX, y: 0, z: 0 }
});

describe("buildLineupClusters", () => {
  it("聚合相近投掷并保留按时间排序的投掷证据", () => {
    const clusters = buildLineupClusters({
      mapName: "de_mirage",
      grenades: [throwAt(3, 3000, 10), throwAt(1, 1000, 0), throwAt(5, 5000, 2000, 3000)],
      roundWinners: new Map([["d1:1", "teamA"], ["d1:3", "teamB"], ["d1:5", "teamA"]]),
      throwerTeam: () => "teamA"
    });
    expect(clusters).toHaveLength(2);
    const main = clusters[0]!;
    expect(main.count).toBe(2);
    expect(main.roundNumbers).toEqual([1, 3]);
    expect(main.throws).toEqual([
      { entryId: "d1", roundNumber: 1, tick: 1000, practicePose: null },
      { entryId: "d1", roundNumber: 3, tick: 3000, practicePose: null }
    ]);
    expect(main.winRatePercent).toBe(50);
  });

  it("无队伍/胜负信息时胜率为 null", () => {
    const clusters = buildLineupClusters({ mapName: "de_mirage", grenades: [throwAt(1, 1000, 0)] });
    expect(clusters[0]!.winRatePercent).toBeNull();
  });

  it("默认 strict 会区分相同落点但站位偏差大的投掷", () => {
    const clusters = buildLineupClusters({
      mapName: "de_mirage",
      grenades: [
        throwAt(1, 1000, 0, 500),
        throwAt(2, 2000, 180, 720)
      ]
    });

    expect(clusters).toHaveLength(2);
  });

  it("loose 只按落点聚合，用于统计大致打哪里", () => {
    const clusters = buildLineupClusters({
      mapName: "de_mirage",
      mode: "loose",
      grenades: [
        throwAt(1, 1000, 0, 500),
        throwAt(2, 2000, 180, 620)
      ]
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.count).toBe(2);
  });

  it("保留练习命令所需的玩家站位视角证据", () => {
    const practicePose = { position: { x: 10, y: 20, z: 30 }, yaw: 90, pitch: -12 };
    const clusters = buildLineupClusters({
      mapName: "de_mirage",
      grenades: [{ ...throwAt(1, 1000, 0, 500), practicePose }]
    });

    expect(clusters[0]!.throws[0]).toEqual({
      entryId: "d1",
      roundNumber: 1,
      tick: 1000,
      practicePose
    });
  });

  it("聚合 effectPosition 对应的落点 callout", () => {
    const clusters = buildLineupClusters({
      mapName: "de_mirage",
      grenades: [
        { ...throwAt(1, 1000, 0, 500), effectCallout: "BombsiteA", effectCalloutConfidence: 0.82, effectCalloutSamples: 12 },
        { ...throwAt(2, 2000, 10, 520), effectCallout: "BombsiteA", effectCalloutConfidence: 0.76, effectCalloutSamples: 8 },
        { ...throwAt(3, 3000, 20, 540), effectCallout: "Ramp", effectCalloutConfidence: 0.9, effectCalloutSamples: 20 },
      ]
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.effectCallout).toBe("BombsiteA");
    expect(clusters[0]!.effectCalloutConfidence).toBeCloseTo(0.79);
    expect(clusters[0]!.effectCalloutSamples).toBe(20);
  });
});
