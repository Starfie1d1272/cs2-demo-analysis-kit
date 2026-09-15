import type { DemoPackage } from "@cs2dak/contract";
import {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  type PlayerPerformanceAggregate,
  type PlayerRoundPerformanceFacts,
} from "./performance-facts.js";

export interface PlayerStatsParityMismatch {
  playerIndex: number;
  playerName: string;
  field: string;
  expected: number;
  actual: number;
  /** False means the two sources intentionally use different semantics. */
  comparable?: boolean;
  reason?: string;
}

function compare(
  mismatches: PlayerStatsParityMismatch[],
  playerIndex: number,
  playerName: string,
  field: string,
  expected: number,
  actual: number,
  tolerance = 0,
): void {
  if (Math.abs(expected - actual) > tolerance) mismatches.push({ playerIndex, playerName, field, expected, actual });
}

function clutchCount(summary: PlayerPerformanceAggregate, count: 1 | 2 | 3 | 4 | 5): number {
  return summary.clutch.byOpponentCount[String(count) as "1" | "2" | "3" | "4" | "5"].attempts;
}

function clutchWins(summary: PlayerPerformanceAggregate, count: 1 | 2 | 3 | 4 | 5): number {
  return summary.clutch.byOpponentCount[String(count) as "1" | "2" | "3" | "4" | "5"].wins;
}

/**
 * Compare Core's canonical performance owner with the frozen v3 aggregate
 * oracle. This is a validator, never a fallback path for production facts.
 */
