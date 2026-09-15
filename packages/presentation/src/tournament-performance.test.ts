import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  loadDemoPackageFromZip,
} from "@cs2dak/core";
import { buildSeasonCohort } from "@cs2dak/cohort";
import {
  buildTournamentPerformanceAnalyticsFromDemos,
  extractTournamentPerformanceMapFacts,
} from "./tournament-performance";
import { buildUtilityValueSummary } from "./insights";

const fixture = (async () => loadDemoPackageFromZip(await readFile(
  fileURLToPath(new URL("../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url))
)))();

describe("tournament performance adapter", () => {
  it("projects Core player-round, utility, clutch, objective and weapon facts", async () => {
    const pkg = await fixture;
    const input = { matchId: "m1", pkg };
    const facts = extractTournamentPerformanceMapFacts(input);
    const result = buildTournamentPerformanceAnalyticsFromDemos([input]);
    const cohort = buildSeasonCohort([input]);
    const utilitySummary = buildUtilityValueSummary([input], pkg.players.map((player) => ({
      playerKey: `steam:${player.steamId64}`,
      name: player.name,
      steamIds: [player.steamId64],
    })));

    expect(facts.playerRounds).toHaveLength(pkg.rounds.length * pkg.players.length);
    expect(facts.teamEntityKeys).toEqual({ teamA: "observed-team:m1:teamA", teamB: "observed-team:m1:teamB" });
    expect(result.totals).toMatchObject({ matchCount: 1, mapCount: 1, roundCount: pkg.rounds.length });
    expect(result.players).toHaveLength(pkg.players.length);
    expect(result.teams).toHaveLength(2);

    const performanceFacts = buildPlayerRoundPerformanceFacts(pkg);
    const performanceBySteamId = aggregatePlayerRoundPerformanceFacts(performanceFacts);
    // Cohort's RRIndicators remains a compatibility projection. The
    // tournament adapter itself must agree with the canonical Core facts.
    for (const packagePlayer of pkg.players) {
      const playerKey = `steam:${packagePlayer.steamId64}`;
      const actual = result.players.find((row) => row.player.entityKey === playerKey)!;
      const playerFacts = performanceFacts.playerRounds.filter((row) => row.steamId64 === packagePlayer.steamId64);
      const playerUtility = playerFacts.map((row) => row.utility);
      const expectedWeapons = performanceBySteamId.get(packagePlayer.steamId64)!;
      const headshotKills = expectedWeapons.weapons.reduce((sum, weapon) => sum + weapon.headshotKills, 0);
      const cohortRow = cohort.players.find((row) => row.playerKey === playerKey)!;
      const utilityRow = utilitySummary.players.find((row) => row.id === playerKey)!;

      expect(actual.slices.overall.sample.rounds).toBe(pkg.rounds.length);
      expect(actual.slices.overall.combat.kills).toBe(playerFacts.reduce((sum, row) => sum + row.kills, 0));
      expect(actual.slices.overall.combat.deaths).toBe(playerFacts.reduce((sum, row) => sum + row.deaths, 0));
      expect(actual.slices.overall.combat.assists).toBe(playerFacts.reduce((sum, row) => sum + row.assists, 0));
      expect(actual.slices.overall.combat.damage).toBe(playerFacts.reduce((sum, row) => sum + row.damage, 0));
      expect(actual.slices.overall.combat.kills).toBe(cohortRow.indicators.kills);
      expect(actual.slices.overall.combat.deaths).toBe(cohortRow.indicators.deaths);
      expect(actual.slices.overall.combat.headshots).toBe(headshotKills);
      expect(actual.slices.overall.kast.successes).toBe(playerFacts.filter((row) => row.kast).length);
      expect(actual.slices.overall.survival.successes).toBe(playerFacts.filter((row) => row.survived).length);
      expect(actual.slices.overall.utility.flashesThrown).toBe(playerUtility.reduce((sum, row) => sum + row.flashesThrown, 0));
      expect(actual.slices.overall.utility.enemyBlindVictims).toBe(playerUtility.reduce((sum, row) => sum + row.enemyBlindVictims, 0));
      expect(actual.slices.overall.utility.heDamage).toBe(playerUtility.reduce((sum, row) => sum + row.heDamage, 0));
      expect(actual.slices.overall.utility.fireDamage).toBe(playerUtility.reduce((sum, row) => sum + row.fireDamage, 0));
      expect(actual.slices.overall.utility.smokesThrown).toBe(playerUtility.reduce((sum, row) => sum + row.smokesThrown, 0));
      expect(actual.slices.overall.utility.utilityDamage).toBe(cohortRow.indicators.utilityDamage);
      expect(actual.slices.overall.utility.flashAssists).toBe(cohortRow.indicators.flashAssistCount);
      expect(actual.slices.overall.utility.flashesThrown).toBe(utilityRow.flashesThrown);
      expect(Math.round(actual.slices.overall.utility.enemyBlindSeconds * 10) / 10).toBe(utilityRow.enemyBlindSeconds);
      expect(actual.slices.overall.utility.heDamage).toBe(utilityRow.heDamage);
      expect(actual.slices.overall.utility.fireDamage).toBe(utilityRow.fireDamage);
      expect(actual.slices.overall.opening.firstKills).toBe(cohortRow.indicators.firstKillCount);
      expect(actual.slices.overall.opening.firstDeaths).toBe(cohortRow.indicators.firstDeathCount);
      expect(actual.slices.overall.trade.tradeKills).toBe(cohortRow.indicators.tradeKillCount);
      expect(actual.slices.overall.trade.tradedDeaths).toBe(cohortRow.indicators.tradeDeathCount);
      expect(actual.slices.overall.clutch.attempts).toBe(cohortRow.indicators.clutchAttempts);
      expect(actual.slices.overall.clutch.wins).toBe(cohortRow.indicators.clutchWins);
      expect(actual.weapons.map((row) => [row.weapon, row.kills, row.headshotKills])).toEqual(
        [...expectedWeapons.weapons]
          .sort((a, b) => b.kills - a.kills || a.weapon.localeCompare(b.weapon))
          .map((row) => [row.weapon, row.kills, row.headshotKills]),
      );
    }

    const planted = pkg.bombs.filter((row) => row.type === "planted").length;
    const defused = pkg.bombs.filter((row) => row.type === "defused").length;
    expect(result.totals.objective.plants).toBe(planted);
    expect(result.totals.objective.defuses).toBe(defused);
  });

  it("uses consumer-owned identities without changing frozen metric counts", async () => {
    const pkg = await fixture;
    const input = { matchId: "m1", pkg };
    const result = buildTournamentPerformanceAnalyticsFromDemos([input], {
      teamEntityKeys: { teamA: "entry-a", teamB: "entry-b" },
      playerEntityKeys: Object.fromEntries(pkg.players.map((player, index) => [player.steamId64, `user-${index}`])),
      labels: { teams: { "entry-a": "Canonical A" } },
    });

    expect(result.teams.map((row) => row.team.entityKey)).toEqual(["entry-a", "entry-b"]);
    expect(result.teams[0]?.team.displayName).toBe("Canonical A");
    expect(result.players.every((row) => row.player.entityKey.startsWith("user-"))).toBe(true);
    expect(result.totals.roundCount).toBe(pkg.rounds.length);
  });
});
