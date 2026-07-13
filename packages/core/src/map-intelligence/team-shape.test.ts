import { describe, expect, it } from "vitest";
import type { ReplayRoundContext } from "../tactics/replay-round-context.js";
import type { TeamSpatialFrame } from "./spatial.js";
import { extractTeamShapeRoundFacts } from "./team-shape.js";

const round = { roundNumber: 1, freezeEndTick: 0, endTick: 3000, teamASide: "t", teamBSide: "ct" } as const;
const context = { round, startTick: 0, tickStep: 64, frameCount: 48, placeDict: [], weaponDict: [], tracks: [] } as unknown as ReplayRoundContext;

function frame(tick: number, components: number[][]): TeamSpatialFrame {
  const indices = components.flat();
  return {
    tick, teamKey: "teamA", side: "t", components,
    players: indices.map((playerIndex) => ({ playerIndex, track: {} as never, point: { x: playerIndex, y: 0, z: 0 }, callout: null, navAreaId: null })),
  };
}

describe("team-shape compact windows", () => {
  it.each([
    [[[0, 1, 2, 3, 4]]],
    [[[0, 1, 2, 3], [4]]],
    [[[0, 1, 2], [3, 4]]],
    [[[0, 1, 2], [3], [4]]],
    [[[0, 1], [2, 3], [4]]],
  ])("retains the %s partition with exact component membership", (components) => {
    const result = extractTeamShapeRoundFacts(
      { match: { mapName: "de_ancient", tickrate: 64 } }, "m1", context, round,
      [frame(0, components), frame(64, components)], null, false,
    )[0]!;
    expect(result.windows[0]?.partition).toBe(components.map((group) => group.length).sort((a, b) => b - a).join("+"));
    expect(result.windows[0]?.componentPlayerIndices).toEqual(components);
  });

  it("keeps late rotation in full-round windows but outside opening responsibility", () => {
    const opening = [[0, 1, 2, 3], [4]];
    const late = [[0, 1, 2], [3, 4]];
    const result = extractTeamShapeRoundFacts(
      { match: { mapName: "de_ancient", tickrate: 64 } }, "m1", context, round,
      [frame(0, opening), frame(64, opening), frame(1408, late), frame(1472, late)], null, false,
    )[0]!;
    expect(result.openingWindows.map((window) => window.partition)).toEqual(["4+1"]);
    expect(result.windows.map((window) => window.partition)).toEqual(["4+1", "3+2"]);
  });
});
