import { describe, expect, it } from "vitest";
import type { DemoPackage, PackageDamage, PackageKill, PackageShots } from "@cs2dak/contract";
import { buildMechanicsSignals, derivePlayerMechanics } from "./mechanics.js";

const A = "76561198000000001";
const AI = 0;

/** Build columnar PackageShots from a flat shot list. */
function buildShots(
  shots: Array<{ tick: number; playerIndex: number; vx?: number; vy?: number; weaponIndex?: number }>
): PackageShots {
  const groups = new Map<string, Array<{ tick: number; playerIndex: number; vx: number; vy: number; weaponIndex: number }>>();
  for (const s of shots) {
    const key = `1:${s.playerIndex}`;
    const arr = groups.get(key) ?? [];
    arr.push({ tick: s.tick, playerIndex: s.playerIndex, vx: s.vx ?? 0, vy: s.vy ?? 0, weaponIndex: s.weaponIndex ?? 0 });
    groups.set(key, arr);
  }
  const tracks: PackageShots["tracks"] = [];
  for (const items of groups.values()) {
    const deltas: number[] = [];
    let prev = 0;
    for (const { tick } of items) { deltas.push(tick - prev); prev = tick; }
    const n = items.length;
    tracks.push({
      roundNumber: 1,
      playerIndex: items[0]!.playerIndex,
      tick: deltas,
      weapon: items.map((s) => s.weaponIndex),
      vx: items.map((s) => s.vx),
      vy: items.map((s) => s.vy),
      vz: Array<number>(n).fill(0),
      yaw: Array<number>(n).fill(0),
      pitch: Array<number>(n).fill(0),
      x: Array<number>(n).fill(0),
      y: Array<number>(n).fill(0),
      z: Array<number>(n).fill(0),
    });
  }
  return { meta: { coordScale: 1, angleScale: 10 }, weaponDict: ["ak47", "flashbang", "knife"], tracks };
}

function damage(tick: number): PackageDamage {
  return {
    roundNumber: 1,
    tick,
    attackerIndex: AI,
    victimIndex: 1,
    weapon: "ak47",
    hitgroup: "head",
    healthDamage: 100,
    healthDamageRaw: 100,
    armorDamage: 0,
    victimHealthBefore: 100,
    victimArmorAfter: 100,
    attackerPosition: { x: 0, y: 0, z: 0 },
    victimPosition: { x: 100, y: 0, z: 0 }
  };
}

function kill(tick: number, weapon = "ak47"): PackageKill {
  return {
    roundNumber: 1,
    tick,
    killerIndex: AI,
    victimIndex: 1,
    assisterIndex: null,
    flashAssisterIndex: null,
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
      schemaVersion: "cs2-demo-format/3.0",
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
    players: [{ steamId64: A, name: "A", teamKey: "teamA" }, { steamId64: "76561198000000002", name: "B", teamKey: "teamB" }],
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
      shots: buildShots([
        { tick: 100, playerIndex: AI, weaponIndex: 0 }, // ak47
        { tick: 110, playerIndex: AI, weaponIndex: 0, vx: 20 },
        { tick: 120, playerIndex: AI, weaponIndex: 0, vx: 20 },
        { tick: 130, playerIndex: AI, weaponIndex: 0, vx: 20 },
        { tick: 140, playerIndex: AI, weaponIndex: 0, vx: 120 },
        { tick: 300, playerIndex: AI, weaponIndex: 0 },
        { tick: 310, playerIndex: AI, weaponIndex: 1 }, // flashbang
        { tick: 320, playerIndex: AI, weaponIndex: 2 }, // knife
      ]),
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
      sprayAccuracyPercent: 25,
      counterStrafeSuccessPercent: 83.3
    });
    expect(row.burstLengthBuckets).toEqual({ single: 1, short: 0, medium: 1, long: 0 });
    expect(row.oneTapRatePercent).toBe(0);
    expect(row.medianShotIntervalMs).toBeGreaterThan(0);
    expect(row.firingPatternRatio).toEqual({ tap: 50, burst: 50, spray: 0 });
    expect(buildMechanicsSignals(demo)).toMatchObject({
      version: "cs2-demo-analysis-kit/mechanics-signals-0.1",
      burstGapSeconds: 0.25,
      velocityWindowSeconds: 0.2
    });
    expect(derivePlayerMechanics(demo).map((item) => item.weapon)).toEqual(["ak47"]);
  });

  it("hides counter-strafe when exporter velocity is unavailable", () => {
    const demo = pkg({
      shots: buildShots([
        { tick: 100, playerIndex: AI },
        { tick: 300, playerIndex: AI },
      ]),
      damages: [damage(100)]
    });

    expect(derivePlayerMechanics(demo)[0].counterStrafeSuccessPercent).toBeNull();
  });

  it("sorts weapon rows by kill count before shot volume", () => {
    const demo = pkg({
      shots: buildShots([
        { tick: 100, playerIndex: AI, weaponIndex: 0 },
        { tick: 110, playerIndex: AI, weaponIndex: 0 },
        { tick: 120, playerIndex: AI, weaponIndex: 0 },
        { tick: 300, playerIndex: AI, weaponIndex: 0 }, // deagle(0) — same weaponIndex
      ]),
      kills: [kill(300, "deagle")]
    });

    const rows = derivePlayerMechanics(demo);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.weapon).toBe("ak47");
  });

  it("returns an empty list when shots are unavailable", () => {
    const noShots: DemoPackage = { ...pkg({}), shots: undefined as unknown as PackageShots };
    expect(derivePlayerMechanics(noShots)).toEqual([]);
  });
});
