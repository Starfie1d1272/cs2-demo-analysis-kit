import { describe, expect, it } from "vitest";
import type { DemoPackage } from "@cs2dak/contract";
import { inferRoundPhases, phaseAtTick } from "./phase.js";
import { isOfficialScoringPhase, OFFICIAL_EXCLUDED_PHASES } from "./types.js";

/** 最小 DemoPackage：phase 推导只读 match/players/rounds/bombs/kills/positions1s。 */
function makePkg(over: Partial<{
  bombs: unknown[];
  kills: unknown[];
  positions1s: unknown[];
}> = {}): DemoPackage {
  return {
    match: { mapName: "de_dust2", tickrate: 64 },
    players: [
      { steamId64: "T1", teamKey: "teamA" },
      { steamId64: "T2", teamKey: "teamA" },
      { steamId64: "C1", teamKey: "teamB" },
      { steamId64: "C2", teamKey: "teamB" },
    ],
    rounds: [
      { roundNumber: 1, startTick: 1, freezeEndTick: 100, endTick: 1000, teamASide: "t", teamBSide: "ct" },
    ],
    bombs: over.bombs ?? [],
    kills: over.kills ?? [],
    positions1s: over.positions1s ?? [],
  } as unknown as DemoPackage;
}

function pos(tick: number, steamId64: string, lastPlaceName: string) {
  return { roundNumber: 1, tick, steamId64, lastPlaceName };
}

describe("inferRoundPhases / phaseAtTick", () => {
  it("marks the freeze window then default", () => {
    const m = inferRoundPhases(makePkg()).get(1)!;
    expect(phaseAtTick(m, 1)).toBe("freeze");
    expect(phaseAtTick(m, 99)).toBe("freeze");
    expect(phaseAtTick(m, 100)).toBe("default");
    expect(phaseAtTick(m, 500)).toBe("default");
  });

  it("enters postPlant from the plant tick", () => {
    const m = inferRoundPhases(makePkg({
      bombs: [{ roundNumber: 1, tick: 300, type: "planted", actorTeamKey: "teamA" }],
    })).get(1)!;
    expect(m.plantTick).toBe(300);
    expect(phaseAtTick(m, 299)).not.toBe("postPlant");
    expect(phaseAtTick(m, 300)).toBe("postPlant");
    expect(phaseAtTick(m, 800)).toBe("postPlant");
  });

  it("enters clutch when a side drops to one alive", () => {
    // teamB starts at 2; one kill on teamB → 1 alive → clutch
    const m = inferRoundPhases(makePkg({
      kills: [{ roundNumber: 1, tick: 250, victimTeamKey: "teamB" }],
    })).get(1)!;
    expect(m.clutchStartTick).toBe(250);
    expect(phaseAtTick(m, 249)).toBe("default");
    expect(phaseAtTick(m, 250)).toBe("clutch");
  });

  it("clutch overrides postPlant in the same window", () => {
    const m = inferRoundPhases(makePkg({
      bombs: [{ roundNumber: 1, tick: 300, type: "planted", actorTeamKey: "teamA" }],
      kills: [{ roundNumber: 1, tick: 350, victimTeamKey: "teamA" }],
    })).get(1)!;
    expect(phaseAtTick(m, 320)).toBe("postPlant");
    expect(phaseAtTick(m, 360)).toBe("clutch");
  });

  it("detects take when a T advances beyond spawn (routeIndex >= 1)", () => {
    const m = inferRoundPhases(makePkg({
      positions1s: [pos(150, "T1", "OutsideLong"), pos(150, "T2", "TSpawn")],
    })).get(1)!;
    expect(m.hasPositions).toBe(true);
    expect(m.hasRoutes).toBe(true);
    expect(m.takeTick).toBe(150);
    expect(phaseAtTick(m, 150)).toBe("take");
  });

  it("detects execute when two T near the site entry (routeIndex >= len-2)", () => {
    // a_long: ARamp=4, BombsiteA=5 → both >= len-2 (=4)
    const m = inferRoundPhases(makePkg({
      positions1s: [pos(140, "T1", "OutsideLong"), pos(260, "T1", "ARamp"), pos(260, "T2", "BombsiteA")],
    })).get(1)!;
    expect(m.takeTick).toBe(140);
    expect(m.executeTick).toBe(260);
    expect(phaseAtTick(m, 200)).toBe("take");
    expect(phaseAtTick(m, 260)).toBe("execute");
  });

  it("degrades take/execute to null without positions", () => {
    const m = inferRoundPhases(makePkg()).get(1)!;
    expect(m.hasPositions).toBe(false);
    expect(m.takeTick).toBeNull();
    expect(m.executeTick).toBeNull();
  });

  it("excludes freeze/save/exit from official scoring", () => {
    expect(isOfficialScoringPhase("freeze")).toBe(false);
    expect(isOfficialScoringPhase("save")).toBe(false);
    expect(isOfficialScoringPhase("exit")).toBe(false);
    expect(isOfficialScoringPhase("take")).toBe(true);
    expect(isOfficialScoringPhase("postPlant")).toBe(true);
    expect(OFFICIAL_EXCLUDED_PHASES.has("clutch")).toBe(false);
  });
});
