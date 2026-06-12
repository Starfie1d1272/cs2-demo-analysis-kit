import { describe, expect, it } from "vitest";
import type { DemoPackage, PackagePosition } from "@cs2dak/contract";
import { buildOpeningPatternClusters } from "./patterns.js";

function position(roundNumber: number, tick: number, steamId64: string, lastPlaceName: string): PackagePosition {
  return {
    roundNumber,
    tick,
    steamId64,
    teamKey: steamId64.endsWith("1") ? "teamA" : "teamB",
    side: steamId64.endsWith("1") ? "t" : "ct",
    alive: true,
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    health: 100,
    armor: 100,
    money: 800,
    activeWeapon: "ak47",
    flashDurationRemaining: 0,
    hasBomb: false,
    hasDefuseKit: false,
    lastPlaceName
  };
}

function pkg(): DemoPackage {
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
    positions1s: [
      position(1, 64 + 15 * 64, "76561198000000001", "Middle"),
      position(1, 64 + 15 * 64, "76561198000000002", "Apartments")
    ]
  } as DemoPackage;
}

describe("buildOpeningPatternClusters", () => {
  it("clusters rounds by map, side, window, and callout distribution", () => {
    const clusters = buildOpeningPatternClusters([{ matchId: "m1", pkg: pkg() }], { windowSeconds: 15 });
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({ mapName: "de_mirage", windowSeconds: 15, roundCount: 1 });
    expect(clusters.map((cluster) => cluster.side).sort()).toEqual(["ct", "t"]);
  });
});
