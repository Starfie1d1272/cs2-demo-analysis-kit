import { describe, expect, it } from "vitest";
import type { DemoPackage } from "@cs2dak/contract";
import { buildOpeningPatternClusters } from "./patterns.js";

function pkg(overrides?: Partial<DemoPackage>): DemoPackage {
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
      freezeEndTick: 64,
      endTick: 4096,
      teamASide: "t",
      teamBSide: "ct",
      teamAScoreBefore: 0,
      teamBScoreBefore: 0,
      teamAEconomy: "full",
      teamBEconomy: "full",
      winnerTeamKey: "teamA",
      winnerSide: "t",
      endReason: "t_win"
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

describe("buildOpeningPatternClusters", () => {
  it("clusters rounds by replay callout distribution and grenade sequence", () => {
    const places = Array.from({ length: 16 }, () => 0);
    const demo = pkg({
      replay: {
        meta: { tickrate: 64, sampleRate: 1, coordScale: 1, angleScale: 10 },
        placeDict: ["TSpawn", "LongDoors"],
        weaponDict: [],
        rounds: [{
          roundNumber: 1,
          startTick: 64,
          tickStep: 64,
          frameCount: 16,
          projectiles: [],
          players: [
            {
              playerIndex: 0,
              x: [0], y: [0], z: [0], yaw: [0], pitch: [0],
              hp: Array.from({ length: 16 }, () => 100),
              armor: Array.from({ length: 16 }, () => 100),
              money: Array.from({ length: 16 }, () => 800),
              equipValue: Array.from({ length: 16 }, () => 800),
              place: places,
              flash: Array.from({ length: 16 }, () => 0),
              flags: Array.from({ length: 16 }, () => 1),
              weapon: Array.from({ length: 16 }, () => -1)
            },
            {
              playerIndex: 1,
              x: [0], y: [0], z: [0], yaw: [0], pitch: [0],
              hp: Array.from({ length: 16 }, () => 100),
              armor: Array.from({ length: 16 }, () => 100),
              money: Array.from({ length: 16 }, () => 800),
              equipValue: Array.from({ length: 16 }, () => 800),
              place: Array.from({ length: 16 }, () => 1),
              flash: Array.from({ length: 16 }, () => 0),
              flags: Array.from({ length: 16 }, () => 1),
              weapon: Array.from({ length: 16 }, () => -1)
            }
          ]
        }]
      },
      grenades: [
        {
          roundNumber: 1, grenadeId: null,
          throwTick: 70, effectTick: 80, destroyTick: null,
          grenade: "smoke",
          throwerIndex: 0, throwPosition: { x: 0, y: 0, z: 0 },
          effectPosition: { x: 0, y: 0, z: 0 }
        }
      ]
    });
    const clusters = buildOpeningPatternClusters([{ matchId: "m1", pkg: demo }], { windowSeconds: 15 });
    expect(clusters).toHaveLength(2);
    const tCluster = clusters.find((cluster) => cluster.side === "t");
    expect(tCluster?.basis).toBe("TSpawn:1");
    expect(tCluster?.grenadeSequence).toEqual(["smoke"]);
    expect(tCluster?.roundCount).toBe(1);
  });

  it("returns empty when no grenade or position data defines the opening", () => {
    const demo = pkg();
    const clusters = buildOpeningPatternClusters([{ matchId: "m1", pkg: demo }]);
    expect(clusters).toEqual([]);
  });
});
