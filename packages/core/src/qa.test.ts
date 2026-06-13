import { describe, expect, it } from "vitest";
import type { DemoPackage, PackageDamage } from "@cs2dak/contract";
import { activeDamages } from "./utils.js";
import { buildQaReport } from "./qa.js";

function damage(tick: number): PackageDamage {
  return {
    roundNumber: 1,
    tick,
    attackerIndex: 0,
    victimIndex: 1,
    weapon: "ak47",
    hitgroup: "head",
    healthDamage: 12,
    healthDamageRaw: 12,
    armorDamage: 0,
    victimHealthBefore: 100,
    victimArmorAfter: 100,
    attackerPosition: { x: 0, y: 0, z: 0 },
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
    players: [
      { steamId64: "76561198000000001", name: "A", teamKey: "teamA" },
      { steamId64: "76561198000000002", name: "B", teamKey: "teamB" }
    ],
    rounds: [{
      roundNumber: 1,
      startTick: 1,
      freezeEndTick: 100,
      endTick: 500,
      winnerTeamKey: "teamA",
      winnerSide: "T",
      teamASide: "T",
      teamBSide: "CT",
      endReason: "target_bombed",
      durationSeconds: 10
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

describe("buildQaReport", () => {
  it("accepts pre-freeze damage rows but excludes them from active damage analytics", () => {
    const demo = pkg({ damages: [damage(50), damage(120)] });

    expect(buildQaReport(demo).issues).not.toContainEqual(expect.objectContaining({
      code: "damages.tick_outside_round"
    }));
    expect(activeDamages(demo).map((row) => row.tick)).toEqual([120]);
  });

  it("still reports damage rows before the round start", () => {
    const demo = pkg({ damages: [damage(0)] });

    expect(buildQaReport(demo).issues).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "damages.tick_outside_round"
    }));
  });
});
