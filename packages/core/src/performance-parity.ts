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
  policyDelta?: TeamkillParityPolicyDelta,
): void {
  const difference = expected - actual;
  if (Math.abs(difference) <= tolerance) return;
  if (policyDelta && policyDelta.delta !== 0 && Math.abs(difference - policyDelta.delta) <= tolerance) {
    mismatches.push({ playerIndex, playerName, field, expected, actual, comparable: false, reason: policyDelta.reason });
    return;
  }
  mismatches.push({ playerIndex, playerName, field, expected, actual });
}

type TeamkillParityField =
  | "kills"
  | "headshotCount"
  | "tradeKillCount"
  | "kastRounds"
  | "oneKillCount"
  | "twoKillCount"
  | "threeKillCount"
  | "fourKillCount"
  | "fiveKillCount"
  | "wallbangKillCount"
  | "noScopeKillCount"
  | "weaponKillTotal";

type MultiKillParityField = Extract<TeamkillParityField, "oneKillCount" | "twoKillCount" | "threeKillCount" | "fourKillCount" | "fiveKillCount">;

interface TeamkillParityPolicyDelta {
  delta: number;
  reason: string;
}

interface TeamkillFieldImpact {
  delta: number;
  rounds: Set<number>;
}

interface TeamkillParityImpact {
  fields: Map<TeamkillParityField, TeamkillFieldImpact>;
}

interface TeamkillRoundCounts {
  enemyKills: number;
  allPlayerKills: number;
  teamkillCount: number;
  headshotCount: number;
  tradeKillCount: number;
  noScopeKillCount: number;
  wallbangKillCount: number;
}

function playerRoundKey(playerIndex: number, roundNumber: number): string {
  return `${playerIndex}\u0000${roundNumber}`;
}

function killBucketField(kills: number): MultiKillParityField | null {
  if (kills === 1) return "oneKillCount";
  if (kills === 2) return "twoKillCount";
  if (kills === 3) return "threeKillCount";
  if (kills === 4) return "fourKillCount";
  if (kills >= 5) return "fiveKillCount";
  return null;
}

function addTeamkillDelta(
  impact: TeamkillParityImpact,
  field: TeamkillParityField,
  delta: number,
  roundNumber: number,
): void {
  if (delta === 0) return;
  const fieldImpact = impact.fields.get(field) ?? { delta: 0, rounds: new Set<number>() };
  fieldImpact.delta += delta;
  fieldImpact.rounds.add(roundNumber);
  impact.fields.set(field, fieldImpact);
}

function teamkillParityImpacts(
  pkg: DemoPackage,
  performanceFacts: PlayerRoundPerformanceFacts,
): Map<number, TeamkillParityImpact> {
  const roundsByPlayer = new Map<number, Map<number, TeamkillRoundCounts>>();
  for (const kill of pkg.kills) {
    if (kill.killerIndex === null || kill.killerIndex === kill.victimIndex) continue;
    const killer = pkg.players[kill.killerIndex];
    const victim = pkg.players[kill.victimIndex];
    if (!killer || !victim) continue;

    const playerRounds = roundsByPlayer.get(kill.killerIndex) ?? new Map<number, TeamkillRoundCounts>();
    const counts = playerRounds.get(kill.roundNumber) ?? {
      enemyKills: 0,
      allPlayerKills: 0,
      teamkillCount: 0,
      headshotCount: 0,
      tradeKillCount: 0,
      noScopeKillCount: 0,
      wallbangKillCount: 0,
    };
    counts.allPlayerKills += 1;
    if (killer.teamKey !== victim.teamKey) {
      counts.enemyKills += 1;
    } else {
      counts.teamkillCount += 1;
      if (kill.headshot) counts.headshotCount += 1;
      if (kill.tradeKill) counts.tradeKillCount += 1;
      if (kill.noScope) counts.noScopeKillCount += 1;
      if ((kill.penetratedObjects ?? 0) > 0) counts.wallbangKillCount += 1;
    }
    playerRounds.set(kill.roundNumber, counts);
    roundsByPlayer.set(kill.killerIndex, playerRounds);
  }

  const playerIndexBySteamId = new Map(pkg.players.map((player, index) => [player.steamId64, index]));
  const factsByPlayerRound = new Map<string, PlayerRoundPerformanceFacts["playerRounds"][number]>();
  for (const fact of performanceFacts.playerRounds) {
    const playerIndex = playerIndexBySteamId.get(fact.steamId64);
    if (playerIndex !== undefined) factsByPlayerRound.set(playerRoundKey(playerIndex, fact.roundNumber), fact);
  }

  const impacts = new Map<number, TeamkillParityImpact>();
  for (const [playerIndex, playerRounds] of roundsByPlayer) {
    const impact: TeamkillParityImpact = { fields: new Map() };
    for (const [roundNumber, counts] of playerRounds) {
      if (counts.teamkillCount === 0) continue;
      addTeamkillDelta(impact, "kills", counts.teamkillCount, roundNumber);
      addTeamkillDelta(impact, "headshotCount", counts.headshotCount, roundNumber);
      addTeamkillDelta(impact, "tradeKillCount", counts.tradeKillCount, roundNumber);
      addTeamkillDelta(impact, "noScopeKillCount", counts.noScopeKillCount, roundNumber);
      addTeamkillDelta(impact, "wallbangKillCount", counts.wallbangKillCount, roundNumber);
      addTeamkillDelta(impact, "weaponKillTotal", counts.teamkillCount, roundNumber);

      const frozenBucket = killBucketField(counts.allPlayerKills);
      const canonicalBucket = killBucketField(counts.enemyKills);
      if (frozenBucket !== canonicalBucket) {
        if (frozenBucket) addTeamkillDelta(impact, frozenBucket, 1, roundNumber);
        if (canonicalBucket) addTeamkillDelta(impact, canonicalBucket, -1, roundNumber);
      }

      const fact = factsByPlayerRound.get(playerRoundKey(playerIndex, roundNumber));
      if (fact && counts.allPlayerKills > 0 && fact.kills === 0 && fact.assists === 0 && !fact.survived && fact.tradedDeaths === 0) {
        addTeamkillDelta(impact, "kastRounds", 1, roundNumber);
      }
    }
    if (impact.fields.size > 0) impacts.set(playerIndex, impact);
  }
  return impacts;
}

