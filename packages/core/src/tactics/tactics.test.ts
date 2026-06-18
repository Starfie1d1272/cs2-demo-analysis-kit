import { describe, expect, it } from "vitest";
import {
  buildFormationTimeline,
  buildPlayerTacticalSegments,
  deriveOpeningPattern,
  deriveOpeningPressure,
  type TacticalFrameSample,
} from "./index.js";

const base = (partial: Partial<TacticalFrameSample>): TacticalFrameSample => ({
  tick: 0,
  playerIndex: 1,
  side: "t",
  alive: true,
  callout: "TRamp",
  ...partial,
});

describe("tactical spatial kernel", () => {
  it("将连续同 callout 样本合并，并在死亡、缺失、换区或采样断裂时截断", () => {
    const segments = buildPlayerTacticalSegments([
      base({ tick: 0 }),
      base({ tick: 64 }),
      base({ tick: 128, callout: "PalaceAlley" }),
      base({ tick: 192, alive: false, callout: null }),
      base({ tick: 256, callout: "TopofMid" }),
      base({ tick: 640, callout: "TopofMid" }),
    ], { mapName: "de_mirage", tickrate: 64, maxGapTicks: 128 });

    expect(segments.map((row) => [row.callout, row.startTick, row.endTick])).toEqual([
      ["TRamp", 0, 64],
      ["PalaceAlley", 128, 128],
      ["TopofMid", 256, 256],
      ["TopofMid", 640, 640],
    ]);
    expect(segments[0]).toMatchObject({ primaryRegion: "a", defaultAnchorId: "a_ramp" });
    expect(segments[2]).toMatchObject({ primaryRegion: "mid", defaultAnchorId: "top_mid" });
  });

  it("阵型快照对未知 callout 保持 unknown，不进行名称猜测", () => {
    const timeline = buildFormationTimeline([
      base({ tick: 64, playerIndex: 1, callout: "TRamp" }),
      base({ tick: 64, playerIndex: 2, callout: "NoSuchPlace" }),
      base({ tick: 64, playerIndex: 3, callout: null }),
    ], { mapName: "de_mirage" });

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.regionCounts).toEqual({ a: 1, b: 0, mid: 0, unknown: 2 });
    expect(timeline[0]?.defaultAnchorCounts).toEqual({ a_ramp: 1 });
  });

  it("开局粗签名只看区域结构，详细签名保留默认位", () => {
    const first = buildPlayerTacticalSegments([
      base({ tick: 0, playerIndex: 1, callout: "TRamp" }),
      base({ tick: 64, playerIndex: 1, callout: "TRamp" }),
      base({ tick: 0, playerIndex: 2, callout: "TopofMid" }),
      base({ tick: 64, playerIndex: 2, callout: "TopofMid" }),
      base({ tick: 0, playerIndex: 3, callout: "Apartments" }),
      base({ tick: 64, playerIndex: 3, callout: "Apartments" }),
    ], { mapName: "de_mirage", tickrate: 64 });
    const shifted = buildPlayerTacticalSegments([
      base({ tick: 0, playerIndex: 1, callout: "PalaceAlley" }),
      base({ tick: 64, playerIndex: 1, callout: "PalaceAlley" }),
      base({ tick: 0, playerIndex: 2, callout: "SideAlley" }),
      base({ tick: 64, playerIndex: 2, callout: "SideAlley" }),
      base({ tick: 0, playerIndex: 3, callout: "BackAlley" }),
      base({ tick: 64, playerIndex: 3, callout: "BackAlley" }),
    ], { mapName: "de_mirage", tickrate: 64 });

    const a = deriveOpeningPattern(first, { side: "t", startTick: 0, endTick: 128 });
    const b = deriveOpeningPattern(shifted, { side: "t", startTick: 0, endTick: 128 });
    expect(a.coarseSignature).toBe("T:1A-1MID-1B:balanced");
    expect(b.coarseSignature).toBe(a.coarseSignature);
    expect(a.detailedSignature).toContain("a_ramp:1");
    expect(a.evidence.every((row) => row.tick != null && row.playerIndices?.length === 1)).toBe(true);
  });

  it("开局代表位置优先采用已确认默认位，避免出生点长驻留淹没展开", () => {
    const segments = buildPlayerTacticalSegments([
      base({ tick: 0, callout: "TSpawn" }),
      base({ tick: 64, callout: "TSpawn" }),
      base({ tick: 128, callout: "TSpawn" }),
      base({ tick: 192, callout: "TRamp" }),
      base({ tick: 256, callout: "TRamp" }),
    ], { mapName: "de_mirage", tickrate: 64 });

    const opening = deriveOpeningPattern(segments, { side: "t", startTick: 0, endTick: 320 });
    expect(opening.regionCounts).toEqual({ a: 1, b: 0, mid: 0, unknown: 0 });
    expect(opening.defaultAnchorCounts).toEqual({ a_ramp: 1 });
  });

  it("CT 快速进入 T 默认位时标记深度前压，并保留中文 callout 证据", () => {
    const segments = buildPlayerTacticalSegments([
      base({ side: "ct", tick: 0, callout: "CTSpawn" }),
      base({ side: "ct", tick: 64, callout: "Outside" }),
      base({ side: "ct", tick: 128, callout: "Outside" }),
    ], { mapName: "de_ancient", tickrate: 64 });

    expect(deriveOpeningPressure(segments, {
      mapName: "de_ancient",
      side: "ct",
      startTick: 0,
      endTick: 192,
    })).toEqual([expect.objectContaining({
      playerIndex: 1,
      callout: "Outside",
      calloutLabel: "匪口",
      kind: "deep",
      opposingDefaultAnchorId: "t_outside",
    })]);
  });
});
