import { describe, expect, it } from "vitest";
import type { DemoPackage, PackageDamage, PackageKill, PackageShot } from "@cs2dak/contract";
import { derivePlayerMechanics } from "./mechanics.js";

const A = "76561198000000001";

function shot(tick: number, velocity = 0, weapon = "ak47"): PackageShot {
  return {
    roundNumber: 1,
    tick,
    steamId64: A,
    teamKey: "teamA",
    side: "t",
    weapon,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: velocity, y: 0, z: 0 },
    yaw: 0,
    pitch: 0
  };
}

function damage(tick: number): PackageDamage {
  return {
    roundNumber: 1,
    tick,
    attackerSteamId64: A,
    victimSteamId64: "76561198000000002",
    attackerTeamKey: "teamA",
    victimTeamKey: "teamB",
    attackerSide: "t",
    victimSide: "ct",
    weapon: "ak47",
    hitgroup: "head",
    healthDamage: 100,
    healthDamageRaw: 100,
    armorDamage: 0,
    victimHealthBefore: 100,
    victimHealthAfter: 0,
    victimArmorBefore: 100,
    victimArmorAfter: 100,
    attackerPosition: { x: 0, y: 0, z: 0 },
    victimPosition: { x: 100, y: 0, z: 0 }
  };
}

function kill(tick: number, weapon = "ak47"): PackageKill {
  return {
    roundNumber: 1,
    tick,
    killerSteamId64: A,
    victimSteamId64: "76561198000000002",
    assisterSteamId64: null,
    flashAssisterSteamId64: null,
    killerTeamKey: "teamA",
    victimTeamKey: "teamB",
    killerSide: "t",
    victimSide: "ct",
    weapon,
    killerActiveWeapon: weapon,
    victimActiveWeapon: null,
    headshot: false,
    flashAssist: false,
    tradeKill: false,
    tradeDeath: false,
    throughSmoke: false,
    noScope: false,
    penetratedObjects: 0,
    killerPosition: { x: 0, y: 0, z: 0 },
    victimPosition: { x: 100, y: 0, z: 0 }
  };
}

function pkg(overrides: Partial<DemoPackage>): DemoPackage {
  return {
    manifest: {
      schemaVersion: "cs2-demo-format/2.0",
      exporter: { name: "test", version: "0" },
      parser: { name: "test", version: "0" },
      demo: { hash: null, sourceFileName: null },
      mapName: "de_mirage",
      tickrate: 64,
      exportedAt: "2026-01-01T00:00:00Z",
      files: {
        match: "match.json",
        players: "players.json",
        rounds: "rounds.json",
        playerStats: "player-stats.json",
        playerEconomies: "player-economies.json",
        kills: "kills.json",
        damages: "damages.json",
        blinds: "blinds.json",
        bombs: "bombs.json",
        grenades: "grenades.json",
        clutches: "clutches.json"
      }
    },
    match: {
      mapName: "de_mirage",
      tickrate: 64,
      durationSeconds: 120,
      serverName: null,
      source: "test",
      teamA: { teamKey: "teamA", name: "A", score: 1 },
      teamB: { teamKey: "teamB", name: "B", score: 0 }
    },
    players: [{ steamId64: A, name: "A", teamKey: "teamA" }],
    rounds: [],
    playerEconomies: [],
    playerStats: [],
    kills: [],
    damages: [],
    blinds: [],
    bombs: [],
    grenades: [],
    clutches: [],
    ...overrides
  } as DemoPackage;
}

describe("derivePlayerMechanics", () => {
  it("splits bursts and computes first-shot, spray, rhythm, and counter-strafe metrics", () => {
    const demo = pkg({
      shots: [
        shot(100, 20, "weapon_ak47"),
        shot(110, 20),
        shot(120, 20),
        shot(130, 20),
        shot(140, 120),
        shot(300, 0),
        shot(310, 0, "weapon_flashbang"),
        shot(320, 0, "weapon_knife_m9_bayonet")
      ],
      damages: [damage(100), damage(140)],
      kills: [kill(140)]
    });

    const row = derivePlayerMechanics(demo)[0];
    expect(row).toMatchObject({
      steamId64: A,
      weapon: "ak47",
      killCount: 1,
      burstCount: 2,
      shotCount: 6,
      firstShotAccuracyPercent: 50,
      sprayAccuracyPercent: 50,
      counterStrafeSuccessPercent: 83.3
    });
    expect(row.burstLengthBuckets).toEqual({ single: 1, short: 0, medium: 1, long: 0 });
    expect(derivePlayerMechanics(demo).map((item) => item.weapon)).toEqual(["ak47"]);
  });

  it("hides counter-strafe when exporter velocity is unavailable", () => {
    const demo = pkg({
      shots: [shot(100, 0), shot(300, 0)],
      damages: [damage(100)]
    });

    expect(derivePlayerMechanics(demo)[0].counterStrafeSuccessPercent).toBeNull();
  });

  it("sorts weapon rows by kill count before shot volume", () => {
    const demo = pkg({
      shots: [
        shot(100, 20, "ak47"),
        shot(110, 20, "ak47"),
        shot(120, 20, "ak47"),
        shot(300, 20, "deagle")
      ],
      kills: [kill(300, "deagle")]
    });

    expect(derivePlayerMechanics(demo).map((row) => row.weapon)).toEqual(["deagle", "ak47"]);
  });

  it("returns an empty list when shots are unavailable", () => {
    expect(derivePlayerMechanics(pkg({ shots: undefined }))).toEqual([]);
  });
});
