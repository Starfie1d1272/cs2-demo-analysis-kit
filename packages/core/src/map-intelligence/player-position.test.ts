import { describe, expect, it } from "vitest";
import type { TeamSpatialFrame } from "./spatial.js";
import { detectDelayedConvergences } from "./player-position.js";

function frame(tick: number, components: number[][]): TeamSpatialFrame {
  return {
    tick, teamKey: "teamA", side: "t", components,
    players: components.flat().map((playerIndex) => ({ playerIndex, track: {} as never, point: { x: playerIndex, y: 0, z: 0 }, callout: null, navAreaId: null })),
  };
}

describe("delayed convergence", () => {
  it("requires prior isolation, a pre-existing stable group and persistent convergence", () => {
    const frames = [
      frame(0, [[1, 2, 3], [0]]), frame(1, [[1, 2, 3], [0]]),
      frame(2, [[0, 1, 2, 3]]), frame(3, [[0, 1, 2, 3]]),
    ];
    expect(detectDelayedConvergences(frames, 0, 1, 1)).toEqual([{ tick: 2, priorIsolationSeconds: 2, joinedComponentSize: 4, persistenceSeconds: 2 }]);
  });

  it("rejects a topology change caused by a teammate death", () => {
    const frames = [
      frame(0, [[1, 2, 3], [0]]), frame(1, [[1, 2, 3], [0]]),
      frame(2, [[0, 1, 2]]), frame(3, [[0, 1, 2]]),
    ];
    expect(detectDelayedConvergences(frames, 0, 1, 1)).toEqual([]);
  });
});
