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
  nonComparableReason?: string,
): void {
  if (nonComparableReason) {
    mismatches.push({ playerIndex, playerName, field, expected, actual, comparable: false, reason: nonComparableReason });
    return;
  }
  if (Math.abs(expected - actual) > tolerance) mismatches.push({ playerIndex, playerName, field, expected, actual });
}

interface TeamkillParityImpact {
  rounds: Set<number>;
  any: boolean;
  headshot: boolean;
  trade: boolean;
  noScope: boolean;
  wallbang: boolean;
}

function teamkillParityImpacts(pkg: DemoPackage): Map<number, TeamkillParityImpact> {
  const impacts = new Map<number, TeamkillParityImpact>();
  for (const kill of pkg.kills) {
    if (kill.killerIndex === null || kill.killerIndex === kill.victimIndex) continue;
    const killer = pkg.players[kill.killerIndex];
    const victim = pkg.players[kill.victimIndex];
    if (!killer || !victim || killer.teamKey !== victim.teamKey) continue;
    const impact = impacts.get(kill.killerIndex) ?? {
      rounds: new Set<number>(),
      any: false,
      headshot: false,
      trade: false,
      noScope: false,
      wallbang: false,
    };
    impact.rounds.add(kill.roundNumber);
    impact.any = true;
    impact.headshot ||= kill.headshot;
    impact.trade ||= kill.tradeKill;
    impact.noScope ||= kill.noScope;
    impact.wallbang ||= (kill.penetratedObjects ?? 0) > 0;
    impacts.set(kill.killerIndex, impact);
  }
  return impacts;
}

function teamkillReason(impact: TeamkillParityImpact | undefined, field: string, kind: keyof Omit<TeamkillParityImpact, "rounds"> = "any"): string | undefined {
  if (!impact?.[kind]) return undefined;
  const rounds = [...impact.rounds].sort((a, b) => a - b).join(", ");
  return `teamkill in round(s) ${rounds} is included by frozen playerStats but excluded from dak-stable/3 ${field} enemy-player credit`;
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
  const teamkillImpacts = teamkillParityImpacts(pkg);
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
    const teamkillImpact = teamkillImpacts.get(playerIndex);

    compare(mismatches, playerIndex, player.name, "rounds", stats.rounds, summary.rounds);
    compare(mismatches, playerIndex, player.name, "kills", stats.kills, summary.kills, 0, teamkillReason(teamkillImpact, "kills"));
    compare(mismatches, playerIndex, player.name, "deaths", stats.deaths, summary.deaths);
    compare(mismatches, playerIndex, player.name, "assists", stats.assists, summary.assists);
    compare(mismatches, playerIndex, player.name, "damageHealth", stats.damageHealth, summary.damage);
    compare(mismatches, playerIndex, player.name, "headshotCount", stats.headshotCount, summary.headshots, 0, teamkillReason(teamkillImpact, "headshotCount", "headshot"));
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
    compare(mismatches, playerIndex, player.name, "tradeKillCount", stats.tradeKillCount, summary.tradeKills, 0, teamkillReason(teamkillImpact, "tradeKillCount", "trade"));
    compare(mismatches, playerIndex, player.name, "tradeDeathCount", stats.tradeDeathCount, summary.tradedDeaths);
    compare(mismatches, playerIndex, player.name, "combatDeathCount", stats.combatDeathCount, summary.combatDeaths);
    compare(mismatches, playerIndex, player.name, "bombDeathCount", stats.bombDeathCount, summary.bombDeaths);
    compare(mismatches, playerIndex, player.name, "kastRounds", stats.kastRounds, summary.kastRounds, 0, teamkillReason(teamkillImpact, "kastRounds"));
    compare(mismatches, playerIndex, player.name, "flashAssistCount", stats.flashAssistCount, summary.utility.flashAssists);
    compare(mismatches, playerIndex, player.name, "utilityDamage", stats.utilityDamage, summary.utility.utilityDamage);
    compare(mismatches, playerIndex, player.name, "bombPlantCount", stats.bombPlantCount, summary.objective.plants);
    compare(mismatches, playerIndex, player.name, "bombDefuseCount", stats.bombDefuseCount, summary.objective.defuses);

    compare(mismatches, playerIndex, player.name, "oneKillCount", stats.oneKillCount, summary.oneKillRounds, 0, teamkillReason(teamkillImpact, "oneKillCount"));
    compare(mismatches, playerIndex, player.name, "twoKillCount", stats.twoKillCount, summary.twoKillRounds, 0, teamkillReason(teamkillImpact, "twoKillCount"));
    compare(mismatches, playerIndex, player.name, "threeKillCount", stats.threeKillCount, summary.threeKillRounds, 0, teamkillReason(teamkillImpact, "threeKillCount"));
    compare(mismatches, playerIndex, player.name, "fourKillCount", stats.fourKillCount, summary.fourKillRounds, 0, teamkillReason(teamkillImpact, "fourKillCount"));
    compare(mismatches, playerIndex, player.name, "fiveKillCount", stats.fiveKillCount, summary.fiveKillRounds, 0, teamkillReason(teamkillImpact, "fiveKillCount"));

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

    compare(mismatches, playerIndex, player.name, "wallbangKillCount", stats.wallbangKillCount, summary.weapons.reduce((sum, row) => sum + row.wallbangKills, 0), 0, teamkillReason(teamkillImpact, "wallbangKillCount", "wallbang"));
    compare(mismatches, playerIndex, player.name, "noScopeKillCount", stats.noScopeKillCount, summary.weapons.reduce((sum, row) => sum + row.noScopeKills, 0), 0, teamkillReason(teamkillImpact, "noScopeKillCount", "noScope"));
    compare(mismatches, playerIndex, player.name, "weaponKillTotal", stats.kills, summary.weapons.reduce((sum, row) => sum + row.kills, 0), 0, teamkillReason(teamkillImpact, "weaponKillTotal"));
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
