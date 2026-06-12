import { describe, expect, it } from "vitest";
import { buildLineupClusters } from "./lineups.js";

const throwAt = (roundNumber: number, tick: number, x: number, effectX = 500) => ({
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
      roundWinners: new Map([[1, "teamA"], [3, "teamB"], [5, "teamA"]]),
      throwerTeam: () => "teamA"
    });
    expect(clusters).toHaveLength(2);
    const main = clusters[0]!;
    expect(main.count).toBe(2);
    expect(main.roundNumbers).toEqual([1, 3]);
    expect(main.throws).toEqual([
      { roundNumber: 1, tick: 1000 },
      { roundNumber: 3, tick: 3000 }
    ]);
    expect(main.winRatePercent).toBe(50);
  });

  it("无队伍/胜负信息时胜率为 null", () => {
    const clusters = buildLineupClusters({ mapName: "de_mirage", grenades: [throwAt(1, 1000, 0)] });
    expect(clusters[0]!.winRatePercent).toBeNull();
  });
});
