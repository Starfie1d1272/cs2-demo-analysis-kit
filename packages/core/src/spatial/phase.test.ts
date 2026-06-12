import { describe, expect, it } from "vitest";
import type { DemoPackage, Replay } from "@cs2dak/contract";
import { inferRoundPhases, phaseAtTick } from "./phase.js";
import { isOfficialScoringPhase, OFFICIAL_EXCLUDED_PHASES } from "./types.js";

function deltaArr(values: number[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const v of values) { out.push(v - prev); prev = v; }
  return out;
}

/** Build a single-frame replay round with the given player tracks. */
function replayFrame(
  roundNumber: number,
  tick: number,
  tracks: { playerIdx: number; placeIdx: number }[],
): Replay["rounds"][number] {
  return {
    roundNumber,
    startTick: tick,
    tickStep: 1,
    frameCount: 1,
    players: tracks.map((t) => ({
      playerIndex: t.playerIdx,
      x: deltaArr([0]), y: deltaArr([0]), z: deltaArr([0]),
      yaw: deltaArr([0]), pitch: deltaArr([0]),
      hp: [100], armor: [100], money: [800], equipValue: [800],
      place: [t.placeIdx], flash: [0], flags: [1], weapon: [-1],
    })),
    projectiles: [],
  };
}

/** Build a two-frame replay round for take+execute detection at different ticks. */
function replayTwoFrames(
  roundNumber: number,
  frame1: { tick: number; tracks: { playerIdx: number; placeIdx: number }[] },
  frame2: { tick: number; tracks: { playerIdx: number; placeIdx: number }[] },
): Replay["rounds"][number] {
  const tickStep = frame2.tick - frame1.tick;
  const nPlayers = Math.max(frame1.tracks.length, frame2.tracks.length);
  const players = [];
  for (let i = 0; i < nPlayers; i++) {
    const t1 = frame1.tracks.find((t) => t.playerIdx === i);
    const t2 = frame2.tracks.find((t) => t.playerIdx === i);
    const place1 = t1?.placeIdx ?? -1;
    const place2 = t2?.placeIdx ?? -1;
    players.push({
      playerIndex: i,
      x: deltaArr([0, 0]), y: deltaArr([0, 0]), z: deltaArr([0, 0]),
      yaw: deltaArr([0, 0]), pitch: deltaArr([0, 0]),
      hp: [100, 100], armor: [100, 100], money: [800, 800], equipValue: [800, 800],
      place: [place1, place2], flash: [0, 0], flags: [1, 1], weapon: [-1, -1],
    });
  }
  return { roundNumber, startTick: frame1.tick, tickStep, frameCount: 2, players, projectiles: [] };
}

/** 最小 DemoPackage：phase 推导只读 match/players/rounds/bombs/kills。 */
function makePkg(over: Partial<{
  bombs: unknown[];
  kills: unknown[];
  positions1s: unknown[];
  replay: unknown;
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
    replay: over.replay,
  } as unknown as DemoPackage;
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
      kills: [{ roundNumber: 1, tick: 250, victimTeamKey: "teamB", victimIndex: 2, killerIndex: 0, weapon: "ak47", headshot: false }],
    })).get(1)!;
    expect(m.clutchStartTick).toBe(250);
    expect(phaseAtTick(m, 249)).toBe("default");
    expect(phaseAtTick(m, 250)).toBe("clutch");
  });

  it("clutch overrides postPlant in the same window", () => {
    const m = inferRoundPhases(makePkg({
      bombs: [{ roundNumber: 1, tick: 300, type: "planted", actorTeamKey: "teamA" }],
      kills: [{ roundNumber: 1, tick: 350, victimTeamKey: "teamA", victimIndex: 0, killerIndex: 2, weapon: "ak47", headshot: false }],
    })).get(1)!;
    expect(phaseAtTick(m, 320)).toBe("postPlant");
    expect(phaseAtTick(m, 360)).toBe("clutch");
  });

  it("detects take when a T advances beyond spawn (routeIndex >= 1)", () => {
    const placeDict = ["TSpawn", "OutsideLong"];
    const replay = {
      meta: { sampleRate: 1, tickrate: 64, coordScale: 1, angleScale: 10 },
      weaponDict: [], placeDict,
      rounds: [replayFrame(1, 150, [
        { playerIdx: 0, placeIdx: 1 }, // T1 → OutsideLong
        { playerIdx: 1, placeIdx: 0 }, // T2 → TSpawn
      ])],
    };
    const m = inferRoundPhases(makePkg({ replay })).get(1)!;
    expect(m.hasPositions).toBe(true);
    expect(m.hasRoutes).toBe(true);
    expect(m.takeTick).toBe(150);
    expect(phaseAtTick(m, 150)).toBe("take");
  });

  it("detects execute when two T near the site entry (routeIndex >= len-2)", () => {
    // a_long: ARamp=4, BombsiteA=5 → both >= len-2 (=4)
    const placeDict = ["TSpawn", "OutsideLong", "ARamp", "BombsiteA"];
    const replay = {
      meta: { sampleRate: 1, tickrate: 64, coordScale: 1, angleScale: 10 },
      weaponDict: [], placeDict,
      rounds: [replayTwoFrames(1,
        { tick: 140, tracks: [{ playerIdx: 0, placeIdx: 1 }] },   // T1 → OutsideLong
        { tick: 260, tracks: [{ playerIdx: 0, placeIdx: 2 }, { playerIdx: 1, placeIdx: 3 }] }, // T1→ARamp, T2→BombsiteA
      )],
    };
    const m = inferRoundPhases(makePkg({ replay })).get(1)!;
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
