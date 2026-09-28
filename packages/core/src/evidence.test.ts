import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadDemoPackageFromZip } from "./loader.js";
import { analyzeDemoPackage } from "./index.js";
import { analyzeDemoPackageForEvidence, buildPlayerRoundPerformanceFacts } from "./evidence.js";

describe("evidence Core profile", () => {
  it("uses exactly the QA and analysis version from full Core analysis", async () => {
    const zip = await readFile("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip");
    const pkg = await loadDemoPackageFromZip(zip, { profile: "evidence" });
    const facts = buildPlayerRoundPerformanceFacts(pkg);
    const full = analyzeDemoPackage(pkg, facts);
    expect(analyzeDemoPackageForEvidence(pkg, facts)).toEqual({
      provenance: { analysisVersion: full.provenance.analysisVersion },
      qa: full.qa,
    });
  });
});
