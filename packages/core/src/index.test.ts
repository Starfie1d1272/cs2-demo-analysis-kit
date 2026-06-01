import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  analyzeDemoPackage,
  buildDemoViewModel,
  computeAccountRatingsV2,
  deriveAccountSignalsV2,
  loadDemoPackageFromZip
} from "./index";

describe("analyzeDemoPackage", () => {
  it("builds reusable analysis and view-model artifacts from a strict v2 export", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const bundle = analyzeDemoPackage(pkg);
    const viewModel = buildDemoViewModel(bundle);

    expect(bundle.sourceSchemaVersion).toBe("cs2-demo-format/2.0");
    expect(bundle.version).toBe("cs2-demo-analysis-kit/0.2");
    expect(bundle.scoreboard).toHaveLength(10);
    expect(bundle.scoreboard[0]?.rr).toBeGreaterThan(0);
    expect(bundle.playerIndicators[0]?.indicators.totalRounds).toBe(35);
    expect(bundle.playerRoundFacts).toHaveLength(350);
    expect(bundle.economy).toHaveLength(35);
    expect(bundle.timeline.filter((event) => event.type === "kill")).toHaveLength(236);
    expect(bundle.timeline.filter((event) => event.type === "bomb")).toHaveLength(38);
    expect(bundle.heatmap.filter((point) => point.kind === "death")).toHaveLength(236);
    expect(bundle.timeline.some((event) => event.type === "kill")).toBe(true);
    expect(bundle.heatmap.some((point) => point.kind === "death")).toBe(true);
    expect(bundle.timeline.find((event) => event.type === "round-end")?.clockPhase).toBe("round-end");
    expect(bundle.timeline.find((event) => event.type === "kill")?.clockLabel).toMatch(/^\d:\d{2}$/);
    expect(viewModel.scoreline).toBe("16:19");
    expect(viewModel.map.name).toBe("de_ancient");
    expect(viewModel.map.radarImageUrl).toBe("/maps/radars/de_ancient.png");
    expect(viewModel.qa.summary.errorCount).toBe(0);
  });

  it("derives value-account signals and computes v2 RR from the strict v2 fixture", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const signals = deriveAccountSignalsV2(pkg);
    const ratings = computeAccountRatingsV2(pkg);

    expect(signals).toHaveLength(10);
    expect(ratings).toHaveLength(10);
    expect(signals[0]?.rounds).toBe(35);
    expect(signals[0]?.combat.killsByBuyDelta).toEqual({ disadvantage: 8, even: 16, advantage: 6 });
    expect(signals[0]?.combat.killsByManState).toEqual({ manDown: 11, even: 8, manUp: 11 });
    expect(signals[0]?.trade.tradedOpeningDeaths).toBe(1);
    expect(ratings[0]?.rr.model).toBe("value-accounts-v2-lite");
    expect(ratings[0]?.rr.rr).toBeGreaterThan(0);
  });
});
