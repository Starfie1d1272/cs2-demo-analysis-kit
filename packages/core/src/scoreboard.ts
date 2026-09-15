import {
  computeRR,
  computePrism,
  hltv2BaselineWeightsV1,
  prismWeightsV1,
  rrToPercentile,
  type RRResult,
  type RRWeights,
  type PrismWeights,
  type PrismComputeInput
} from "@rivalhub/rival-rating";
import type {
  DemoPackage,
  PlayerIndicatorRow,
  PlayerRoundFact,
  PlayerScoreboardRow,
  RRIndicators
} from "@cs2dak/contract";
import type { RRSignals } from "@rivalhub/rival-rating";
import type { AccountRatingResult } from "./signals.js";
import { normalizeDemoPackage } from "./normalize.js";
import {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  emptyPlayerPerformanceAggregate,
  toPlayerRoundFacts,
  type PlayerRoundPerformanceFacts,
} from "./performance-facts.js";
import { round } from "./utils.js";
import { fieldAvailability, fieldConfidence } from "./qa.js";

export function deriveRRIndicators(input: unknown, performanceFacts?: PlayerRoundPerformanceFacts): RRIndicators[] {
  const pkg = normalizeDemoPackage(input);
  const facts = performanceFacts ?? buildPlayerRoundPerformanceFacts(pkg);
  return buildPlayerIndicators(pkg, facts).map((row) => row.indicators);
}

/** Backwards-compatible 1.0 projection from the single Core performance owner. */
export function buildPlayerRoundFacts(
  pkg: DemoPackage,
  performanceFacts: PlayerRoundPerformanceFacts = buildPlayerRoundPerformanceFacts(pkg),
): PlayerRoundFact[] {
  return toPlayerRoundFacts(performanceFacts);
}

