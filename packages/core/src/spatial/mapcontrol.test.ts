import { describe, expect, it } from "vitest";
import type { DemoPackage, Replay } from "@cs2dak/contract";
import { loadSpatialAssets } from "./annotate.js";
import { buildOfficialMapControl } from "./mapcontrol.js";

const TICKS = [150, 214, 278, 342];

function deltaArr(values: number[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const v of values) { out.push(v - prev); prev = v; }
  return out;
}

function replayTracks(t1Places: string[], idxByPlace: Map<string, number>) {
  return [
    {
      playerIndex: 0,
      x: deltaArr([0, 0, 0, 0]), y: deltaArr([0, 0, 0, 0]), z: deltaArr([0, 0, 0, 0]),
      yaw: deltaArr([0, 0, 0, 0]), pitch: deltaArr([0, 0, 0, 0]),
      hp: [100, 100, 100, 100], armor: [100, 100, 100, 100],
      money: [800, 800, 800, 800], equipValue: [800, 800, 800, 800],
      weapon: [-1, -1, -1, -1],
      place: t1Places.map((p) => idxByPlace.get(p) ?? -1),
      flash: [0, 0, 0, 0], flags: [1, 1, 1, 1],
    },
    {
      playerIndex: 1,
      x: deltaArr([0, 0, 0, 0]), y: deltaArr([0, 0, 0, 0]), z: deltaArr([0, 0, 0, 0]),
      yaw: deltaArr([0, 0, 0, 0]), pitch: deltaArr([0, 0, 0, 0]),
      hp: [100, 100, 100, 100], armor: [100, 100, 100, 100],
      money: [800, 800, 800, 800], equipValue: [800, 800, 800, 800],
      weapon: [-1, -1, -1, -1],
      place: [idxByPlace.get("TSpawn")!, idxByPlace.get("TSpawn")!, idxByPlace.get("TSpawn")!, idxByPlace.get("TSpawn")!],
      flash: [0, 0, 0, 0], flags: [1, 1, 1, 1],
    },
    {
      playerIndex: 2,
      x: deltaArr([0, 0, 0, 0]), y: deltaArr([0, 0, 0, 0]), z: deltaArr([0, 0, 0, 0]),
      yaw: deltaArr([0, 0, 0, 0]), pitch: deltaArr([0, 0, 0, 0]),
      hp: [100, 100, 100, 100], armor: [100, 100, 100, 100],
      money: [800, 800, 800, 800], equipValue: [800, 800, 800, 800],
      weapon: [-1, -1, -1, -1],
      place: [idxByPlace.get("BombsiteA")!, idxByPlace.get("BombsiteA")!, idxByPlace.get("BombsiteA")!, idxByPlace.get("BombsiteA")!],
      flash: [0, 0, 0, 0], flags: [1, 1, 1, 1],
    },
    {
      playerIndex: 3,
      x: deltaArr([0, 0, 0, 0]), y: deltaArr([0, 0, 0, 0]), z: deltaArr([0, 0, 0, 0]),
      yaw: deltaArr([0, 0, 0, 0]), pitch: deltaArr([0, 0, 0, 0]),
      hp: [100, 100, 100, 100], armor: [100, 100, 100, 100],
      money: [800, 800, 800, 800], equipValue: [800, 800, 800, 800],
      weapon: [-1, -1, -1, -1],
      place: [idxByPlace.get("CTSpawn")!, idxByPlace.get("CTSpawn")!, idxByPlace.get("CTSpawn")!, idxByPlace.get("CTSpawn")!],
      flash: [0, 0, 0, 0], flags: [1, 1, 1, 1],
    },
  ];
}

