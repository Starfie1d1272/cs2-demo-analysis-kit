import type { DemoPackage } from "@cs2dak/contract";
import type { IndicatorRatingResult, RRSignals, AccountRatingResult } from "@cs2dak/rating";
import { aggregatePlayerRoundPerformanceFacts, fieldAvailability, fieldConfidence, round, type PlayerRoundPerformanceFacts } from "@cs2dak/core";
import type { PlayerIndicatorRow, PlayerScoreboardRow } from "./models.js";

export function buildPlayerIndicators(pkg: DemoPackage, ratings: IndicatorRatingResult[]): PlayerIndicatorRow[] {
  return ratings.map((rating) => {
    const player = pkg.players.find((row) => row.steamId64 === rating.steamId64);
    return { ...rating, name: player?.name ?? rating.steamId64, teamKey: player?.teamKey ?? "teamA" };
  });
}

export function buildScoreboard(
  pkg: DemoPackage,
  rows: PlayerIndicatorRow[],
  accountRatings: Array<{ signals: RRSignals; rr: AccountRatingResult }>,
  performanceFacts: PlayerRoundPerformanceFacts,
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
