import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import { buildSeasonCohort } from "@cs2dak/cohort";
import { teamCohortSummarySchema } from "@cs2dak/contract";
import { buildTeamCohortSummary } from "./index";

const fixtureDir = fileURLToPath(new URL("../../../fixtures/input/cohort", import.meta.url));
const integrationTimeoutMs = 20_000;
let cohortFixtures: ReturnType<typeof buildCohort> | null = null;

async function buildCohort() {
  const names = (await readdir(fixtureDir)).filter((name) => name.endsWith(".zip")).sort();
  const demos = await Promise.all(
    names.map(async (name) => ({
      matchId: name.replace(/\.zip$/, ""),
      pkg: await loadDemoPackageFromZip(await readFile(join(fixtureDir, name)))
    }))
  );
  return buildSeasonCohort(demos);
}

function getCohort() {
  cohortFixtures ??= buildCohort();
  return cohortFixtures;
}

describe("buildTeamCohortSummary", () => {
  it(
    "builds a product-neutral team summary from an externally supplied roster",
    async () => {
      const bundle = await getCohort();
      const roster = bundle.players.slice(0, 5);
      const summary = buildTeamCohortSummary(bundle, {
        teamKey: "rivals-alpha",
        name: "Rivals Alpha",
        playerKeys: roster.map((player) => player.playerKey)
      });

      expect(() => teamCohortSummarySchema.parse(summary)).not.toThrow();
      expect(summary.teamKey).toBe("rivals-alpha");
      expect(summary.name).toBe("Rivals Alpha");
      expect(summary.members).toHaveLength(5);
      expect(summary.coreMembers).toHaveLength(5);
      expect(summary.averages.rivalhubRR).toBeCloseTo(
        roster.reduce((sum, player) => sum + player.accountRR, 0) / roster.length,
        2
      );
      expect(summary.leaders.map((leader) => leader.metric)).toEqual([
        "rivalhubRR",
        "adr",
        "kast",
        "firstKillPer100"
      ]);
      expect(summary.performance.firstKills).toBeGreaterThanOrEqual(0);
      expect(summary.performance.firstDeaths).toBeGreaterThanOrEqual(0);
      expect(summary.performance.openingDuelWinRate).toBeGreaterThanOrEqual(0);
      expect(summary.performance.clutchAttempts).toBeGreaterThanOrEqual(summary.performance.clutchWins);
      expect(summary.roleComplementarity.coverageScore).toBeGreaterThanOrEqual(0);
      expect(summary.roleComplementarity.coverageScore).toBeLessThanOrEqual(100);
      expect(summary).not.toHaveProperty("userId");
    },
    integrationTimeoutMs
  );

  it("rejects an empty or unknown roster", async () => {
    const bundle = await getCohort();
    expect(() =>
      buildTeamCohortSummary(bundle, { teamKey: "empty", name: "Empty", playerKeys: [] })
    ).toThrow(/at least one/);
    expect(() =>
      buildTeamCohortSummary(bundle, { teamKey: "unknown", name: "Unknown", playerKeys: ["missing"] })
    ).toThrow(/not found/);
  }, integrationTimeoutMs);
});
