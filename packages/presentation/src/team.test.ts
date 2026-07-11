import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import { buildTeamComparison, buildTeamComparisonFromFacts, buildTeamOverviewFromFacts, extractTeamComparisonFacts } from "./index";

async function loadFixture() {
  const zip = await readFile(
    fileURLToPath(new URL("../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url))
  );
  return loadDemoPackageFromZip(zip);
}

describe("buildTeamComparison", () => {
  it("builds the same model from persisted comparison facts", async () => {
    const pkg = await loadFixture();
    const inputs = [{ matchId: "m1", pkg }];

    expect(buildTeamComparisonFromFacts(inputs.map(extractTeamComparisonFacts))).toEqual(buildTeamComparison(inputs));
  });

  it("builds a descriptive overview for one team from persisted facts", async () => {
    const pkg = await loadFixture();
    const overview = buildTeamOverviewFromFacts([extractTeamComparisonFacts({ matchId: "m1", pkg })], "Team Spirit");

    expect(overview).toMatchObject({ teamName: "Team Spirit", matchCount: 1, maps: [{ mapName: "de_ancient", matches: 1 }] });
    expect(overview?.roster.length).toBeGreaterThan(0);
  });
});
