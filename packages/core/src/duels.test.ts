import { describe, expect, it } from "vitest";
import type { DemoPackage, PackageDamage, PackageKill, PackageShots, Replay } from "@cs2dak/contract";
import { deriveDuels, deriveOpeningDuels } from "./duels.js";

const A = "76561198000000001";
const B = "76561198000000002";
const C = "76561198000000003";

// Player indices matching pkg().players order
const AI = 0;
const BI = 1;
const CI = 2;

function damage(row: { attackerIndex: number | null; victimIndex: number; tick: number } & Partial<PackageDamage>): PackageDamage {
  return {
    roundNumber: 1,
    weapon: "ak47",
    hitgroup: "chest",
    healthDamage: 40,
    healthDamageRaw: 40,
    armorDamage: 0,
    victimHealthBefore: 100,
    attackerPosition: { x: 0, y: 0, z: 0 },
    victimPosition: { x: 100, y: 0, z: 0 },
    ...row
  } as PackageDamage;
}

function kill(row: { killerIndex: number | null; victimIndex: number; tick: number } & Partial<PackageKill>): PackageKill {
  return {
    roundNumber: 1,
    assisterIndex: null,
    flashAssisterIndex: null,
    weapon: "ak47",
    killerActiveWeapon: "ak47",
    victimActiveWeapon: "ak47",
    headshot: false,
    flashAssist: false,
    tradeKill: false,
    tradeDeath: false,
    throughSmoke: false,
    noScope: false,
    penetratedObjects: 0,
    killerPosition: { x: 0, y: 0, z: 0 },
    victimPosition: { x: 100, y: 0, z: 0 },
    ...row
  } as PackageKill;
}

/** Build columnar PackageShots from a flat shot list. Ticks are delta-encoded per track. */
function buildShots(
  shots: Array<{ tick: number; playerIndex: number; roundNumber?: number }>
): PackageShots {
  const groups = new Map<string, Array<{ tick: number; playerIndex: number; roundNumber: number }>>();
  for (const s of shots) {
    const rn = s.roundNumber ?? 1;
    const key = `${rn}:${s.playerIndex}`;
    const arr = groups.get(key) ?? [];
    arr.push({ tick: s.tick, playerIndex: s.playerIndex, roundNumber: rn });
    groups.set(key, arr);
  }
  const tracks: PackageShots["tracks"] = [];
  for (const items of groups.values()) {
    const deltas: number[] = [];
    let prev = 0;
    for (const { tick } of items) { deltas.push(tick - prev); prev = tick; }
    const n = items.length;
    tracks.push({
      roundNumber: items[0]!.roundNumber,
      playerIndex: items[0]!.playerIndex,
      tick: deltas,
      weapon: Array<number>(n).fill(0),
      vx: Array<number>(n).fill(0),
      vy: Array<number>(n).fill(0),
      vz: Array<number>(n).fill(0),
      yaw: Array<number>(n).fill(0),
      pitch: Array<number>(n).fill(0),
      x: Array<number>(n).fill(0),
      y: Array<number>(n).fill(0),
      z: Array<number>(n).fill(0),
    });
  }
  return { meta: { coordScale: 1, angleScale: 10 }, weaponDict: ["ak47"], tracks };
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
    players: [
      { steamId64: A, name: "A", teamKey: "teamA" },
      { steamId64: B, name: "B", teamKey: "teamB" },
      { steamId64: C, name: "C", teamKey: "teamB" }
    ],
    rounds: [{
      roundNumber: 1,
      startTick: 1,
      freezeEndTick: 64,
      endTick: 4096,
      teamASide: "t",
      teamBSide: "ct",
      teamAScoreBefore: 0,
      teamBScoreBefore: 0,
      teamAEconomy: "full",
      teamBEconomy: "full",
      winnerTeamKey: "teamA",
      winnerSide: "t"
    }],
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

describe("deriveDuels", () => {
  it("classifies mutual damage inside the window as contested and computes burst-anchored ttk", () => {
    const demo = pkg({
      damages: [
        damage({ tick: 100, attackerIndex: AI, victimIndex: BI }),
        damage({ tick: 120, attackerIndex: BI, victimIndex: AI }),
        damage({ tick: 150, attackerIndex: AI, victimIndex: BI, victimHealthBefore: 40 })
      ],
      kills: [kill({ tick: 150, killerIndex: AI, victimIndex: BI })],
      // A fires at 96,108; B fires at 120 — B response tick 120 is in window [150-192,150]
      shots: buildShots([
        { tick: 96, playerIndex: AI },
        { tick: 108, playerIndex: AI },
        { tick: 120, playerIndex: BI }
      ])
    });

    const rows = deriveDuels(demo);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      killerSteamId64: A,
      victimSteamId64: B,
      classification: "contested",
      fullHealth: true,
      ttkMs: 844 // (150 - 96) / 64 * 1000 = 843.75 → 844
    });
  });

  it("separates outaimed from caught off guard using replay yaw when victim does not return fire", () => {
    const replay: Replay = {
      meta: { sampleRate: 8, tickrate: 64, coordScale: 1, angleScale: 10 },
      weaponDict: [],
      placeDict: [],
      rounds: [{
        roundNumber: 1,
        startTick: 64,
        tickStep: 8,
        frameCount: 1,
        projectiles: [],
        players: [
          {
            // B faces 180° (toward killer A at x=0, from x=100) → outaimed
            playerIndex: BI,
            x: [100], y: [0], z: [0],
            yaw: [1800], // 180° × angleScale 10
            pitch: [0], hp: [0], armor: [0], money: [0], equipValue: [0],
            place: [0], flash: [0], flags: [0], weapon: [-1]
          },
          {
            // C faces 90° (perpendicular to killer) → caught_off_guard
            playerIndex: CI,
            x: [100], y: [0], z: [0],
            yaw: [900], // 90° × angleScale 10
            pitch: [0], hp: [0], armor: [0], money: [0], equipValue: [0],
            place: [0], flash: [0], flags: [0], weapon: [-1]
          }
        ]
      }]
    };

    const demo = pkg({
      replay,
      damages: [
        damage({ tick: 64, attackerIndex: AI, victimIndex: BI }),
        damage({ tick: 64, attackerIndex: AI, victimIndex: CI })
      ],
      kills: [
        kill({ tick: 64, killerIndex: AI, victimIndex: BI }),
        kill({ tick: 64, killerIndex: AI, victimIndex: CI })
      ],
      shots: buildShots([{ tick: 64, playerIndex: AI }])
    });

    const rows = deriveDuels(demo);
    expect(rows.find((row) => row.victimSteamId64 === B)?.classification).toBe("outaimed");
    expect(rows.find((row) => row.victimSteamId64 === C)?.classification).toBe("caught_off_guard");
  });
});

describe("deriveOpeningDuels", () => {
  it("returns only the first duel per round", () => {
    const demo = pkg({
      damages: [
        damage({ tick: 100, attackerIndex: AI, victimIndex: BI }),
        damage({ tick: 200, attackerIndex: AI, victimIndex: CI })
      ],
      kills: [
        kill({ tick: 100, killerIndex: AI, victimIndex: BI }),
        kill({ tick: 200, killerIndex: AI, victimIndex: CI })
      ],
      shots: buildShots([
        { tick: 100, playerIndex: AI },
        { tick: 200, playerIndex: AI }
      ])
    });

    expect(deriveOpeningDuels(demo).map((row) => row.victimSteamId64)).toEqual([B]);
  });
});