export function buildPlayerIndicators(pkg: DemoPackage, performanceFacts: PlayerRoundPerformanceFacts): PlayerIndicatorRow[] {
  const summaries = aggregatePlayerRoundPerformanceFacts(performanceFacts);

  const indicators = pkg.players.map((player, playerIndex) => {
    const summary = summaries.get(player.steamId64) ?? emptyPlayerPerformanceAggregate(player);
    const playerEconomies = (pkg.playerEconomies ?? []).filter((row) => row.playerIndex === playerIndex);
    const totalRounds = Math.max(summary.rounds, 1);
    const openingDuels = summary.firstKills + summary.firstDeaths;
    const awpKills = summary.weapons.filter((weapon) => weapon.weapon === "awp").reduce((sum, weapon) => sum + weapon.kills, 0);
    const sniperKills = summary.weapons
      .filter((weapon) => ["awp", "ssg08", "scout"].includes(weapon.weapon))
      .reduce((sum, weapon) => sum + weapon.kills, 0);
    const clutchScore = [1, 2, 3, 4, 5].reduce((sum, count) => sum + (summary.clutch.byOpponentCount[String(count) as "1" | "2" | "3" | "4" | "5"]?.wins ?? 0) * count, 0);
    const multiKillRounds = summary.twoKillRounds + summary.threeKillRounds + summary.fourKillRounds + summary.fiveKillRounds;
    const playerRoundStats = (count: 1 | 2 | 3 | 4 | 5) => summary.clutch.byOpponentCount[String(count) as "1" | "2" | "3" | "4" | "5"];

    return {
      steamId64: player.steamId64,
      totalRounds,
      kills: summary.kills,
      deaths: summary.deaths,
      assists: summary.assists,
      kpr: round(summary.kills / totalRounds, 4),
      dpr: round(summary.deaths / totalRounds, 4),
      apr: round(summary.assists / totalRounds, 4),
      adr: round(summary.damage / totalRounds, 2),
      hsPercent: summary.kills > 0 ? round((summary.headshots / summary.kills) * 100, 2) : 0,
      kast: round((summary.kastRounds / totalRounds) * 100, 2),
      survivalRate: round(summary.survivalRounds / totalRounds, 4),
      twoKillRounds: summary.twoKillRounds,
      threeKillRounds: summary.threeKillRounds,
      fourKillRounds: summary.fourKillRounds,
      fiveKillRounds: summary.fiveKillRounds,
      multiKillRate: round(multiKillRounds / totalRounds, 4),
      firstKillCount: summary.firstKills,
      firstDeathCount: summary.firstDeaths,
      firstKillRate: round(summary.firstKills / totalRounds, 4),
      firstDeathRate: round(summary.firstDeaths / totalRounds, 4),
      openingDuelRate: round(openingDuels / totalRounds, 4),
      openingDuelWinRate: openingDuels > 0 ? round(summary.firstKills / openingDuels, 4) : 0,
      tradeKillCount: summary.tradeKills,
      tradeDeathCount: summary.tradedDeaths,
      tradeKillRate: round(summary.tradeKills / totalRounds, 4),
      tradeDeathRate: summary.deaths > 0 ? round(summary.tradedDeaths / summary.deaths, 4) : 0,
      clutchAttempts: summary.clutch.attempts,
      clutchWins: summary.clutch.wins,
      clutchWinRate: summary.clutch.attempts > 0 ? round(summary.clutch.wins / summary.clutch.attempts, 4) : 0,
      clutchFrequency: round(summary.clutch.attempts / totalRounds, 4),
      clutchScore,
      clutchScoreRate: round(clutchScore / totalRounds, 4),
      vsOne: { count: playerRoundStats(1).attempts, won: playerRoundStats(1).wins },
      vsTwo: { count: playerRoundStats(2).attempts, won: playerRoundStats(2).wins },
      vsThree: { count: playerRoundStats(3).attempts, won: playerRoundStats(3).wins },
      vsFour: { count: playerRoundStats(4).attempts, won: playerRoundStats(4).wins },
      vsFive: { count: playerRoundStats(5).attempts, won: playerRoundStats(5).wins },
      awpKills,
      awpKillsPerRound: round(awpKills / totalRounds, 4),
      awpKillRate: summary.kills > 0 ? round(awpKills / summary.kills, 4) : 0,
      sniperKills,
      sniperKillRate: summary.kills > 0 ? round(sniperKills / summary.kills, 4) : 0,
      awpMultiKillRate: null,
      awpDuelWinRate: null,
      utilityDamage: summary.utility.utilityDamage,
      utilityDamagePerRound: round(summary.utility.utilityDamage / totalRounds, 2),
      flashAssistCount: summary.utility.flashAssists,
      flashAssistPerRound: round(summary.utility.flashAssists / totalRounds, 4),
      blindDurationTotal: round(summary.utility.enemyBlindSeconds, 2),
      blindDurationPerRound: round(summary.utility.enemyBlindSeconds / totalRounds, 2),
      enemyFlashDurationSeconds: round(summary.utility.enemyBlindSeconds, 2),
      enemyFlashDurationPerRound: round(summary.utility.enemyBlindSeconds / totalRounds, 2),
      teamFlashDurationSeconds: round(summary.utility.teamBlindSeconds, 2),
      teamFlashDurationPerRound: round(summary.utility.teamBlindSeconds / totalRounds, 2),
      grenadeCount: summary.utility.grenadesThrown,
      grenadeCountPerRound: round(summary.utility.grenadesThrown / totalRounds, 4),
      ecoRoundCount: playerEconomies.filter((row) => row.type === "eco").length,
      forceRoundCount: playerEconomies.filter((row) => row.type === "force").length,
      fullBuyRoundCount: playerEconomies.filter((row) => row.type === "full").length,
      pistolRoundCount: playerEconomies.filter((row) => row.type === "pistol").length,
      avgEquipmentValue: playerEconomies.length > 0 ? round(playerEconomies.reduce((sum, row) => sum + row.equipmentValue, 0) / playerEconomies.length, 2) : 0,
      combatDeathCount: summary.combatDeaths,
      bombDeathCount: summary.bombDeaths,
      wallbangKillCount: summary.weapons.reduce((sum, weapon) => sum + weapon.wallbangKills, 0),
      roundSwingTotal: null,
      roundSwingPerKill: null
    } satisfies RRIndicators;
  });

  const rrWeights = hltv2BaselineWeightsV1 as unknown as RRWeights;
  const prismWeights = prismWeightsV1 as unknown as PrismWeights;
  const rrResults = indicators.map((indicator) => computeRR(indicator, rrWeights));
  const rrScores = rrResults.map((result) => result.rr);
  const prismInputs: PrismComputeInput[] = indicators.map((indicator, index) => ({
    indicators: indicator,
    mapCount: 1,
    rrPercentile: round(rrToPercentile(rrScores, rrResults[index]?.rr ?? 1), 1)
  }));
  const prismResults = computePrism(prismInputs, prismWeights);

  return indicators.map((indicator, index) => {
    const player = pkg.players.find((row) => row.steamId64 === indicator.steamId64);
    return {
      steamId64: indicator.steamId64,
      name: player?.name ?? indicator.steamId64,
      teamKey: player?.teamKey ?? "teamA",
      indicators: indicator,
      rr: rrResults[index] ?? zeroRR(rrWeights.version),
      rrPercentile: prismInputs[index]?.rrPercentile ?? 50,
      prism: prismResults.find((result) => result.steamId64 === indicator.steamId64) ?? null
    };
  });
}

