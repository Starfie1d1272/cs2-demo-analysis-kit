import { describe, expect, it } from "vitest";
import type { DemoPackage, Replay } from "@cs2dak/contract";
import type { MapZones } from "@cs2dak/maps";
import { annotatePositions, groupSamplesByRoundTick, loadSpatialAssets, type SpatialAssets } from "./annotate.js";

function deltaArr(values: number[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const v of values) { out.push(v - prev); prev = v; }
  return out;
}

/** Build a replay round with one (or more) player tracks at a single tick. */
function replayRound(
  tick: number,
  tracks: { playerIdx: number; x: number; y: number; z: number; placeIdx: number }[],
): Replay["rounds"][number] {
  return {
    roundNumber: 1,
    startTick: tick,
    tickStep: 8,
    frameCount: 1,
    players: tracks.map((t) => ({
      playerIndex: t.playerIdx,
      x: deltaArr([t.x]), y: deltaArr([t.y]), z: deltaArr([t.z]),
      yaw: deltaArr([0]), pitch: deltaArr([0]),
      hp: [100], armor: [100], money: [800], equipValue: [800],
      place: [t.placeIdx], flash: [0],
      flags: [1],
      weapon: [-1],
      grenades: [[]],
    })),
    projectiles: [],
  };
}

function pkgWith(mapName: string, rows: { place: string; x: number; y: number; z: number }[]): DemoPackage {
  const placeDict = [...new Set(rows.map((r) => r.place))];
  const placeMap = new Map(placeDict.map((p, i) => [p, i]));
  const tracks = rows.map((r, i) => ({
    playerIdx: Math.min(i, 1), // player 0 or 1
    x: r.x, y: r.y, z: r.z,
    placeIdx: placeMap.get(r.place) ?? -1,
  }));
  return {
    match: { mapName, tickrate: 64 },
    players: [
      { steamId64: "T1", teamKey: "teamA" },
      rows.length > 1 ? { steamId64: "T2", teamKey: "teamA" } : { steamId64: "T2", teamKey: "teamA" },
    ],
    rounds: [{ roundNumber: 1, startTick: 1, freezeEndTick: 100, endTick: 2000, teamASide: "t", teamBSide: "ct" }],
    replay: {
      meta: { sampleRate: 8, tickrate: 64, coordScale: 1, angleScale: 10 },
      weaponDict: [],
      placeDict,
      rounds: [replayRound(120, tracks)],
    },
  } as unknown as DemoPackage;
}

/** Create a package with no replay data (simulates unobservable positions). */
function pkgWithoutReplay(): DemoPackage {
  return {
    match: { mapName: "de_dust2", tickrate: 64 },
    players: [{ steamId64: "T1", teamKey: "teamA" }],
    rounds: [{ roundNumber: 1, startTick: 1, freezeEndTick: 100, endTick: 2000, teamASide: "t", teamBSide: "ct" }],
  } as unknown as DemoPackage;
}

describe("loadSpatialAssets", () => {
  it("reports availability per asset for an active-duty map", () => {
    const assets = loadSpatialAssets("de_dust2");
    expect(assets.available.routes).toBe(true);
    expect(assets.available.nav).toBe(true);
    expect(assets.available.visibility).toBe(false); // no .tri passed
  });

  it("reports everything missing for an unknown map", () => {
    const assets = loadSpatialAssets("de_unknown");
    expect(assets.available.routes).toBe(false);
    expect(assets.available.nav).toBe(false);
  });
});

describe("annotatePositions", () => {
  it("attaches callout and position from replay when nav is available", () => {
    const assets = loadSpatialAssets("de_dust2");
    const samples = annotatePositions(pkgWith("de_dust2", [{ place: "LongA", x: 760, y: 1660, z: 0 }]), assets);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.callout).toBe("LongA");
    expect(samples[0]!.position).toEqual({ x: 760, y: 1660, z: 0 });
  });

  it("leaves navAreaId null when nav is unavailable", () => {
    const assets = loadSpatialAssets("de_unknown");
    const samples = annotatePositions(pkgWith("de_unknown", [{ place: "Somewhere", x: 0, y: 0, z: 0 }]), assets);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.navAreaId).toBeNull();
    expect(samples[0]!.callout).toBe("Somewhere");
  });

  it("returns an empty array without positions", () => {
    const assets = loadSpatialAssets("de_dust2");
    expect(annotatePositions(pkgWithoutReplay(), assets)).toEqual([]);
  });

  it("groups samples by round then tick", () => {
    const assets = loadSpatialAssets("de_dust2");
    const samples = annotatePositions(
      pkgWith("de_dust2", [{ place: "LongA", x: 760, y: 1660, z: 0 }, { place: "TSpawn", x: -500, y: -850, z: 96 }]),
      assets,
    );
    const grouped = groupSamplesByRoundTick(samples);
    expect(grouped.get(1)!.get(120)!).toHaveLength(2);
  });

  it("populates zoneId/zoneRole/zoneBombsite via zoneAt when zones are available", () => {
    const TEST_ZONES: MapZones = {
      mapName: "de_test",
      version: "t",
      zones: [{ id: "a_site", name: "A", role: "site", bombsite: "a", polygon: [[0, 0], [100, 0], [100, 100], [0, 100]] }],
    };
    const assets: SpatialAssets = {
      mapName: "de_test", routes: null, zones: TEST_ZONES, nav: null, visibility: null,
      available: { routes: false, zones: true, nav: false, visibility: false },
    };
    const samples = annotatePositions(pkgWith("de_test", [{ place: "A", x: 50, y: 50, z: 0 }]), assets);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.zoneId).toBe("a_site");
    expect(samples[0]!.zoneRole).toBe("site");
    expect(samples[0]!.zoneBombsite).toBe("a");
  });
});
