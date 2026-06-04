import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  analyzeDemoPackage,
  computeAccountRatingsV2,
  deriveAccountSignalsV2,
  deriveRRIndicators,
  loadDemoPackageFromZip
} from "./index";

describe("analyzeDemoPackage", () => {
  it("builds reusable analysis and view-model artifacts from a strict v2 export", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const bundle = analyzeDemoPackage(pkg);
    expect(bundle.sourceSchemaVersion).toBe("cs2-demo-format/2.0");
    expect(bundle.version).toBe("cs2-demo-analysis-kit/1.0");
    expect(bundle.provenance.sourceSchemaVersion).toBe("cs2-demo-format/2.0");
    expect(bundle.provenance.ratingVersions.rr).toBeTruthy();
    expect(bundle.scoreboard).toHaveLength(10);
    expect(bundle.scoreboard[0]?.rr).toBeGreaterThan(0);
    expect(bundle.playerIndicators[0]?.indicators.totalRounds).toBe(21);
    expect(bundle.playerRoundFacts).toHaveLength(210);
    expect(bundle.economy).toHaveLength(21);
    expect(bundle.timeline.filter((event) => event.type === "kill")).toHaveLength(142);
    expect(bundle.timeline.filter((event) => event.type === "bomb")).toHaveLength(94);
    expect(bundle.heatmap.filter((point) => point.kind === "death")).toHaveLength(142);
    expect(bundle.timeline.some((event) => event.type === "kill")).toBe(true);
    expect(bundle.heatmap.some((point) => point.kind === "death")).toBe(true);
    expect(bundle.timeline.find((event) => event.type === "round-end")?.clockPhase).toBe("round-end");
    expect(bundle.timeline.find((event) => event.type === "kill")?.clockLabel).toMatch(/^\d:\d{2}$/);
  });

  it("derives value-account signals and computes v2 RR from the strict v2 fixture", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const signals = deriveAccountSignalsV2(pkg);
    const ratings = computeAccountRatingsV2(pkg);

    expect(signals).toHaveLength(10);
    expect(ratings).toHaveLength(10);
    expect(signals[0]?.rounds).toBe(21);
    expect(signals[0]?.combat.killsByBuyDelta).toEqual({ disadvantage: 0, even: 2, advantage: 5 });
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

  it("exposes RRIndicators without rebuilding them in cohort callers", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const indicators = deriveRRIndicators(pkg);
    const bundle = analyzeDemoPackage(pkg);

    expect(indicators).toHaveLength(10);
    expect(indicators[0]).toEqual(bundle.playerIndicators[0]?.indicators);
  });

  it("wires player-stats truth into RRIndicators instead of legacy approximations", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const statsTruth = pkg.playerStats[0]!;
    const patchedStats = {
      ...statsTruth,
      deaths: statsTruth.deaths + 2,
      combatDeathCount: statsTruth.deaths,
      bombDeathCount: 2
    };
    const patchedPkg = {
      ...pkg,
      playerStats: pkg.playerStats.map((row) => row.steamId64 === statsTruth.steamId64 ? patchedStats : row)
    };
    const indicators = deriveRRIndicators(patchedPkg);
    const bombDeathStats = patchedStats;
    const wallbangStats = pkg.playerStats.find((row) => row.wallbangKillCount > 0)!;

    const bombDeathIndicators = indicators.find((row) => row.steamId64 === bombDeathStats.steamId64)!;
    const wallbangIndicators = indicators.find((row) => row.steamId64 === wallbangStats.steamId64)!;

    expect(bombDeathStats.deaths).not.toBe(bombDeathStats.combatDeathCount);
    expect(bombDeathIndicators.combatDeathCount).toBe(bombDeathStats.combatDeathCount);
    expect(bombDeathIndicators.bombDeathCount).toBe(bombDeathStats.bombDeathCount);
    expect(wallbangIndicators.wallbangKillCount).toBe(wallbangStats.wallbangKillCount);
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

  it("surfaces rich v2 fields and confidence on the scoreboard", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const bundle = analyzeDemoPackage(pkg);
    const row = bundle.scoreboard[0]!;

    expect(row.combatDeathCount).toBe(11);
    expect(row.bombDeathCount).toBe(0);
    expect(row.bombPlantCount).toBe(4);
    expect(row.noScopeKillCount).toBe(0);
    expect(row.throughSmokeKillCount).toBe(2);
    expect(row.fieldAvailability).toEqual({
      playerStats: "available",
      economy: "available",
      rounds: "available",
      richKills: "partial",
      damages: "available",
      bombs: "available"
    });
    expect(row.confidence).toBeCloseTo(0.917, 3);
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
