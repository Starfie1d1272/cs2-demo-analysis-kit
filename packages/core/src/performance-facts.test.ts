import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { DemoPackage, PackageKill } from "@cs2dak/contract";
import {
  aggregatePlayerRoundPerformanceFacts,
  assertPlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  loadDemoPackageFromZip,
} from "./index.js";

const REAL_FIXTURES = [
  "cohort/3717822864.zip",
  "cohort/3718901136.zip",
  "cohort/3718919952-de_ancient.zip",
  "cologne-major-2026-stage3-smoke-de_nuke.zip",
  "cs2dak-sanitized-de_ancient.zip",
  "sample-2026-02-09_de_inferno_Team_Vitality_13-8_FURIA.zip",
  "sample-2026-02-09_de_mirage_FURIA_13-11_Team_Vitality.zip",
  "sample-2026-02-09_de_nuke_FURIA_2-13_Team_Vitality.zip",
  "sample-2026-02-09_de_overpass_Team_Vitality_13-10_FURIA.zip",
  "sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip",
  "sample-2026-05-17_de_dust2_Team_Spirit_16-12_Team_Falcons.zip",
  "sample-2026-05-17_de_mirage_Team_Spirit_13-7_Team_Falcons.zip",
] as const;

let fixturePackages: Array<{ path: string; pkg: Awaited<ReturnType<typeof loadDemoPackageFromZip>> }>;

function syntheticPackage(playerCount: number, kills: PackageKill[], teamASize = 4): DemoPackage {
  const players = Array.from({ length: playerCount }, (_, index) => ({
    steamId64: `synthetic-${index}`,
    name: `Synthetic ${index}`,
    teamKey: index < teamASize ? "teamA" : "teamB",
  }));
  return {
    match: {
      mapName: "de_synthetic",
      tickrate: 64,
      teamA: { name: "Synthetic A", score: 1 },
      teamB: { name: "Synthetic B", score: 0 },
    },
    players,
    rounds: [{
      roundNumber: 1,
      startTick: 0,
      freezeEndTick: 10,
      endTick: 1000,
      teamASide: "t",
      teamBSide: "ct",
      winnerTeamKey: "teamA",
      winnerSide: "t",
    }],
    kills,
    damages: [],
    blinds: [],
    bombs: [],
    grenades: [],
    clutches: [],
    playerEconomies: [],
    playerStats: [],
  } as unknown as DemoPackage;
}

function syntheticKill(overrides: Partial<PackageKill>): PackageKill {
  return {
    roundNumber: 1,
    tick: 100,
    killerIndex: null,
    victimIndex: 0,
    weapon: "ak47",
    headshot: false,
    tradeKill: false,
    tradeDeath: false,
    noScope: false,
    throughSmoke: false,
    penetratedObjects: 0,
    assisterIndex: null,
    flashAssist: false,
    flashAssisterIndex: null,
    victimPosition: { x: 0, y: 0, z: 0 },
    ...overrides,
  } as PackageKill;
}

beforeAll(async () => {
  fixturePackages = await Promise.all(REAL_FIXTURES.map(async (path) => ({
    path,
    pkg: await loadDemoPackageFromZip(await readFile(fileURLToPath(new URL(`../../../fixtures/input/${path}`, import.meta.url)))),
  })));
}, 30_000);

