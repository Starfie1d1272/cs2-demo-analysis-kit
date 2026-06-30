import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import {
  buildMatchBuyQuality,
  buildMatchReportMarkdown,
  buildPlayerFlashSummaries,
  buildPlayerSeasonInsights,
  buildUtilityValueSummary,
  mergeUtilityValueSummaries,
  buildTournamentInsights,
  buildTournamentInsightsFromFacts,
  extractTournamentFacts
} from "./insights";
import { buildMatchWorkspaceModel } from "./workspace";

const fixture = (async () => loadDemoPackageFromZip(await readFile(
  fileURLToPath(new URL("../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url))
)))();
const workspaceFixture = fixture.then(buildMatchWorkspaceModel);

describe("buildPlayerSeasonInsights", () => {
  it("derives trend, flash value and mistakes from one match", async () => {
    const pkg = await fixture;
    const steamId64 = pkg.players[pkg.playerStats[0].playerIndex]?.steamId64 ?? "";
    const insights = buildPlayerSeasonInsights([{ matchId: "m1", pkg }], [steamId64]);

    expect(insights.trend).toHaveLength(1);
    const point = insights.trend[0];
    expect(point.matchId).toBe("m1");
    expect(point.mapName).toBe("de_ancient");
    expect(point.adr).toBeGreaterThan(0);
    expect(point.kast).toBeGreaterThan(0);
    expect(point.kast).toBeLessThanOrEqual(100);

    // 死亡分布总数 = 该选手 deaths（kills.json 口径）
    const deaths = pkg.kills.filter((k) => pkg.players[k.victimIndex]?.steamId64 === steamId64).length;
    const dt = insights.mistakes.deathTiming;
    expect(dt.early + dt.mid + dt.late).toBe(dt.total);
    expect(dt.total).toBe(deaths);

    // flash value 字段自洽
    expect(insights.flash.enemyBlindSeconds).toBeGreaterThanOrEqual(0);
    expect(insights.flash.enemyBlindVictims).toBeGreaterThanOrEqual(0);
    if (insights.flash.flashesThrown === 0) {
      expect(insights.flash.netSecondsPerFlash).toBeNull();
      expect(insights.flash.enemySecondsPerFlash).toBeNull();
    } else {
      expect(insights.flash.enemySecondsPerFlash).toBeCloseTo(
        insights.flash.enemyBlindSeconds / insights.flash.flashesThrown,
        1
      );
    }

    // 首死统计：count ≤ attempts，三个口径各自自洽
    for (const stat of [
      insights.mistakes.lowBuyFirstDeaths,
      insights.mistakes.fullBuyFirstDeaths,
      insights.mistakes.antiEcoFirstDeaths
    ]) {
      expect(stat.count).toBeLessThanOrEqual(stat.attempts);
      expect(stat.evidence.length).toBeLessThanOrEqual(stat.count);
    }
  });

  it("returns empty insights for unknown player", async () => {
    const pkg = await fixture;
    const insights = buildPlayerSeasonInsights([{ matchId: "m1", pkg }], ["76561190000000000"]);
    expect(insights.trend).toHaveLength(0);
    expect(insights.mistakes.deathTiming.total).toBe(0);
  });
});

describe("buildPlayerFlashSummaries", () => {
  it("matches the existing per-player flash value derivation", async () => {
    const pkg = await fixture;
    const players = pkg.players.slice(0, 4).map((player) => ({
      playerKey: `steam:${player.steamId64}`,
      name: player.name,
      steamIds: [player.steamId64]
    }));
    const demos = [{ matchId: "m1", pkg }];
    const summaries = buildPlayerFlashSummaries(demos, players);

    for (const player of players) {
      const expected = buildPlayerSeasonInsights(demos, player.steamIds).flash;
      const actual = summaries.find((row) => row.playerKey === player.playerKey);
      expect(actual).toBeDefined();
      expect(actual?.flashesThrown).toBe(expected.flashesThrown);
      expect(actual?.enemyBlindSeconds).toBe(expected.enemyBlindSeconds);
      expect(actual?.teamBlindSeconds).toBe(expected.teamBlindSeconds);
      expect(actual?.enemyBlindVictims).toBe(expected.enemyBlindVictims);
      expect(actual?.enemySecondsPerFlash).toBe(expected.enemySecondsPerFlash);
      expect(actual?.netSecondsPerFlash).toBe(expected.netSecondsPerFlash);
      expect(actual?.flashAssists).toBe(expected.flashAssists);
      expect(actual?.worstTeamFlashes).toEqual(expected.worstTeamFlashes);
    }
  });
});

describe("buildUtilityValueSummary", () => {
  it("normalizes flash, HE, fire and smoke value by rounds or throws", async () => {
    const pkg = await fixture;
    const players = pkg.players.slice(0, 4).map((player) => ({
      playerKey: `steam:${player.steamId64}`,
      name: player.name,
      steamIds: [player.steamId64]
    }));
    const summary = buildUtilityValueSummary([{ matchId: "m1", pkg }], players);

    expect(summary.players).toHaveLength(players.length);
    expect(summary.teams).toHaveLength(2);

    for (const row of [...summary.players, ...summary.teams]) {
      if (row.rounds > 0) {
        expect(row.enemyBlindSecondsPerRound).toBeCloseTo(row.enemyBlindSeconds > 0 ? row.enemyBlindSeconds / row.rounds : 0, 1);
        expect(row.smokesPerRound).toBe(Math.round((row.smokesThrown / row.rounds) * 1000) / 1000);
        expect(row.heDamagePerRound).toBe(Math.round((row.heDamage / row.rounds) * 100) / 100);
        expect(row.fireDamagePerRound).toBe(Math.round((row.fireDamage / row.rounds) * 100) / 100);
      }
      if (row.flashesThrown > 0) expect(row.enemyBlindSecondsPerFlash).toBeCloseTo(row.enemyBlindSeconds / row.flashesThrown, 1);
      else expect(row.enemyBlindSecondsPerFlash).toBeNull();
      expect(row.heDamagePerThrow).toBe(row.heThrows > 0 ? Math.round((row.heDamage / row.heThrows) * 100) / 100 : null);
      expect(row.fireDamagePerThrow).toBe(row.fireThrows > 0 ? Math.round((row.fireDamage / row.fireThrows) * 100) / 100 : null);
    }

    for (const evidence of summary.bestDamageRounds) {
      expect(evidence.damage).toBeGreaterThan(0);
      expect(evidence.victimCount).toBeGreaterThan(0);
    }
  });

  it("merges persisted per-match utility summaries by identity", async () => {
    const pkg = await fixture;
    const players = pkg.players.slice(0, 2).map((player) => ({
      playerKey: `steam:${player.steamId64}`,
      name: player.name,
      steamIds: [player.steamId64]
    }));
    const mergedPlayer = {
      playerKey: "merged",
      name: "Merged Player",
      steamIds: players.flatMap((player) => player.steamIds)
    };
    const summary = buildUtilityValueSummary([{ matchId: "m1", pkg }], players);
    const merged = mergeUtilityValueSummaries([summary], { players: [mergedPlayer] });
    const expectedRounds = summary.players.reduce((total, row) => total + row.rounds, 0);
    const expectedFlashAssists = summary.players.reduce((total, row) => total + row.flashAssists, 0);

    expect(merged.players).toHaveLength(1);
    expect(merged.players[0]?.id).toBe("merged");
    expect(merged.players[0]?.rounds).toBe(expectedRounds);
    expect(merged.players[0]?.flashAssists).toBe(expectedFlashAssists);
  });
});

describe("buildMatchBuyQuality", () => {
  it("win counts never exceed round counts and pistol rounds exist", async () => {
    const model = await workspaceFixture;
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
  it("builds the same model from persisted tournament facts", async () => {
    const pkg = await fixture;
    const demos = [
      { matchId: "m1", pkg },
      { matchId: "m2", pkg }
    ];

    expect(buildTournamentInsightsFromFacts(demos.map(extractTournamentFacts))).toEqual(buildTournamentInsights(demos));
  });

  it("aggregates round-level rates across demos", async () => {
    const pkg = await fixture;
    const insights = buildTournamentInsights([
      { matchId: "m1", pkg },
      { matchId: "m2", pkg }
    ]);
    expect(insights.matchCount).toBe(2);
    expect(insights.roundCount).toBe(pkg.rounds.length * 2);
    expect(insights.tWinRatePercent + insights.ctWinRatePercent).toBeCloseTo(100, 0);
    expect(insights.maps[0].mapName).toBe("de_ancient");
    expect(insights.maps[0].matches).toBe(2);

    // 经济矩阵：按高低经济重排，手枪局不入矩阵；同档对局不出胜率
    for (const cell of insights.economyMatrix) {
      expect(cell.lowEconomy).not.toBe("pistol");
      expect(cell.highEconomy).not.toBe("pistol");
      if (cell.lowEconomy === cell.highEconomy) expect(cell.lowWinRatePercent).toBeNull();
      else expect(cell.lowWinRatePercent).not.toBeNull();
    }

    // 反转换：机会数 ≥ 成功数，全队 breakRounds 总和 = 全队 conversionRounds 总和
    const totalBreakRounds = insights.teamPistols.reduce((acc, row) => acc + row.breakRounds, 0);
    const totalConversionRounds = insights.teamPistols.reduce((acc, row) => acc + row.conversionRounds, 0);
    expect(totalBreakRounds).toBe(totalConversionRounds);
    for (const row of insights.teamPistols) {
      expect(row.breakWins).toBeLessThanOrEqual(row.breakRounds);
    }
  });

  it("tracks first 5v4 and 5v3 round-state conversion opportunities", async () => {
    const pkg = await fixture;
    const insights = buildTournamentInsights([{ matchId: "m1", pkg }]);
    const expected = expectedManAdvantageRows(pkg);

    for (const row of expected) {
      const actual = insights.manAdvantageConversions.find(
        (candidate) => candidate.advantageAlive === row.advantageAlive && candidate.disadvantageAlive === row.disadvantageAlive
      );
      expect(actual).toBeDefined();
      expect(actual?.opportunities).toBe(row.opportunities);
      expect(actual?.advantageWins).toBe(row.advantageWins);
      expect(actual?.disadvantageWins).toBe(row.disadvantageWins);
      expect(actual?.advantageConversionPercent).toBe(
        row.opportunities > 0 ? Math.round((row.advantageWins / row.opportunities) * 1000) / 10 : null
      );
      expect(actual?.disadvantageConversionPercent).toBe(
        row.opportunities > 0 ? Math.round((row.disadvantageWins / row.opportunities) * 1000) / 10 : null
      );
    }

    for (const global of insights.manAdvantageConversions) {
      const teamStates = insights.teamManAdvantageConversions.flatMap((team) =>
        team.states.filter(
          (state) => state.advantageAlive === global.advantageAlive && state.disadvantageAlive === global.disadvantageAlive
        )
      );
      expect(teamStates.reduce((sum, state) => sum + state.advantageOpportunities, 0)).toBe(global.opportunities);
      expect(teamStates.reduce((sum, state) => sum + state.advantageWins, 0)).toBe(global.advantageWins);
      expect(teamStates.reduce((sum, state) => sum + state.disadvantageOpportunities, 0)).toBe(global.opportunities);
      expect(teamStates.reduce((sum, state) => sum + state.disadvantageWins, 0)).toBe(global.disadvantageWins);
    }

    const teamStateKeys = insights.teamEconomySummaries.flatMap((team) =>
      team.manAdvantage.states.map((state) => `${state.advantageAlive}:${state.disadvantageAlive}`)
    );
    expect(new Set(teamStateKeys)).toEqual(new Set(["5:4", "5:3"]));
    expect(teamStateKeys).not.toContain("4:5");
    expect(teamStateKeys).not.toContain("3:5");
  });

  it("builds team economy summaries with maps, round win rate and sample counts", async () => {
    const pkg = await fixture;
    const insights = buildTournamentInsights([{ matchId: "m1", pkg }]);
    const teamAName = pkg.match.teamA.name ?? "Team A";
    const teamBName = pkg.match.teamB.name ?? "Team B";

    const teamA = insights.teamEconomySummaries.find((row) => row.teamName === teamAName);
    const teamB = insights.teamEconomySummaries.find((row) => row.teamName === teamBName);
    expect(teamA).toBeDefined();
    expect(teamB).toBeDefined();
    expect(teamA?.maps).toBe(1);
    expect(teamB?.maps).toBe(1);
    expect(teamA?.rounds).toBe(pkg.rounds.length);
    expect(teamB?.rounds).toBe(pkg.rounds.length);
    expect((teamA?.roundWins ?? 0) + (teamB?.roundWins ?? 0)).toBe(pkg.rounds.length);
    expect(teamA!.pistol.rounds).toBe(teamA!.pistol.wins + teamB!.pistol.wins);
    expect(teamA!.pistol.winRatePercent).toBe(
      Math.round((teamA!.pistol.wins / teamA!.pistol.rounds) * 1000) / 10
    );
    if (teamA!.round2.conversionRounds > 0) {
      expect(teamA!.round2.conversionPercent).toBe(
        Math.round((teamA!.round2.conversionWins / teamA!.round2.conversionRounds) * 1000) / 10
      );
    }
    expect(teamA?.manAdvantage.states.length).toBeGreaterThan(0);
  });
});

function expectedManAdvantageRows(pkg: Awaited<typeof fixture>) {
  const targetPairs = new Map(["5:4", "5:3"].map((key) => [key, {
    advantageAlive: Number(key[0]),
    disadvantageAlive: Number(key[2]),
    opportunities: 0,
    advantageWins: 0,
    disadvantageWins: 0
  }]));
  const playersByTeam = {
    teamA: new Set(pkg.players.filter((player) => player.teamKey === "teamA").map((player) => player.steamId64)),
    teamB: new Set(pkg.players.filter((player) => player.teamKey === "teamB").map((player) => player.steamId64))
  };
  const killsByRound = new Map<number, typeof pkg.kills>();
  for (const kill of pkg.kills) {
    const rows = killsByRound.get(kill.roundNumber) ?? [];
    rows.push(kill);
    killsByRound.set(kill.roundNumber, rows);
  }

  for (const round of pkg.rounds) {
    const alive = {
      teamA: new Set(playersByTeam.teamA),
      teamB: new Set(playersByTeam.teamB)
    };
    const seen = new Set<string>();
    const kills = [...(killsByRound.get(round.roundNumber) ?? [])].sort((a, b) => a.tick - b.tick);
    for (const kill of kills) {
      const victimPlayer = pkg.players[kill.victimIndex];
      if (!victimPlayer) continue;
      alive[victimPlayer.teamKey].delete(victimPlayer.steamId64);
      const a = alive.teamA.size;
      const b = alive.teamB.size;
      const high = Math.max(a, b);
      const low = Math.min(a, b);
      const key = `${high}:${low}`;
      const row = targetPairs.get(key);
      if (!row || seen.has(key) || a === b) continue;
      seen.add(key);
      row.opportunities += 1;
      const advantageTeam = a > b ? "teamA" : "teamB";
      if (round.winnerTeamKey === advantageTeam) row.advantageWins += 1;
      else row.disadvantageWins += 1;
    }
  }
  return [...targetPairs.values()];
}

describe("buildMatchReportMarkdown", () => {
  it("renders a markdown report with scoreboard and rounds", async () => {
    const model = await workspaceFixture;
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
