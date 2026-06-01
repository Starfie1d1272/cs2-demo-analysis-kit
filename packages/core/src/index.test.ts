import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyzeDemoPackage, buildDemoViewModel, loadDemoPackageFromZip } from "./index";

describe("analyzeDemoPackage", () => {
  it("builds reusable analysis and view-model artifacts from a RivalHub v1 export", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/rivalhub-v1-de_mirage-2026-05-29.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const bundle = analyzeDemoPackage(pkg);
    const viewModel = buildDemoViewModel(bundle);

    expect(bundle.sourceSchemaVersion).toBe("cs2-demo-format/2.0");
    expect(bundle.version).toBe("cs2-demo-analysis-kit/0.2");
    expect(bundle.scoreboard).toHaveLength(10);
    expect(bundle.scoreboard[0]?.rr).toBeGreaterThan(0);
    expect(bundle.playerIndicators[0]?.indicators.totalRounds).toBe(24);
    expect(bundle.playerRoundFacts).toHaveLength(240);
    expect(bundle.economy).toHaveLength(24);
    expect(bundle.timeline.filter((event) => event.type === "kill")).toHaveLength(162);
    expect(bundle.heatmap.filter((point) => point.kind === "death")).toHaveLength(162);
    expect(bundle.timeline.some((event) => event.type === "kill")).toBe(true);
    expect(bundle.heatmap.some((point) => point.kind === "death")).toBe(true);
    expect(viewModel.scoreline).toBe("11:13");
    expect(viewModel.map.name).toBe("de_mirage");
    expect(viewModel.map.radarImageUrl).toBe("/maps/radars/de_mirage.png");
    expect(viewModel.qa.summary.errorCount).toBe(0);
  });
});