export function buildScoreboard(
  pkg: DemoPackage,
  rows: PlayerIndicatorRow[],
  accountRatings: Array<{ signals: RRSignals; rr: AccountRatingResult }>,
  performanceFacts: PlayerRoundPerformanceFacts = buildPlayerRoundPerformanceFacts(pkg),
): PlayerScoreboardRow[] {
  const performanceBySteamId = aggregatePlayerRoundPerformanceFacts(performanceFacts);
  const playerIndexBySteamId = new Map(pkg.players.map((player, index) => [player.steamId64, index]));
  const playerStatsByIndex = new Map((pkg.playerStats ?? []).map((stats) => [stats.playerIndex, stats]));
  const accountBySteamId = new Map(accountRatings.map((row) => [row.signals.steamId64, row]));
  const availability = fieldAvailability(pkg);
  const confidence = fieldConfidence(availability);
  return rows.map((row) => {
    const summary = performanceBySteamId.get(row.steamId64);
    if (!summary) throw new Error(`Core performance summary missing for ${row.steamId64}`);
    const account = accountBySteamId.get(row.steamId64);
    const accountRr = account?.rr;
    const combatSignals = account?.signals.combat;
    const playerIdx = playerIndexBySteamId.get(row.steamId64);
    return {
      steamId64: row.steamId64,
      name: row.name,
      teamKey: row.teamKey,
      indicators: row.indicators,
      kills: row.indicators.kills,
      deaths: row.indicators.deaths,
      assists: row.indicators.assists,
      adr: round(row.indicators.adr, 1),
      kast: round(row.indicators.kast, 1),
      headshotPercent: round(row.indicators.hsPercent, 1),
      entryKills: row.indicators.firstKillCount,
      tradeKills: row.indicators.tradeKillCount,
      awpKills: row.indicators.awpKills,
      utilityDamage: row.indicators.utilityDamage,
      combatDeathCount: row.indicators.combatDeathCount,
      bombDeathCount: row.indicators.bombDeathCount,
      wallbangKillCount: row.indicators.wallbangKillCount,
      noScopeKillCount: summary.weapons.reduce((sum, weapon) => sum + weapon.noScopeKills, 0),
      throughSmokeKillCount: summary.weapons.reduce((sum, weapon) => sum + weapon.throughSmokeKills, 0),
      collateralKillCount: playerIdx == null ? null : playerStatsByIndex.get(playerIdx)?.collateralKillCount ?? null,
      bombPlantCount: summary.objective.plants,
      bombDefuseCount: summary.objective.defuses,
      confidence,
      fieldAvailability: availability,
      ratingSeed: round(row.rr.rrBase, 2),
      rr: round(row.rr.rr, 2),
      rrPercentile: round(row.rrPercentile, 1),
      accountRR: round(accountRr?.rr ?? 0, 3),
      accountRRRaw: round(accountRr?.rrRaw ?? 0, 3),
      accountCombatContextFactor: round(accountRr?.combatContextFactor ?? 1, 3),
      accountBreakdown: {
        combat: round(accountRr?.accounts.combat ?? 0, 4),
        trade: round(accountRr?.accounts.trade ?? 0, 4),
        mapControl: round(accountRr?.accounts.mapControl ?? 0, 4),
        clutch: round(accountRr?.accounts.clutch ?? 0, 4),
        objective: round(accountRr?.accounts.objective ?? 0, 4),
        utility: round(accountRr?.accounts.utility ?? 0, 4)
      },
      accountContextStatus: {
        buyDelta: (combatSignals?.killsByBuyDelta == null ? "missing" : "available") as "available" | "missing",
        manState: (combatSignals?.killsByManState == null ? "missing" : "available") as "available" | "missing"
      }
    };
  }).sort((a, b) => b.accountRR - a.accountRR || b.rr - a.rr || b.adr - a.adr);
}

function zeroRR(version: string): RRResult {
  return {
    rr: 1,
    rrBase: 1,
    rrSwing: 0,
    weightsVersion: version,
    breakdown: {
      kastTerm: 0,
      kprTerm: 0,
      dprTerm: 0,
      impactTerm: 0,
      adrTerm: 0,
      intercept: 0
    }
  };
}
