import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildPlayerRoundPerformanceFacts } from "./performance-facts.js";
import { loadDemoPackageFromZip } from "./loader.js";
import { buildPlayerRoundFacts } from "./scoreboard.js";
import { buildPlayerRoundUtilityFacts } from "./utility-facts.js";

const fixture = async () => loadDemoPackageFromZip(await readFile(fileURLToPath(
  new URL("../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url)
)));

describe("buildPlayerRoundUtilityFacts", () => {
  it("owns the per-round utility values consumed by PlayerRoundFact", async () => {
    const pkg = await fixture();
    const utilityFacts = buildPlayerRoundUtilityFacts(pkg);
    const playerRounds = buildPlayerRoundFacts(pkg);

    expect(utilityFacts).toHaveLength(pkg.rounds.length * pkg.players.length);
    const byKey = new Map(utilityFacts.map((fact) => [`${fact.roundNumber}:${fact.steamId64}`, fact]));
    for (const playerRound of playerRounds) {
      const utility = byKey.get(`${playerRound.roundNumber}:${playerRound.steamId64}`);
      expect(utility).toBeDefined();
      expect(playerRound.utilityDamage).toBe(utility?.utilityDamage);
      expect(playerRound.flashAssists).toBe(utility?.flashAssists);
    }

    for (const stats of pkg.playerStats) {
      const steamId64 = pkg.players[stats.playerIndex]!.steamId64;
      const totals = utilityFacts
        .filter((fact) => fact.steamId64 === steamId64)
        .reduce((sum, fact) => ({
          enemyBlindSeconds: sum.enemyBlindSeconds + fact.enemyBlindSeconds,
          teamBlindSeconds: sum.teamBlindSeconds + fact.teamBlindSeconds,
          flashAssists: sum.flashAssists + fact.flashAssists,
        }), { enemyBlindSeconds: 0, teamBlindSeconds: 0, flashAssists: 0 });
      expect(totals.enemyBlindSeconds).toBeCloseTo(stats.enemyFlashDurationSeconds, 3);
      expect(totals.teamBlindSeconds).toBeCloseTo(stats.teamFlashDurationSeconds, 3);
      expect(totals.flashAssists).toBe(stats.flashAssistCount);
    }
  });

  it("projects utility damage from the canonical full round damage stream", async () => {
    const pkg = await fixture();
    const firstRound = pkg.rounds[0]!;
    const sourceDamage = pkg.damages.find((row) => row.weapon === "hegrenade");
    expect(sourceDamage).toBeDefined();
    if (!sourceDamage || sourceDamage.attackerIndex === null) return;
    const attackerSteamId64 = pkg.players[sourceDamage.attackerIndex]?.steamId64;
    const withFreezeDamage = {
      ...pkg,
      damages: [...pkg.damages, { ...sourceDamage, roundNumber: firstRound.roundNumber, tick: firstRound.freezeEndTick - 1, healthDamage: 7 }],
    };
    const baseline = buildPlayerRoundPerformanceFacts(pkg);
    const baselineRound = baseline.playerRounds.find((row) => row.roundNumber === firstRound.roundNumber && row.steamId64 === attackerSteamId64)!;
    const actualPerformance = buildPlayerRoundPerformanceFacts(withFreezeDamage);
    const actualRound = actualPerformance.playerRounds.find((row) => row.roundNumber === firstRound.roundNumber && row.steamId64 === attackerSteamId64)!;
    const actual = buildPlayerRoundUtilityFacts(withFreezeDamage);

    expect(actualRound.damage - baselineRound.damage).toBe(7);
    expect(actualRound.utility.utilityDamage - baselineRound.utility.utilityDamage).toBe(7);
    expect(actual.find((row) => row.roundNumber === firstRound.roundNumber && row.steamId64 === baselineRound.steamId64)?.utilityDamage)
      .toBe(baselineRound.utility.utilityDamage + 7);
  });
});