describe("canonical player-round performance facts", () => {
  it("validates canonical event conservation across every standalone real fixture", () => {
    for (const { path, pkg } of fixturePackages) {
      const facts = buildPlayerRoundPerformanceFacts(pkg);
      expect(() => assertPlayerRoundPerformanceFacts(pkg, facts), path).not.toThrow();
    }
  });

  it("keeps assists, flash assists, damage and all consumers on one Ancient owner", () => {
    const pkg = fixturePackages.find(({ path }) => path.endsWith("sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip"))!.pkg;
    const facts = buildPlayerRoundPerformanceFacts(pkg);
    const summaries = aggregatePlayerRoundPerformanceFacts(facts);
    const sh1ro = summaries.get(pkg.players.find((player) => player.name === "sh1ro")!.steamId64)!;
    const donk = summaries.get(pkg.players.find((player) => player.name === "donk")!.steamId64)!;

    expect(sh1ro.assists).toBe(3);
    expect(sh1ro.utility.flashAssists).toBe(3);
    expect(donk.damage).toBe(2653);
    expect(facts.playerRounds).toHaveLength(pkg.rounds.length * pkg.players.length);
    expect(sh1ro.weapons.reduce((sum, weapon) => sum + weapon.kills, 0)).toBe(sh1ro.kills);
  });

  it("uses enemy-only offensive credit while preserving teamkill victim and assist semantics", () => {
    const pkg = syntheticPackage(4, [
      syntheticKill({ tick: 100, killerIndex: 0, victimIndex: 2, headshot: true }),
      syntheticKill({
        tick: 110,
        killerIndex: 0,
        victimIndex: 1,
        weapon: "hegrenade",
        headshot: true,
        tradeKill: true,
        noScope: true,
        throughSmoke: true,
        penetratedObjects: 1,
        assisterIndex: 3,
        flashAssist: true,
        flashAssisterIndex: 3,
      }),
      syntheticKill({ tick: 120, killerIndex: null, victimIndex: 0 }),
    ], 2);
    const facts = buildPlayerRoundPerformanceFacts(pkg);
    const summaries = aggregatePlayerRoundPerformanceFacts(facts);
    const killer = summaries.get("synthetic-0")!;
    const teamkillVictim = summaries.get("synthetic-1")!;
    const assister = summaries.get("synthetic-3")!;

    expect(killer).toMatchObject({
      kills: 1,
      deaths: 1,
      headshots: 1,
      tradeKills: 0,
      firstKills: 1,
      firstDeaths: 0,
    });
    expect(killer.headshots).toBeLessThanOrEqual(killer.kills);
    expect(killer.oneKillRounds).toBe(1);
    expect(killer.twoKillRounds).toBe(0);
    const killerRound = facts.playerRounds.find((row) => row.steamId64 === "synthetic-0")!;
    expect(killerRound).toMatchObject({
      kills: 1,
      deaths: 1,
      headshots: 1,
      survived: false,
      openingDuel: "won",
      kast: true,
      kastTags: ["kill"],
    });
    expect(killer.utility.utilityKills).toBe(0);
    expect(killer.weapons).toEqual([
      expect.objectContaining({
        weapon: "ak47",
        kills: 1,
        headshotKills: 1,
        tradeKills: 0,
        noScopeKills: 0,
        throughSmokeKills: 0,
        wallbangKills: 0,
        penetratedObjects: 0,
      }),
    ]);
    expect(teamkillVictim).toMatchObject({ kills: 0, deaths: 1, combatDeaths: 1 });
    expect(assister).toMatchObject({ assists: 1, utility: { flashAssists: 1 } });
    expect(facts.manState).toHaveLength(1);
  });

  it("does not let a TK-only round earn KAST through its kill tag", () => {
    const pkg = syntheticPackage(4, [
      syntheticKill({ tick: 100, killerIndex: 0, victimIndex: 1, headshot: true, weapon: "hegrenade" }),
      syntheticKill({ tick: 110, killerIndex: null, victimIndex: 0 }),
    ], 2);
    const facts = buildPlayerRoundPerformanceFacts(pkg);
    const row = facts.playerRounds.find((candidate) => candidate.steamId64 === "synthetic-0")!;

    expect(row).toMatchObject({ kills: 0, deaths: 1, survived: false, kast: false, kastTags: [] });

    expect(() => assertPlayerRoundPerformanceFacts(pkg, facts)).not.toThrow();
  });

  it("uses kill.weapon for performance weapon buckets", () => {
    const pkg = fixturePackages[0]!.pkg;
    const baseline = aggregatePlayerRoundPerformanceFacts(buildPlayerRoundPerformanceFacts(pkg));
    const withDifferentActiveWeapon = {
      ...pkg,
      kills: pkg.kills.map((kill) => ({ ...kill, killerActiveWeapon: "awp" })),
    };
    const actual = aggregatePlayerRoundPerformanceFacts(buildPlayerRoundPerformanceFacts(withDifferentActiveWeapon));
    expect(actual).toEqual(baseline);
  });

  it("ignores the obsolete frozen aggregate comparison without changing event facts", () => {
    const pkg = fixturePackages[0]!.pkg;
    const stats = pkg.playerStats[0]!;
    const mismatched = {
      ...pkg,
      playerStats: pkg.playerStats.map((row) => row.playerIndex === stats.playerIndex
        ? { ...row, damageHealth: row.damageHealth + 1 }
        : row),
    };

    expect(buildPlayerRoundPerformanceFacts(mismatched)).toEqual(buildPlayerRoundPerformanceFacts(pkg));
    expect(() => assertPlayerRoundPerformanceFacts(mismatched, buildPlayerRoundPerformanceFacts(mismatched))).not.toThrow();
  });

  it("keeps suicide out of performance attribution and advances man-state past every death", () => {
    const pkg = syntheticPackage(10, [
      syntheticKill({ tick: 100, killerIndex: null, victimIndex: 2 }),
      syntheticKill({ tick: 110, killerIndex: 0, victimIndex: 1 }),
      syntheticKill({ tick: 120, killerIndex: 0, victimIndex: 0, headshot: true }),
      syntheticKill({ tick: 130, killerIndex: 4, victimIndex: 3, headshot: true }),
    ]);

    const facts = buildPlayerRoundPerformanceFacts(pkg);
    const summaries = aggregatePlayerRoundPerformanceFacts(facts);
    const playerA = summaries.get("synthetic-0")!;
    const playerB = summaries.get("synthetic-1")!;
    const playerC = summaries.get("synthetic-2")!;
    const playerD = summaries.get("synthetic-3")!;
    const playerE = summaries.get("synthetic-4")!;

    expect(playerA).toMatchObject({ kills: 0, deaths: 1, bombDeaths: 1, weapons: [] });
    expect(playerB).toMatchObject({ kills: 0, deaths: 1, combatDeaths: 1 });
    expect(playerC).toMatchObject({ kills: 0, deaths: 1, bombDeaths: 1 });
    expect(playerD).toMatchObject({ kills: 0, deaths: 1, firstDeaths: 1, headshots: 0 });
    expect(playerE).toMatchObject({ kills: 1, deaths: 0, firstKills: 1, headshots: 1 });

    expect(() => assertPlayerRoundPerformanceFacts(pkg, facts)).not.toThrow();

    expect(facts.manState).toHaveLength(1);
    expect(facts.manState[0]).toMatchObject({
      killerSteamId64: "synthetic-4",
      victimSteamId64: "synthetic-3",
      preAdvantageTeamKey: "teamB",
      preAdvantageAlive: 6,
      preDisadvantageAlive: 1,
      advantageTeamKey: "teamB",
      advantageAlive: 6,
      disadvantageAlive: 0,
    });
  });

  it("matches the exporter five-kill bucket for six or more kills in one round", () => {
    const pkg = syntheticPackage(7, [1, 2, 3, 4, 5, 6].map((victimIndex) => syntheticKill({
      tick: 100 + victimIndex,
      killerIndex: 0,
      victimIndex,
    })), 1);
    const summary = aggregatePlayerRoundPerformanceFacts(buildPlayerRoundPerformanceFacts(pkg)).get("synthetic-0")!;

    expect(summary.kills).toBe(6);
    expect(summary.fiveKillRounds).toBe(1);
    expect(summary.weapons).toEqual([expect.objectContaining({ weapon: "ak47", kills: 6 })]);
  });

  it("checks supplied facts against events rather than old aggregate values", () => {
    const pkg = syntheticPackage(4, [syntheticKill({ killerIndex: 0, victimIndex: 2 })], 2);
    const facts = buildPlayerRoundPerformanceFacts(pkg);
    const damaged = { ...facts, playerRounds: facts.playerRounds.map((row, i) => i === 0 ? { ...row, kills: row.kills + 1 } : row) };
    expect(() => assertPlayerRoundPerformanceFacts(pkg, damaged)).toThrow(/kills/);
    const oldStats = { ...pkg, playerStats: [{ playerIndex: 0, kills: 999, firstKillCount: 999, firstDeathCount: 999 }] as DemoPackage["playerStats"] };
    expect(buildPlayerRoundPerformanceFacts(oldStats)).toEqual(facts);
    expect(() => assertPlayerRoundPerformanceFacts(oldStats, facts)).not.toThrow();
  });
});