function teamkillPolicyDelta(impact: TeamkillParityImpact | undefined, field: TeamkillParityField): TeamkillParityPolicyDelta | undefined {
  const fieldImpact = impact?.fields.get(field);
  if (!fieldImpact || fieldImpact.delta === 0) return undefined;
  const signedDelta = fieldImpact.delta > 0 ? `+${fieldImpact.delta}` : `${fieldImpact.delta}`;
  const rounds = [...fieldImpact.rounds].sort((a, b) => a - b).join(", ");
  return {
    delta: fieldImpact.delta,
    reason: `teamkill in round(s) ${rounds} contributes expected delta ${signedDelta} to ${field}; frozen playerStats includes all-player credit while dak-stable/3 keeps enemy-player credit`,
  };
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
  const teamkillImpacts = teamkillParityImpacts(pkg, performanceFacts);
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
    compare(mismatches, playerIndex, player.name, "kills", stats.kills, summary.kills, 0, teamkillPolicyDelta(teamkillImpact, "kills"));
    compare(mismatches, playerIndex, player.name, "deaths", stats.deaths, summary.deaths);
    compare(mismatches, playerIndex, player.name, "assists", stats.assists, summary.assists);
    compare(mismatches, playerIndex, player.name, "damageHealth", stats.damageHealth, summary.damage);
    compare(mismatches, playerIndex, player.name, "headshotCount", stats.headshotCount, summary.headshots, 0, teamkillPolicyDelta(teamkillImpact, "headshotCount"));
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
    compare(mismatches, playerIndex, player.name, "tradeKillCount", stats.tradeKillCount, summary.tradeKills, 0, teamkillPolicyDelta(teamkillImpact, "tradeKillCount"));
    compare(mismatches, playerIndex, player.name, "tradeDeathCount", stats.tradeDeathCount, summary.tradedDeaths);
    compare(mismatches, playerIndex, player.name, "combatDeathCount", stats.combatDeathCount, summary.combatDeaths);
    compare(mismatches, playerIndex, player.name, "bombDeathCount", stats.bombDeathCount, summary.bombDeaths);
    compare(mismatches, playerIndex, player.name, "kastRounds", stats.kastRounds, summary.kastRounds, 0, teamkillPolicyDelta(teamkillImpact, "kastRounds"));
    compare(mismatches, playerIndex, player.name, "flashAssistCount", stats.flashAssistCount, summary.utility.flashAssists);
    compare(mismatches, playerIndex, player.name, "utilityDamage", stats.utilityDamage, summary.utility.utilityDamage);
    compare(mismatches, playerIndex, player.name, "bombPlantCount", stats.bombPlantCount, summary.objective.plants);
    compare(mismatches, playerIndex, player.name, "bombDefuseCount", stats.bombDefuseCount, summary.objective.defuses);

    compare(mismatches, playerIndex, player.name, "oneKillCount", stats.oneKillCount, summary.oneKillRounds, 0, teamkillPolicyDelta(teamkillImpact, "oneKillCount"));
    compare(mismatches, playerIndex, player.name, "twoKillCount", stats.twoKillCount, summary.twoKillRounds, 0, teamkillPolicyDelta(teamkillImpact, "twoKillCount"));
    compare(mismatches, playerIndex, player.name, "threeKillCount", stats.threeKillCount, summary.threeKillRounds, 0, teamkillPolicyDelta(teamkillImpact, "threeKillCount"));
    compare(mismatches, playerIndex, player.name, "fourKillCount", stats.fourKillCount, summary.fourKillRounds, 0, teamkillPolicyDelta(teamkillImpact, "fourKillCount"));
    compare(mismatches, playerIndex, player.name, "fiveKillCount", stats.fiveKillCount, summary.fiveKillRounds, 0, teamkillPolicyDelta(teamkillImpact, "fiveKillCount"));

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

    compare(mismatches, playerIndex, player.name, "wallbangKillCount", stats.wallbangKillCount, summary.weapons.reduce((sum, row) => sum + row.wallbangKills, 0), 0, teamkillPolicyDelta(teamkillImpact, "wallbangKillCount"));
    compare(mismatches, playerIndex, player.name, "noScopeKillCount", stats.noScopeKillCount, summary.weapons.reduce((sum, row) => sum + row.noScopeKills, 0), 0, teamkillPolicyDelta(teamkillImpact, "noScopeKillCount"));
    compare(mismatches, playerIndex, player.name, "weaponKillTotal", stats.kills, summary.weapons.reduce((sum, row) => sum + row.kills, 0), 0, teamkillPolicyDelta(teamkillImpact, "weaponKillTotal"));
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