/** T1 独推 a_long（LongDoors→ARamp），T2 留 TSpawn，C1 守 BombsiteA（同线施压），C2 离线。 */
function makePkg(over: { kills?: unknown[] } = {}): DemoPackage {
  const t1 = ["LongDoors", "LongA", "ARamp", "ARamp"];
  const allPlaces = [...new Set([...t1, "TSpawn", "BombsiteA", "CTSpawn"])];
  const idxByPlace = new Map(allPlaces.map((p, i) => [p, i]));
  return {
    match: { mapName: "de_dust2", tickrate: 64 },
    players: [
      { steamId64: "T1", teamKey: "teamA" },
      { steamId64: "T2", teamKey: "teamA" },
      { steamId64: "C1", teamKey: "teamB" },
      { steamId64: "C2", teamKey: "teamB" },
    ],
    rounds: [{ roundNumber: 1, startTick: 1, freezeEndTick: 100, endTick: 2000, teamASide: "t", teamBSide: "ct" }],
    bombs: [],
    kills: over.kills ?? [],
    replay: {
      meta: { sampleRate: 1, tickrate: 64, coordScale: 1, angleScale: 10 },
      weaponDict: [],
      placeDict: allPlaces,
      rounds: [{
        roundNumber: 1,
        startTick: 150,
        tickStep: 64,
        frameCount: 4,
        players: replayTracks(t1, idxByPlace) as unknown as Replay["rounds"][number]["players"],
        projectiles: [],
      }],
    },
  } as unknown as DemoPackage;
}

const untradedDeath = [{ roundNumber: 1, tick: 410, killerIndex: 2, victimIndex: 0, victimSteamId64: "T1", victimTeamKey: "teamA", killerSteamId64: "C1", killerTeamKey: "teamB", tradeDeath: false, weapon: "ak47", headshot: false }];

describe("buildOfficialMapControl", () => {
  it("accumulates activeSoloPressureSeconds for a lone route pusher with enemy on the lane", () => {
    const mc = buildOfficialMapControl(makePkg(), loadSpatialAssets("de_dust2"));
    expect(mc.get("T1")!.activeSoloPressureSeconds).toBe(4); // 4 个 1Hz 样本
    expect(mc.get("T2")?.activeSoloPressureSeconds ?? 0).toBe(0); // 始终在 TSpawn，未上线
  });

  it("accumulates denial for the defending anchor and firstControl for the pusher", () => {
    const mc = buildOfficialMapControl(makePkg(), loadSpatialAssets("de_dust2"));
    // C1 守 BombsiteA（a_long 末端）、T1 同线施压、无 plant → CT 防守 → C1 计 denial
    expect(mc.get("C1")!.sidePhaseAwareDenialSeconds).toBeGreaterThan(0);
    // T1 推进到 a_long 关键段（LongA idx3 ≥ ceil(6×0.4)=3）→ firstControl 一次
    expect(mc.get("T1")!.firstMeaningfulControlEvents).toBe(1);
    // T1 是进攻方，非防守 → 无 denial
    expect(mc.get("T1")!.sidePhaseAwareDenialSeconds).toBe(0);
  });

  it("awards strategicIsolationDeaths credit for an untraded death after sustained solo pressure", () => {
    const mc = buildOfficialMapControl(makePkg({ kills: untradedDeath }), loadSpatialAssets("de_dust2"));
    // credit = clamp(0.25 + 0.10×4, 0, 1) = 0.65
    expect(mc.get("T1")!.strategicIsolationDeaths).toBeCloseTo(0.65, 3);
  });

  it("gives no credit when the death was traded", () => {
    const traded = [{ ...untradedDeath[0], tradeDeath: true }];
    const mc = buildOfficialMapControl(makePkg({ kills: traded }), loadSpatialAssets("de_dust2"));
    expect(mc.get("T1")?.strategicIsolationDeaths ?? 0).toBe(0);
  });

  it("gives no credit when there was no prior solo pressure (TSpawn camper)", () => {
    const death = [{ roundNumber: 1, tick: 410, killerIndex: 2, victimIndex: 1, victimSteamId64: "T2", victimTeamKey: "teamA", killerSteamId64: "C1", killerTeamKey: "teamB", tradeDeath: false, weapon: "ak47", headshot: false }];
    const mc = buildOfficialMapControl(makePkg({ kills: death }), loadSpatialAssets("de_dust2"));
    expect(mc.get("T2")?.strategicIsolationDeaths ?? 0).toBe(0);
  });

  it("returns an empty map without route assets", () => {
    const mc = buildOfficialMapControl(makePkg(), loadSpatialAssets("de_unknown"));
    expect(mc.size).toBe(0);
  });
});
