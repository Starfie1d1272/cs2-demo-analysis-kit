import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DemoPackage } from "@cs2dak/contract";
import {
  analyzeDemoPackage,
  computeAccountRatingsV2,
  deriveAccountSignalsV2,
  derivePlayerWeaponHighlights,
  deriveRRIndicators,
  loadDemoPackageFromZip
} from "./index";

let pkg: DemoPackage;

beforeAll(async () => {
  const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url)));
  pkg = await loadDemoPackageFromZip(zip);
}, 30_000);

describe("analyzeDemoPackage", () => {
  it("builds reusable analysis and view-model artifacts from a v3 export", () => {
    const bundle = analyzeDemoPackage(pkg);
    expect(bundle.sourceSchemaVersion).toBe("cs2-demo-format/3.0");
    expect(bundle.version).toBe("cs2-demo-analysis-kit/1.0");
    expect(bundle.provenance.sourceSchemaVersion).toBe("cs2-demo-format/3.0");
    expect(bundle.provenance.ratingVersions.rr).toBeTruthy();
    expect(bundle.scoreboard).toHaveLength(10);
    expect(bundle.scoreboard[0]?.rr).toBeGreaterThan(0);
    expect(bundle.playerIndicators[0]?.indicators.totalRounds).toBe(23);
    expect(bundle.playerRoundFacts).toHaveLength(230);
    expect(bundle.economy).toHaveLength(23);
    expect(bundle.timeline.filter((event) => event.type === "kill")).toHaveLength(148);
    expect(bundle.timeline.filter((event) => event.type === "bomb")).toHaveLength(87);
    expect(bundle.heatmap.filter((point) => point.kind === "death")).toHaveLength(148);
    expect(bundle.timeline.some((event) => event.type === "kill")).toBe(true);
    expect(bundle.heatmap.some((point) => point.kind === "death")).toBe(true);
    expect(bundle.timeline.find((event) => event.type === "round-end")?.clockPhase).toBe("round-end");
    expect(bundle.timeline.find((event) => event.type === "kill")?.clockLabel).toMatch(/^\d:\d{2}$/);
  });

  it("derives RR six-account signals and computes six-account RR from the v3 fixture", () => {
    const signals = deriveAccountSignalsV2(pkg);
    const ratings = computeAccountRatingsV2(pkg);

    expect(signals).toHaveLength(10);
    expect(ratings).toHaveLength(10);
    expect(signals[0]?.rounds).toBe(23);
    // 新 fixture（Team Liquid vs FlyQuest, de_anubis, 15 回合）的 combat 分布
    expect(signals[0]?.trade.tradedOpeningDeaths).toBe(0);
    expect(ratings[0]?.rr.model).toBe("rr-six-accounts");
    expect(ratings[0]?.rr.rr).toBeGreaterThan(0);
  });

  it("scores accountRR against the frozen pro baseline instead of the match mean", () => {
    const bundle = analyzeDemoPackage(pkg);

    const accountRRs = bundle.scoreboard.map((row) => row.accountRR);
    const mean = accountRRs.reduce((sum, v) => sum + v, 0) / accountRRs.length;
    expect(mean).toBeGreaterThan(0);
    expect(mean).not.toBeCloseTo(1.0, 2);
    // 职业基线不会强制当前比赛均值为 1.0，但仍应保留个体区分。
    expect(accountRRs.some((v) => v > 1.0)).toBe(true);
    expect(accountRRs.some((v) => v < 1.0)).toBe(true);
  });

  it("exposes RRIndicators without rebuilding them in cohort callers", () => {
    const indicators = deriveRRIndicators(pkg);
    const bundle = analyzeDemoPackage(pkg);

    expect(indicators).toHaveLength(10);
    expect(indicators[0]).toEqual(bundle.playerIndicators[0]?.indicators);
  });

  it("wires player-stats truth into RRIndicators instead of legacy approximations", () => {
    const statsTruth = pkg.playerStats[0]!;
    const patchedStats = {
      ...statsTruth,
      deaths: statsTruth.deaths + 2,
      combatDeathCount: statsTruth.deaths,
      bombDeathCount: 2
    };
    const patchedPkg = {
      ...pkg,
      playerStats: pkg.playerStats.map((row) => row.playerIndex === statsTruth.playerIndex ? patchedStats : row)
    };
    const indicators = deriveRRIndicators(patchedPkg);
    const bombDeathStats = patchedStats;
    const wallbangStats = pkg.playerStats.find((row) => row.wallbangKillCount > 0)!;

    const bombDeathSteamId64 = pkg.players[statsTruth.playerIndex]?.steamId64 ?? "unknown";
    const wallbangSteamId64 = pkg.players[wallbangStats.playerIndex]?.steamId64 ?? "unknown";
    const bombDeathIndicators = indicators.find((row) => row.steamId64 === bombDeathSteamId64)!;
    const wallbangIndicators = indicators.find((row) => row.steamId64 === wallbangSteamId64)!;

    expect(bombDeathStats.deaths).not.toBe(bombDeathStats.combatDeathCount);
    expect(bombDeathIndicators.combatDeathCount).toBe(bombDeathStats.combatDeathCount);
    expect(bombDeathIndicators.bombDeathCount).toBe(bombDeathStats.bombDeathCount);
    expect(wallbangIndicators.wallbangKillCount).toBe(wallbangStats.wallbangKillCount);
  });

  it("surfaces account breakdown and context status on the scoreboard", () => {
    const bundle = analyzeDemoPackage(pkg);
    const row = bundle.scoreboard[0]!;

    expect(row.accountBreakdown.combat).toBeGreaterThan(0);
    // 该 fixture 含经济与回合数据 → 两个 context 维度都 available
    expect(row.accountContextStatus.buyDelta).toBe("available");
    expect(row.accountContextStatus.manState).toBe("available");
  });

  it("surfaces rich v2 fields and confidence on the scoreboard", () => {
    const bundle = analyzeDemoPackage(pkg);
    const row = bundle.scoreboard[0]!;

    expect(row.combatDeathCount).toBe(13);
    expect(row.bombDeathCount).toBe(0);
    expect(row.bombPlantCount).toBeGreaterThanOrEqual(0);
    expect(row.noScopeKillCount).toBe(0);
    expect(row.throughSmokeKillCount).toBe(1);
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

  it("derives reusable per-player weapon kill distribution and highlight facts", () => {
    const facts = derivePlayerWeaponHighlights(pkg);
    const bundle = analyzeDemoPackage(pkg);

    expect(facts).toHaveLength(pkg.players.length);
    expect(bundle.playerWeaponHighlights).toEqual(facts);
    expect(facts.every((row) => row.weapons.reduce((sum, weapon) => sum + weapon.kills, 0) === row.totalKills)).toBe(true);
    expect(facts.flatMap((row) => row.weapons).some((weapon) => weapon.weapon === "ak47")).toBe(true);
    expect(facts.flatMap((row) => row.weapons).every((weapon) =>
      weapon.headshotKills <= weapon.kills
      && weapon.tradeKills <= weapon.kills
      && weapon.noScopeKills <= weapon.kills
      && weapon.throughSmokeKills <= weapon.kills
      && weapon.wallbangKills <= weapon.kills
    )).toBe(true);
    expect(facts.every((row) => row.highlights.wallbangKills != null)).toBe(true);
    expect(facts.every((row) => row.highlights.noScopeKills != null)).toBe(true);
    expect(facts.every((row) => row.highlights.throughSmokeKills != null)).toBe(true);
  });

  it("emits null context buckets (not zero) when the data source is missing", () => {
    // 剥离经济源 → buyDelta 降级为 null（而非零桶）；manState 仍可用
    const noEconomy = deriveAccountSignalsV2({ ...pkg, playerEconomies: [] });
    expect(noEconomy[0]?.combat.killsByBuyDelta).toBeNull();
    expect(noEconomy[0]?.combat.killsByManState).not.toBeNull();

    // 剥离回合源 → manState 降级为 null
    const noRounds = deriveAccountSignalsV2({ ...pkg, rounds: [] });
    expect(noRounds[0]?.combat.killsByManState).toBeNull();
  });

});
