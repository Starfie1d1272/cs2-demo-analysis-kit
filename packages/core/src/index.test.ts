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
    expect(bundle.playerIndicators[0]?.indicators.totalRounds).toBe(21);
    expect(bundle.playerRoundFacts).toHaveLength(210);
    expect(bundle.economy).toHaveLength(21);
    expect(bundle.timeline.filter((event) => event.type === "kill")).toHaveLength(144);
    expect(bundle.timeline.filter((event) => event.type === "bomb")).toHaveLength(94);
    expect(bundle.heatmap.filter((point) => point.kind === "death")).toHaveLength(144);
    expect(bundle.timeline.some((event) => event.type === "kill")).toBe(true);
    expect(bundle.heatmap.some((point) => point.kind === "death")).toBe(true);
    expect(bundle.timeline.find((event) => event.type === "round-end")?.clockPhase).toBe("round-end");
    expect(bundle.timeline.find((event) => event.type === "kill")?.clockLabel).toMatch(/^\d:\d{2}$/);
    expect(viewModel.scoreline).toBe("13:8");
    expect(viewModel.map.name).toBe("de_ancient");
    expect(viewModel.map.radarImageUrl).toBe("/maps/radars/de_ancient.png");
    // 已知数据特征：本场第 3 回合有 2 个 kill tick 落在回合窗口外（QA 抓到的
    // tick_outside_round）。疑似导出器侧回合边界归属问题，已列入 roadmap 阶段 0/2 排查。
    expect(viewModel.qa.summary.errorCount).toBe(2);
  });

  it("derives value-account signals and computes v2 RR from the strict v2 fixture", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const signals = deriveAccountSignalsV2(pkg);
    const ratings = computeAccountRatingsV2(pkg);

    expect(signals).toHaveLength(10);
    expect(ratings).toHaveLength(10);
    expect(signals[0]?.rounds).toBe(21);
    expect(signals[0]?.combat.killsByBuyDelta).toEqual({ disadvantage: 0, even: 4, advantage: 5 });
    expect(signals[0]?.combat.killsByManState).toEqual({ manDown: 1, even: 5, manUp: 1 });
    expect(signals[0]?.trade.tradedOpeningDeaths).toBe(1);
    expect(ratings[0]?.rr.model).toBe("value-accounts-v2-lite");
    expect(ratings[0]?.rr.rr).toBeGreaterThan(0);
  });

  it("anchors accountRR so the per-match league mean is ~1.0", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const bundle = analyzeDemoPackage(pkg);

    const accountRRs = bundle.scoreboard.map((row) => row.accountRR);
    const mean = accountRRs.reduce((sum, v) => sum + v, 0) / accountRRs.length;
    expect(mean).toBeCloseTo(1.0, 2);
    // 锚定后必然有人高于、有人低于 1.0
    expect(accountRRs.some((v) => v > 1.0)).toBe(true);
    expect(accountRRs.some((v) => v < 1.0)).toBe(true);
  });

  it("surfaces account breakdown and context status on the scoreboard", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const bundle = analyzeDemoPackage(pkg);
    const row = bundle.scoreboard[0]!;

    expect(row.accountBreakdown.combat).toBeGreaterThan(0);
    // 该 fixture 含经济与回合数据 → 两个 context 维度都 available
    expect(row.accountContextStatus.buyDelta).toBe("available");
    expect(row.accountContextStatus.manState).toBe("available");
  });

  it("emits null context buckets (not zero) when the data source is missing", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);

    // 剥离经济源 → buyDelta 降级为 null（而非零桶）；manState 仍可用
    const noEconomy = deriveAccountSignalsV2({ ...pkg, playerEconomies: [] });
    expect(noEconomy[0]?.combat.killsByBuyDelta).toBeNull();
    expect(noEconomy[0]?.combat.killsByManState).not.toBeNull();

    // 剥离回合源 → manState 降级为 null
    const noRounds = deriveAccountSignalsV2({ ...pkg, rounds: [] });
    expect(noRounds[0]?.combat.killsByManState).toBeNull();
  });
});
