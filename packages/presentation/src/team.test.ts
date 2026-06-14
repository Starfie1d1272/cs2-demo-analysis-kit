import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import { teamCohortSummarySchema } from "@cs2dak/contract";
import { buildTeamCohortSummary, buildTeamComparison, buildTeamComparisonFromFacts, extractTeamComparisonFacts } from "./index";
import { buildTestSeasonCohortBundle } from "./test-fixtures";

async function loadFixture() {
  const zip = await readFile(
    fileURLToPath(new URL("../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url))
  );
  return loadDemoPackageFromZip(zip);
}

describe("buildTeamCohortSummary", () => {
  it("builds a product-neutral team summary from an externally supplied roster", () => {
    const bundle = buildTestSeasonCohortBundle();
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
  });

  it("rejects an empty or unknown roster", () => {
    const bundle = buildTestSeasonCohortBundle();
    expect(() =>
      buildTeamCohortSummary(bundle, { teamKey: "empty", name: "Empty", playerKeys: [] })
    ).toThrow(/at least one/);
    expect(() =>
      buildTeamCohortSummary(bundle, { teamKey: "unknown", name: "Unknown", playerKeys: ["missing"] })
    ).toThrow(/not found/);
  });
});

describe("buildTeamComparison", () => {
  it("builds the same model from persisted comparison facts", async () => {
    const pkg = await loadFixture();
    const inputs = [{ matchId: "m1", pkg }];

    expect(buildTeamComparisonFromFacts(inputs.map(extractTeamComparisonFacts))).toEqual(buildTeamComparison(inputs));
  });
});
