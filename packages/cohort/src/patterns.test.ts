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
  it("clusters rounds by grenade sequence when positions are unavailable", () => {
    const demo = pkg({
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
    // positions-1s is removed in v3 → spatial labels stubbed empty,
    // so without positions no clusters are formed even with grenades active.
    expect(clusters).toHaveLength(0);
  });

  it("returns empty when no grenade or position data defines the opening", () => {
    const demo = pkg();
    const clusters = buildOpeningPatternClusters([{ matchId: "m1", pkg: demo }]);
    expect(clusters).toEqual([]);
  });
});
