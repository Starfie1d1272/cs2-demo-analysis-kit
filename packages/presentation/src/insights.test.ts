import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import {
  buildMatchBuyQuality,
  buildMatchReportMarkdown,
  buildPlayerSeasonInsights,
  buildTournamentInsights
} from "./insights";
import { buildMatchWorkspaceModel } from "./workspace";

async function loadFixture() {
  const zip = await readFile(
    fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url))
  );
  return loadDemoPackageFromZip(zip);
}

describe("buildPlayerSeasonInsights", () => {
  it("derives trend, flash value and mistakes from one match", async () => {
    const pkg = await loadFixture();
    const steamId64 = pkg.playerStats[0].steamId64;
    const insights = buildPlayerSeasonInsights([{ matchId: "m1", pkg }], [steamId64]);

    expect(insights.trend).toHaveLength(1);
    const point = insights.trend[0];
    expect(point.matchId).toBe("m1");
    expect(point.mapName).toBe("de_ancient");
    expect(point.adr).toBeGreaterThan(0);
    expect(point.kast).toBeGreaterThan(0);
    expect(point.kast).toBeLessThanOrEqual(100);

    // 死亡分布总数 = 该选手 deaths（kills.json 口径）
    const deaths = pkg.kills.filter((k) => k.victimSteamId64 === steamId64).length;
    const dt = insights.mistakes.deathTiming;
    expect(dt.early + dt.mid + dt.late).toBe(dt.total);
    expect(dt.total).toBe(deaths);

    // flash value 字段自洽
    expect(insights.flash.enemyBlindSeconds).toBeGreaterThanOrEqual(0);
    if (insights.flash.flashesThrown === 0) {
      expect(insights.flash.netSecondsPerFlash).toBeNull();
    }
  });

  it("returns empty insights for unknown player", async () => {
    const pkg = await loadFixture();
    const insights = buildPlayerSeasonInsights([{ matchId: "m1", pkg }], ["76561190000000000"]);
    expect(insights.trend).toHaveLength(0);
    expect(insights.mistakes.deathTiming.total).toBe(0);
  });
});

describe("buildMatchBuyQuality", () => {
  it("win counts never exceed round counts and pistol rounds exist", async () => {
    const pkg = await loadFixture();
    const model = buildMatchWorkspaceModel(pkg);
    const quality = buildMatchBuyQuality(model.economy);

    for (const row of [...quality.teamA, ...quality.teamB]) {
      expect(row.wins).toBeLessThanOrEqual(row.rounds);
      expect(row.winRatePercent).not.toBeNull();
    }
    expect(quality.teamA.some((row) => row.economy === "pistol")).toBe(true);
    expect(quality.conversion.teamA.wins).toBeLessThanOrEqual(quality.conversion.teamA.rounds);
  });
});

describe("buildTournamentInsights", () => {
  it("aggregates round-level rates across demos", async () => {
    const pkg = await loadFixture();
    const insights = buildTournamentInsights([
      { matchId: "m1", pkg },
      { matchId: "m2", pkg }
    ]);
    expect(insights.matchCount).toBe(2);
    expect(insights.roundCount).toBe(pkg.rounds.length * 2);
    expect(insights.tWinRatePercent + insights.ctWinRatePercent).toBeCloseTo(100, 0);
    expect(insights.maps[0].mapName).toBe("de_ancient");
    expect(insights.maps[0].matches).toBe(2);
  });
});

describe("buildMatchReportMarkdown", () => {
  it("renders a markdown report with scoreboard and rounds", async () => {
    const pkg = await loadFixture();
    const model = buildMatchWorkspaceModel(pkg);
    const md = buildMatchReportMarkdown(model);

    expect(md).toContain(`# ${model.title}`);
    expect(md).toContain("## 记分板");
    expect(md).toContain("## 关键回合");
    // 每个选手一行
    for (const row of model.scoreboard) {
      expect(md).toContain(row.name);
    }
    expect(md.split("\n").filter((line) => line.startsWith("| R")).length).toBe(model.rounds.length);
  });
});
