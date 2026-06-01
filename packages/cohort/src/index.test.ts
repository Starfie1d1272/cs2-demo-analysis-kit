import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deriveRRIndicators, loadDemoPackageFromZip } from "@cs2dak/core";
import type { DemoPackage } from "@cs2dak/contract";
import { buildSeasonCohort } from "./index";

const fixtureDir = fileURLToPath(new URL("../../../fixtures/input/cohort", import.meta.url));
const integrationTimeoutMs = 20_000;
let cohortFixtures: ReturnType<typeof loadCohortFixtures> | null = null;

async function loadCohortFixtures() {
  const names = (await readdir(fixtureDir)).filter((name) => name.endsWith(".zip")).sort();
  const demos = await Promise.all(
    names.map(async (name) => ({
      matchId: name.replace(/\.zip$/, ""),
      pkg: await loadDemoPackageFromZip(await readFile(join(fixtureDir, name)))
    }))
  );
  return demos;
}

function getCohortFixtures() {
  cohortFixtures ??= loadCohortFixtures();
  return cohortFixtures;
}

describe("buildSeasonCohort", () => {
  it("builds a season bundle from multiple sanitized demo packages", async () => {
    const demos = await getCohortFixtures();
    const bundle = buildSeasonCohort(demos);
    const uniquePlayers = new Set(demos.flatMap((demo) => demo.pkg.players.map((player) => player.steamId64)));

    expect(demos).toHaveLength(3);
    expect(bundle.version).toBe("cs2-demo-analysis-kit/season-0.1");
    expect(bundle.matchCount).toBe(3);
    expect(bundle.players).toHaveLength(uniquePlayers.size);
    expect(bundle.players.length).toBeGreaterThan(10);
    expect(bundle.players.every((row) => row.prism?.mapCount === row.mapCount)).toBe(true);
    expect(bundle.players.every((row) => row.playerKey.startsWith("steam:"))).toBe(true);
  }, integrationTimeoutMs);

  it("merges the same steamId64 across matches and sums season counts", async () => {
    const demos = await getCohortFixtures();
    const bundle = buildSeasonCohort(demos);
    const repeated = bundle.players.find((row) => row.mapCount > 1);
    expect(repeated).toBeDefined();

    const expectedKills = demos.reduce((total, demo) => {
      const row = deriveRRIndicators(demo.pkg).find((indicator) => repeated!.steamIds.includes(indicator.steamId64));
      return total + (row?.kills ?? 0);
    }, 0);
    const expectedRounds = demos.reduce((total, demo) => {
      const row = deriveRRIndicators(demo.pkg).find((indicator) => repeated!.steamIds.includes(indicator.steamId64));
      return total + (row?.totalRounds ?? 0);
    }, 0);

    expect(repeated!.indicators.kills).toBe(expectedKills);
    expect(repeated!.indicators.totalRounds).toBe(expectedRounds);
    expect(repeated!.perMatch).toHaveLength(repeated!.mapCount);
  }, integrationTimeoutMs);

  it("can merge borrowed Steam accounts through an external identity map", async () => {
    const demos = await getCohortFixtures();
    const firstSteamId = demos[0]!.pkg.players[0]!.steamId64;
    const borrowedSteamId = demos
      .slice(1)
      .flatMap((demo) => demo.pkg.players.map((player) => player.steamId64))
      .find((steamId) => steamId !== firstSteamId)!;
    const baseline = buildSeasonCohort(demos);
    const bundle = buildSeasonCohort(demos, {
      identityMap: {
        [firstSteamId]: {
          playerKey: "user:rivalhub-user-1",
          userId: "rivalhub-user-1",
          displayName: "Unified Player"
        },
        [borrowedSteamId]: {
          playerKey: "user:rivalhub-user-1",
          userId: "rivalhub-user-1",
          displayName: "Unified Player"
        }
      }
    });
    const merged = bundle.players.find((row) => row.playerKey === "user:rivalhub-user-1");

    expect(bundle.players).toHaveLength(baseline.players.length - 1);
    expect(merged).toBeDefined();
    expect(merged!.name).toBe("Unified Player");
    expect(merged!.externalUserId).toBe("rivalhub-user-1");
    expect(merged!.steamIds).toEqual([borrowedSteamId, firstSteamId].sort());
    expect([...new Set(merged!.perMatch.map((row) => row.steamId64))].sort()).toEqual([borrowedSteamId, firstSteamId].sort());
    expect(merged!.indicators.steamId64).toBe("user:rivalhub-user-1");
    expect(merged!.prism?.steamId64).toBe("user:rivalhub-user-1");
  }, integrationTimeoutMs);

  it("anchors season accountRR around the season cohort mean", async () => {
    const bundle = buildSeasonCohort(await getCohortFixtures());
    const mean = bundle.players.reduce((sum, row) => sum + row.accountRR, 0) / bundle.players.length;

    expect(mean).toBeCloseTo(1, 2);
    expect(bundle.players.some((row) => row.accountRR > 1)).toBe(true);
    expect(bundle.players.some((row) => row.accountRR < 1)).toBe(true);
  }, integrationTimeoutMs);

  it("recomputes rate fields from summed counts and rounds", async () => {
    const demos = await getCohortFixtures();
    const bundle = buildSeasonCohort(demos);
    const repeated = bundle.players.find((row) => row.mapCount > 1);
    expect(repeated).toBeDefined();

    const sourceRows = demos
      .flatMap((demo) => deriveRRIndicators(demo.pkg))
      .filter((row) => repeated!.steamIds.includes(row.steamId64));
    const damage = sourceRows.reduce((sum, row) => sum + row.adr * row.totalRounds, 0);
    const rounds = sourceRows.reduce((sum, row) => sum + row.totalRounds, 0);
    const plainAverageAdr = sourceRows.reduce((sum, row) => sum + row.adr, 0) / sourceRows.length;

    expect(repeated!.indicators.adr).toBeCloseTo(damage / rounds, 2);
    expect(repeated!.indicators.adr).not.toBeCloseTo(plainAverageAdr, 4);
  }, integrationTimeoutMs);

  it("lowers confidence when context sources are missing", async () => {
    const demos = await getCohortFixtures();
    const complete = buildSeasonCohort(demos);
    const stripped = buildSeasonCohort(
      demos.map((demo) => ({
        matchId: demo.matchId,
        pkg: { ...demo.pkg, playerEconomies: [], rounds: [] } satisfies DemoPackage
      }))
    );

    expect(complete.players[0]?.confidence).toBeGreaterThan(stripped.players[0]?.confidence ?? 1);
    expect(stripped.players.every((row) => row.confidence >= 0 && row.confidence <= 1)).toBe(true);
  }, integrationTimeoutMs);
});
