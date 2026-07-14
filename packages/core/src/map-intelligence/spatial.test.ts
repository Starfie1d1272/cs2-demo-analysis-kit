import { describe, expect, it } from "vitest";
import { FLAG_ALIVE, type DemoPackage } from "@cs2dak/contract";
import { buildRoundSpatialFrames } from "./spatial.js";
import type { ReplayRoundContext, ReplayRoundTrack } from "../tactics/replay-round-context.js";

function track(playerIndex: number, x: number, y = 1, z = 1): ReplayRoundTrack {
  return { playerIndex, teamKey: "teamA", side: "ct", steamId64: String(playerIndex), x: [x], y: [y], z: [z], flags: [FLAG_ALIVE], place: [0], weapon: [0] };
}

describe("map-intelligence spatial frames", () => {
  it("drops NaN and Infinity coordinates without discarding valid teammates", () => {
    const round = { roundNumber: 1, freezeEndTick: 0, endTick: 64, teamASide: "ct", teamBSide: "t" } as DemoPackage["rounds"][number];
    const context: ReplayRoundContext = { round, startTick: 0, tickStep: 32, frameCount: 1, placeDict: [], weaponDict: [], tracks: [track(0, 1), track(1, Number.NaN), track(2, 1, Number.POSITIVE_INFINITY)] };
    const frames = buildRoundSpatialFrames(context, null, null);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.players.map((player) => player.playerIndex)).toEqual([0]);
    expect(frames[0]?.components).toEqual([[0]]);
  });

  it("emits no spatial frame when every alive coordinate is invalid", () => {
    const round = { roundNumber: 1, freezeEndTick: 0, endTick: 64, teamASide: "ct", teamBSide: "t" } as DemoPackage["rounds"][number];
    const context: ReplayRoundContext = { round, startTick: 0, tickStep: 32, frameCount: 1, placeDict: [], weaponDict: [], tracks: [track(0, Number.NaN), track(1, Number.NEGATIVE_INFINITY)] };
    expect(buildRoundSpatialFrames(context, null, null)).toEqual([]);
  });
});
