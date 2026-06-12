import { describe, expect, it } from "vitest";
import type { DemoPackage, PackageDamage, PackageKill, PackageShot } from "@cs2dak/contract";
import { duelInsightsModelSchema } from "@cs2dak/contract";
import { buildDuelInsights } from "./duel.js";

const A = "76561198000000001";
const B = "76561198000000002";

function shot(tick: number): PackageShot {
  return {
    roundNumber: 1,
    tick,
    steamId64: A,
    teamKey: "teamA",
    side: "t",
    weapon: "ak47",
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0
  };
}

function damage(tick: number): PackageDamage {
  return {
    roundNumber: 1,
    tick,
    attackerSteamId64: A,
    victimSteamId64: B,
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

function kill(tick: number): PackageKill {
  return {
    roundNumber: 1,
    tick,
    killerSteamId64: A,
    victimSteamId64: B,
    assisterSteamId64: null,
    flashAssisterSteamId64: null,
    killerTeamKey: "teamA",
    victimTeamKey: "teamB",
    killerSide: "t",
    victimSide: "ct",
    weapon: "ak47",
    killerActiveWeapon: "ak47",
    victimActiveWeapon: "ak47",
    headshot: true,
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

function pkg(shots?: PackageShot[]): DemoPackage {
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
      teamA: { teamKey: "teamA", name: "A Team", score: 1 },
      teamB: { teamKey: "teamB", name: "B Team", score: 0 }
    },
    players: [
      { steamId64: A, name: "Alpha", teamKey: "teamA" },
      { steamId64: B, name: "Bravo", teamKey: "teamB" }
    ],
    rounds: [],
    playerEconomies: [],
    playerStats: [],
    kills: [kill(120)],
    damages: [damage(120)],
    blinds: [],
    bombs: [],
    grenades: [],
    clutches: [],
    shots
  } as DemoPackage;
}

describe("buildDuelInsights", () => {
  it("builds a schema-valid model with raw values and current-range percentile labels", () => {
    const model = buildDuelInsights([{ matchId: "m1", pkg: pkg([shot(100), shot(120)]) }]);
    expect(() => duelInsightsModelSchema.parse(model)).not.toThrow();
    expect(model.duelRows[0].killerName).toBe("Alpha");
    expect(model.mechanicsRows[0].metrics.some((metric) => metric.percentileLabel?.includes("当前范围"))).toBe(true);
    expect(JSON.stringify(model)).not.toContain("letterGrade");
  });

  it("hides unavailable mechanics metrics when shots are missing", () => {
    const model = buildDuelInsights([{ matchId: "m1", pkg: pkg(undefined) }]);
    expect(model.duelRows).toHaveLength(1);
    expect(model.mechanicsRows).toHaveLength(0);
  });
});
