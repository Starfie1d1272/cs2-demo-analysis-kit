import { describe, expect, it } from "vitest";
import { FLAG_ALIVE, type DemoPackage } from "@cs2dak/contract";
import { extractAwpRoundFacts } from "./awp.js";
import type { ReplayRoundContext, ReplayRoundTrack } from "../tactics/replay-round-context.js";

describe("extractAwpRoundFacts", () => {
  it("stops active AWP time after death and ignores invalid trajectory frames", () => {
    const track: ReplayRoundTrack = {
      playerIndex: 0, teamKey: "teamA", side: "ct", steamId64: "76561198000000001",
      x: [1, 1, 1, Number.NaN], y: [1, 1, 1, 1], z: [1, 1, 1, 1],
      flags: [FLAG_ALIVE, FLAG_ALIVE, 0, FLAG_ALIVE], place: [0, 0, 0, 0], weapon: [0, 0, 0, 0],
    };
    const round = { roundNumber: 1, freezeEndTick: 0, endTick: 128 } as DemoPackage["rounds"][number];
    const context: ReplayRoundContext = { round, startTick: 0, tickStep: 32, frameCount: 4, placeDict: [], weaponDict: ["awp"], tracks: [track] };
    const pkg = {
      match: { tickrate: 64 }, playerEconomies: [], shots: undefined, kills: [],
    } as unknown as DemoPackage;
    expect(extractAwpRoundFacts(pkg, context, track).activeAwpSeconds).toBe(1);
  });
});