export function findPlayerStatsParityMismatches(
  pkg: DemoPackage,
  performanceFacts: PlayerRoundPerformanceFacts = buildPlayerRoundPerformanceFacts(pkg),
): PlayerStatsParityMismatch[] {
  const summaries = aggregatePlayerRoundPerformanceFacts(performanceFacts);
  const statsByPlayerIndex = new Map(pkg.playerStats.map((row) => [row.playerIndex, row]));
  const mismatches: PlayerStatsParityMismatch[] = [];
  const nonComparableOpeningRounds = performanceFacts.openingParity?.nonComparableRounds ?? [];
  const openingParityComparable = nonComparableOpeningRounds.length === 0;
  const openingParityReason = nonComparableOpeningRounds.length > 0
    ? `rounds ${nonComparableOpeningRounds.join(", ")} contain a world death, suicide, or teamkill before the first enemy-player kill`
    : null;

  for (const [playerIndex, player] of pkg.players.entries()) {
    const stats = statsByPlayerIndex.get(playerIndex);
    const summary = summaries.get(player.steamId64);
    if (!stats || !summary) {
      mismatches.push({ playerIndex, playerName: player.name, field: "playerStats.row", expected: 1, actual: 0 });
      continue;
    }

    compare(mismatches, playerIndex, player.name, "rounds", stats.rounds, summary.rounds);
    compare(mismatches, playerIndex, player.name, "kills", stats.kills, summary.kills);
    compare(mismatches, playerIndex, player.name, "deaths", stats.deaths, summary.deaths);
    compare(mismatches, playerIndex, player.name, "assists", stats.assists, summary.assists);
    compare(mismatches, playerIndex, player.name, "damageHealth", stats.damageHealth, summary.damage);
    compare(mismatches, playerIndex, player.name, "headshotCount", stats.headshotCount, summary.headshots);
    if (openingParityComparable) {
      compare(mismatches, playerIndex, player.name, "firstKillCount", stats.firstKillCount, summary.firstKills);
      compare(mismatches, playerIndex, player.name, "firstDeathCount", stats.firstDeathCount, summary.firstDeaths);
    } else {
      mismatches.push({
        playerIndex,
        playerName: player.name,
        field: "firstKillCount",
        expected: stats.firstKillCount,
        actual: summary.firstKills,
        comparable: false,
        reason: openingParityReason ?? undefined,
      });
      mismatches.push({
        playerIndex,
        playerName: player.name,
        field: "firstDeathCount",
        expected: stats.firstDeathCount,
        actual: summary.firstDeaths,
        comparable: false,
        reason: openingParityReason ?? undefined,
      });
    }
    compare(mismatches, playerIndex, player.name, "tradeKillCount", stats.tradeKillCount, summary.tradeKills);
    compare(mismatches, playerIndex, player.name, "tradeDeathCount", stats.tradeDeathCount, summary.tradedDeaths);
    compare(mismatches, playerIndex, player.name, "combatDeathCount", stats.combatDeathCount, summary.combatDeaths);
    compare(mismatches, playerIndex, player.name, "bombDeathCount", stats.bombDeathCount, summary.bombDeaths);
    compare(mismatches, playerIndex, player.name, "kastRounds", stats.kastRounds, summary.kastRounds);
    compare(mismatches, playerIndex, player.name, "flashAssistCount", stats.flashAssistCount, summary.utility.flashAssists);
    compare(mismatches, playerIndex, player.name, "utilityDamage", stats.utilityDamage, summary.utility.utilityDamage);
    compare(mismatches, playerIndex, player.name, "bombPlantCount", stats.bombPlantCount, summary.objective.plants);
    compare(mismatches, playerIndex, player.name, "bombDefuseCount", stats.bombDefuseCount, summary.objective.defuses);

    compare(mismatches, playerIndex, player.name, "oneKillCount", stats.oneKillCount, summary.oneKillRounds);
    compare(mismatches, playerIndex, player.name, "twoKillCount", stats.twoKillCount, summary.twoKillRounds);
    compare(mismatches, playerIndex, player.name, "threeKillCount", stats.threeKillCount, summary.threeKillRounds);
    compare(mismatches, playerIndex, player.name, "fourKillCount", stats.fourKillCount, summary.fourKillRounds);
    compare(mismatches, playerIndex, player.name, "fiveKillCount", stats.fiveKillCount, summary.fiveKillRounds);

    for (const [countKey, wonKey, count] of [
      ["vsOneCount", "vsOneWonCount", 1],
      ["vsTwoCount", "vsTwoWonCount", 2],
      ["vsThreeCount", "vsThreeWonCount", 3],
      ["vsFourCount", "vsFourWonCount", 4],
      ["vsFiveCount", "vsFiveWonCount", 5],
    ] as const) {
      compare(mismatches, playerIndex, player.name, countKey, stats[countKey], clutchCount(summary, count));
      compare(mismatches, playerIndex, player.name, wonKey, stats[wonKey], clutchWins(summary, count));
    }

    compare(mismatches, playerIndex, player.name, "wallbangKillCount", stats.wallbangKillCount, summary.weapons.reduce((sum, row) => sum + row.wallbangKills, 0));
    compare(mismatches, playerIndex, player.name, "noScopeKillCount", stats.noScopeKillCount, summary.weapons.reduce((sum, row) => sum + row.noScopeKills, 0));
    compare(mismatches, playerIndex, player.name, "weaponKillTotal", stats.kills, summary.weapons.reduce((sum, row) => sum + row.kills, 0));
    compare(mismatches, playerIndex, player.name, "enemyFlashDurationSeconds", stats.enemyFlashDurationSeconds, summary.utility.enemyBlindSeconds, 1e-6);
    compare(mismatches, playerIndex, player.name, "teamFlashDurationSeconds", stats.teamFlashDurationSeconds, summary.utility.teamBlindSeconds, 1e-6);
  }

  return mismatches;
}

export function assertPlayerStatsParity(
  pkg: DemoPackage,
  performanceFacts?: PlayerRoundPerformanceFacts,
): void {
  const mismatches = findPlayerStatsParityMismatches(pkg, performanceFacts).filter((mismatch) => mismatch.comparable !== false);
  if (mismatches.length === 0) return;
  const details = mismatches
    .map((row) => `${row.playerName}[${row.playerIndex}].${row.field}: expected=${row.expected}, actual=${row.actual}`)
    .join("; ");
  throw new Error(`Core performance parity failed (${mismatches.length} mismatches): ${details}`);
}
