import { describe, expect, it } from "vitest";
import type { DemoPackage } from "@cs2dak/contract";
import { loadSpatialAssets } from "./annotate.js";
import { buildOfficialMapControl } from "./mapcontrol.js";

const TICKS = [150, 214, 278, 342];

function pos(tick: number, steamId64: string, teamKey: string, place: string) {
  return { roundNumber: 1, tick, steamId64, teamKey, side: teamKey === "teamA" ? "t" : "ct", alive: true, position: { x: 0, y: 0, z: 0 }, lastPlaceName: place };
}

/** T1 独推 a_long（LongDoors→ARamp），T2 留 TSpawn，C1 守 BombsiteA（同线施压），C2 离线。 */
function makePkg(over: { kills?: unknown[] } = {}): DemoPackage {
  const t1 = ["LongDoors", "LongA", "ARamp", "ARamp"];
  const positions1s = TICKS.flatMap((tick, i) => [
    pos(tick, "T1", "teamA", t1[i]!),
    pos(tick, "T2", "teamA", "TSpawn"),
    pos(tick, "C1", "teamB", "BombsiteA"),
    pos(tick, "C2", "teamB", "CTSpawn"),
  ]);
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
    positions1s,
  } as unknown as DemoPackage;
}

const untradedDeath = [{ roundNumber: 1, tick: 410, victimSteamId64: "T1", victimTeamKey: "teamA", killerSteamId64: "C1", killerTeamKey: "teamB", tradeDeath: false }];

describe("buildOfficialMapControl", () => {
  it("accumulates activeSoloPressureSeconds for a lone route pusher with enemy on the lane", () => {
    const mc = buildOfficialMapControl(makePkg(), loadSpatialAssets("de_dust2"));
    expect(mc.get("T1")!.activeSoloPressureSeconds).toBe(4); // 4 个 1Hz 样本
    expect(mc.get("T2")?.activeSoloPressureSeconds ?? 0).toBe(0); // 始终在 TSpawn，未上线
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
    const death = [{ roundNumber: 1, tick: 410, victimSteamId64: "T2", victimTeamKey: "teamA", killerSteamId64: "C1", killerTeamKey: "teamB", tradeDeath: false }];
    const mc = buildOfficialMapControl(makePkg({ kills: death }), loadSpatialAssets("de_dust2"));
    expect(mc.get("T2")?.strategicIsolationDeaths ?? 0).toBe(0);
  });

  it("returns an empty map without route assets", () => {
    const mc = buildOfficialMapControl(makePkg(), loadSpatialAssets("de_unknown"));
    expect(mc.size).toBe(0);
  });
});
