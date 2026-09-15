import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  aggregatePlayerRoundPerformanceFacts,
  assertPlayerStatsParity,
  buildPlayerRoundPerformanceFacts,
  findPlayerStatsParityMismatches,
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

beforeAll(async () => {
  fixturePackages = await Promise.all(REAL_FIXTURES.map(async (path) => ({
    path,
    pkg: await loadDemoPackageFromZip(await readFile(fileURLToPath(new URL(`../../../fixtures/input/${path}`, import.meta.url)))),
  })));
}, 30_000);

describe("canonical player-round performance facts", () => {
  it("matches the frozen playerStats aggregate across every standalone real fixture", () => {
    for (const { path, pkg } of fixturePackages) {
      const facts = buildPlayerRoundPerformanceFacts(pkg);
      expect(findPlayerStatsParityMismatches(pkg, facts), path).toEqual([]);
      expect(() => assertPlayerStatsParity(pkg, facts), path).not.toThrow();
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

  it("fails strict parity when the frozen aggregate oracle is changed", () => {
    const pkg = fixturePackages[0]!.pkg;
    const stats = pkg.playerStats[0]!;
    const mismatched = {
      ...pkg,
      playerStats: pkg.playerStats.map((row) => row.playerIndex === stats.playerIndex
        ? { ...row, damageHealth: row.damageHealth + 1 }
        : row),
    };

    expect(() => assertPlayerStatsParity(mismatched)).toThrow(/damageHealth/);
  });
});
