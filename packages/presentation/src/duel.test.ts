import { describe, expect, it } from "vitest";
import type { DemoPackage, PackageDamage, PackageKill, PackageShots } from "@cs2dak/contract";
import { duelInsightsModelSchema } from "@cs2dak/contract";
import { buildDuelInsights } from "./duel.js";

const A = "76561198000000001";
const B = "76561198000000002";

// Player indices matching pkg().players order
const AI = 0;
const BI = 1;

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

function damage(row: { attackerIndex: number | null; victimIndex: number; tick: number } & Partial<PackageDamage>): PackageDamage {
  return {
    roundNumber: 1,
    weapon: "ak47",
    hitgroup: "head",
    healthDamage: 100,
    healthDamageRaw: 100,
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
    headshot: true,
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

function pkg(shots?: PackageShots): DemoPackage {
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
    kills: [kill({ tick: 120, killerIndex: AI, victimIndex: BI })],
    damages: [damage({ tick: 120, attackerIndex: AI, victimIndex: BI })],
    blinds: [],
    bombs: [],
    grenades: [],
    clutches: [],
    shots
  } as DemoPackage;
}

describe("buildDuelInsights", () => {
  it("builds a schema-valid model with raw values and current-range percentile labels", () => {
    const model = buildDuelInsights([{ matchId: "m1", pkg: pkg(buildShots([{ tick: 100, playerIndex: AI }, { tick: 120, playerIndex: AI }])) }]);
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
