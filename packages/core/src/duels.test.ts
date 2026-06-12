import { describe, expect, it } from "vitest";
import type { DemoPackage, PackageDamage, PackageKill, PackageShot, Replay } from "@cs2dak/contract";
import { deriveDuels, deriveOpeningDuels } from "./duels.js";

const A = "76561198000000001";
const B = "76561198000000002";
const C = "76561198000000003";

function damage(row: Partial<PackageDamage> & Pick<PackageDamage, "tick" | "attackerSteamId64" | "victimSteamId64">): PackageDamage {
  return {
    roundNumber: 1,
    attackerTeamKey: row.attackerSteamId64 === A ? "teamA" : "teamB",
    victimTeamKey: row.victimSteamId64 === A ? "teamA" : "teamB",
    attackerSide: row.attackerSteamId64 === A ? "t" : "ct",
    victimSide: row.victimSteamId64 === A ? "t" : "ct",
    weapon: "ak47",
    hitgroup: "chest",
    healthDamage: 40,
    healthDamageRaw: 40,
    armorDamage: 0,
    victimHealthBefore: 100,
    victimHealthAfter: 60,
    victimArmorBefore: 100,
    victimArmorAfter: 100,
    attackerPosition: { x: 0, y: 0, z: 0 },
    victimPosition: { x: 100, y: 0, z: 0 },
    ...row
  };
}

function kill(row: Partial<PackageKill> & Pick<PackageKill, "tick" | "killerSteamId64" | "victimSteamId64">): PackageKill {
  return {
    roundNumber: 1,
    assisterSteamId64: null,
    flashAssisterSteamId64: null,
    killerTeamKey: row.killerSteamId64 === A ? "teamA" : "teamB",
    victimTeamKey: row.victimSteamId64 === A ? "teamA" : "teamB",
    killerSide: row.killerSteamId64 === A ? "t" : "ct",
    victimSide: row.victimSteamId64 === A ? "t" : "ct",
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
  };
}

function shot(row: Partial<PackageShot> & Pick<PackageShot, "tick" | "steamId64">): PackageShot {
  return {
    roundNumber: 1,
    teamKey: row.steamId64 === A ? "teamA" : "teamB",
    side: row.steamId64 === A ? "t" : "ct",
    weapon: "ak47",
    position: row.steamId64 === A ? { x: 0, y: 0, z: 0 } : { x: 100, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: row.steamId64 === A ? 0 : 180,
    pitch: 0,
    ...row
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
        damage({ tick: 100, attackerSteamId64: A, victimSteamId64: B }),
        damage({ tick: 120, attackerSteamId64: B, victimSteamId64: A }),
        damage({ tick: 150, attackerSteamId64: A, victimSteamId64: B, victimHealthBefore: 40, victimHealthAfter: 0 })
      ],
      kills: [kill({ tick: 150, killerSteamId64: A, victimSteamId64: B })],
      shots: [shot({ tick: 96, steamId64: A }), shot({ tick: 108, steamId64: A }), shot({ tick: 120, steamId64: B })]
    });

    const rows = deriveDuels(demo);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      killerSteamId64: A,
      victimSteamId64: B,
      classification: "contested",
      fullHealth: true,
      ttkMs: 844
    });
  });

  it("separates outaimed from caught off guard using replay yaw when victim does not return fire", () => {
    const replay: Replay = {
      meta: { sampleRate: 8, tickrate: 64, coordScale: 1 },
      weaponDict: [],
      rounds: [{
        roundNumber: 1,
        startTick: 64,
        tickStep: 8,
        frameCount: 1,
        players: [
          { steamId64: B, teamKey: "teamB", side: "ct", x: [100], y: [0], z: [0], yaw: [180], hp: [0], weapon: [-1], flags: [0] },
          { steamId64: C, teamKey: "teamB", side: "ct", x: [100], y: [0], z: [0], yaw: [90], hp: [0], weapon: [-1], flags: [0] }
        ]
      }]
    };
    const demo = pkg({
      replay,
      damages: [
        damage({ tick: 64, attackerSteamId64: A, victimSteamId64: B }),
        damage({ tick: 64, attackerSteamId64: A, victimSteamId64: C })
      ],
      kills: [
        kill({ tick: 64, killerSteamId64: A, victimSteamId64: B }),
        kill({ tick: 64, killerSteamId64: A, victimSteamId64: C })
      ],
      shots: [shot({ tick: 64, steamId64: A })]
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
        damage({ tick: 100, attackerSteamId64: A, victimSteamId64: B }),
        damage({ tick: 200, attackerSteamId64: A, victimSteamId64: C })
      ],
      kills: [
        kill({ tick: 100, killerSteamId64: A, victimSteamId64: B }),
        kill({ tick: 200, killerSteamId64: A, victimSteamId64: C })
      ],
      shots: [shot({ tick: 100, steamId64: A }), shot({ tick: 200, steamId64: A })]
    });

    expect(deriveOpeningDuels(demo).map((row) => row.victimSteamId64)).toEqual([B]);
  });
});
