import { loadSpatialAssets, buildOfficialMapControl } from '@cs2dak/tactics';
import type { DemoPackage } from '@cs2dak/contract';
import type { RRSignals, RRIndicators } from '@cs2dak/rating';
import {
  aggregatePlayerRoundPerformanceFacts,
  emptyPlayerPerformanceAggregate,
  round,
  getOrInit,
  type PlayerPerformanceAggregate,
  type PlayerRoundManStateFact,
  type PlayerRoundPerformanceFact,
  type PlayerRoundPerformanceFacts,
} from '@cs2dak/core';

type BuyDeltaBuckets = NonNullable<RRSignals['combat']['killsByBuyDelta']>;
type ManStateBuckets = NonNullable<RRSignals['combat']['killsByManState']>;
type ObjectiveBuckets = RRSignals['objective'];
type UtilityBuckets = RRSignals['utility'];

const BUY_DELTA_EVEN_THRESHOLD = 1000;

export interface RatingSpatialContext {
  observable: boolean;
  strategicIsolationDeaths: ReadonlyMap<string, number>;
}

/** Compute the spatial inputs selected by the rating workflow. */
export function buildRatingSpatialContext(pkg: DemoPackage): RatingSpatialContext {
  const assets = loadSpatialAssets(pkg.match.mapName ?? pkg.manifest.mapName);
  const control = buildOfficialMapControl(pkg, assets);
  return {
    observable: assets.routes != null && (pkg.replay?.rounds.length ?? 0) > 0,
    strategicIsolationDeaths: new Map(
      [...control].map(([id, row]) => [id, row.strategicIsolationDeaths]),
    ),
  };
}

export function deriveRRSignals(
  pkg: DemoPackage,
  facts: PlayerRoundPerformanceFacts,
  spatial: RatingSpatialContext,
): RRSignals[] {
  const summaries = aggregatePlayerRoundPerformanceFacts(facts);
  const killsByBuyDelta = buildKillsByBuyDelta(pkg, facts.manState);
  const killsByManState = buildKillsByManState(facts.manState);
  const tradedOpeningDeaths = buildTradedOpeningDeaths(facts.playerRounds);
  const objective = buildObjectiveSignals(facts.playerRounds);
  const utility = buildUtilitySignals(summaries);

  const buyDeltaAvailable = pkg.playerEconomies.length > 0;
  const manStateAvailable = pkg.rounds.length > 0;

  return pkg.players.map((player) => {
    const summary = summaries.get(player.steamId64) ?? emptyPlayerPerformanceAggregate(player);
    const rounds = Math.max(summary.rounds, 0);

    return {
      steamId64: player.steamId64,
      rounds,
      sourceVersion: 'cs2-demo-analysis-kit/1.0',
      combat: {
        kills: summary.kills,
        deaths: summary.deaths,
        assists: summary.assists,
        effectiveDamage: summary.damage,
        openingKills: summary.firstKills,
        openingDeaths: summary.firstDeaths,
        multiKills: {
          two: summary.twoKillRounds,
          three: summary.threeKillRounds,
          four: summary.fourKillRounds,
          five: summary.fiveKillRounds,
        },
        headshotKills: summary.headshots,
        wallbangKills: summary.weapons.reduce((sum, weapon) => sum + weapon.wallbangKills, 0),
        killsByBuyDelta: buyDeltaAvailable
          ? (killsByBuyDelta.get(player.steamId64) ?? zeroBuyDelta())
          : null,
        killsByManState: manStateAvailable
          ? (killsByManState.get(player.steamId64) ?? zeroManState())
          : null,
      },
      trade: {
        tradeKills: summary.tradeKills,
        tradedDeaths: summary.tradedDeaths,
        deaths: summary.deaths,
        tradedOpeningDeaths: tradedOpeningDeaths.get(player.steamId64) ?? 0,
        strategicIsolationDeaths: spatial.observable
          ? (spatial.strategicIsolationDeaths.get(player.steamId64) ?? 0)
          : null,
      },
      mapControl: {
        uniqueStrategicControlSeconds: null,
        contestedFrontierControlSeconds: null,
        routeDenialSeconds: null,
        teammateAdvanceUnits: null,
        firstControlEvents: null,
      },
      clutch: {
        vsOne: {
          count: summary.clutch.byOpponentCount['1'].attempts,
          won: summary.clutch.byOpponentCount['1'].wins,
        },
        vsTwo: {
          count: summary.clutch.byOpponentCount['2'].attempts,
          won: summary.clutch.byOpponentCount['2'].wins,
        },
        vsThree: {
          count: summary.clutch.byOpponentCount['3'].attempts,
          won: summary.clutch.byOpponentCount['3'].wins,
        },
        vsFour: {
          count: summary.clutch.byOpponentCount['4'].attempts,
          won: summary.clutch.byOpponentCount['4'].wins,
        },
        vsFive: {
          count: summary.clutch.byOpponentCount['5'].attempts,
          won: summary.clutch.byOpponentCount['5'].wins,
        },
      },
      objective: objective.get(player.steamId64) ?? { plants: 0, defuses: 0, plantsConverted: 0 },
      utility: {
        ...(utility.get(player.steamId64) ?? {
          flashAssists: 0,
          effectiveEnemyFlashSeconds: 0,
          teamFlashSuppressionSeconds: 0,
          smokeProtectedCrossings: null,
          smokeSightlineDenialSeconds: null,
          smokeIsolationSeconds: null,
          incendiaryPathDelayUnits: null,
          incendiaryDisplacementEvents: null,
          utilityDamage: 0,
        }),
      },
    } satisfies RRSignals;
  });
}

function buildKillsByBuyDelta(
  pkg: DemoPackage,
  rows: PlayerRoundManStateFact[],
): Map<string, BuyDeltaBuckets> {
  const out = new Map<string, BuyDeltaBuckets>();
  const playerIndexBySteamId = new Map(
    pkg.players.map((player, index) => [player.steamId64, index]),
  );
  const economyByPlayerRound = new Map(
    pkg.playerEconomies.map((row) => [`${row.roundNumber}:${row.playerIndex}`, row]),
  );

  for (const row of rows) {
    const killerIndex = playerIndexBySteamId.get(row.killerSteamId64);
    const victimIndex = playerIndexBySteamId.get(row.victimSteamId64);
    if (killerIndex == null || victimIndex == null) continue;
    const killerEconomy = economyByPlayerRound.get(`${row.roundNumber}:${killerIndex}`);
    const victimEconomy = economyByPlayerRound.get(`${row.roundNumber}:${victimIndex}`);
    if (!killerEconomy || !victimEconomy) continue;

    const buckets = getOrInit(out, row.killerSteamId64, zeroBuyDelta);
    const delta = killerEconomy.equipmentValue - victimEconomy.equipmentValue;
    if (delta <= -BUY_DELTA_EVEN_THRESHOLD) {
      buckets.disadvantage += 1;
    } else if (delta >= BUY_DELTA_EVEN_THRESHOLD) {
      buckets.advantage += 1;
    } else {
      buckets.even += 1;
    }
  }

  return out;
}

function buildKillsByManState(rows: PlayerRoundManStateFact[]): Map<string, ManStateBuckets> {
  const out = new Map<string, ManStateBuckets>();
  for (const row of rows) {
    const buckets = getOrInit(out, row.killerSteamId64, zeroManState);
    if (row.preAdvantageTeamKey === null) {
      buckets.even += 1;
    } else if (row.killerTeamKey === row.preAdvantageTeamKey) {
      buckets.manUp += 1;
    } else {
      buckets.manDown += 1;
    }
  }

  return out;
}

function buildTradedOpeningDeaths(rows: PlayerRoundPerformanceFact[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    if (row.openingDuel === 'lost' && row.tradedDeaths > 0) {
      out.set(row.steamId64, (out.get(row.steamId64) ?? 0) + 1);
    }
  }
  return out;
}

function buildObjectiveSignals(rows: PlayerRoundPerformanceFact[]): Map<string, ObjectiveBuckets> {
  const out = new Map<string, ObjectiveBuckets>();
  for (const row of rows) {
    if (row.objective.plants === 0 && row.objective.defuses === 0) continue;
    const buckets = getOrInit(out, row.steamId64, () => ({
      plants: 0,
      defuses: 0,
      plantsConverted: 0,
    }));
    buckets.plants += row.objective.plants;
    buckets.defuses += row.objective.defuses;
    if (row.teamWonRound)
      buckets.plantsConverted = (buckets.plantsConverted ?? 0) + row.objective.plants;
  }

  return out;
}

function buildUtilitySignals(
  summaries: Map<string, PlayerPerformanceAggregate>,
): Map<string, UtilityBuckets> {
  return new Map(
    [...summaries.entries()].map(([steamId64, summary]) => [
      steamId64,
      {
        flashAssists: summary.utility.flashAssists,
        effectiveEnemyFlashSeconds: round(summary.utility.enemyBlindSeconds, 3),
        teamFlashSuppressionSeconds: round(summary.utility.teamBlindSeconds, 3),
        smokeProtectedCrossings: null,
        smokeSightlineDenialSeconds: null,
        smokeIsolationSeconds: null,
        incendiaryPathDelayUnits: null,
        incendiaryDisplacementEvents: null,
        utilityDamage: summary.utility.utilityDamage,
      } satisfies UtilityBuckets,
    ]),
  );
}

function zeroBuyDelta(): BuyDeltaBuckets {
  return { disadvantage: 0, even: 0, advantage: 0 };
}

function zeroManState(): ManStateBuckets {
  return { manDown: 0, even: 0, manUp: 0 };
}

export function deriveRRIndicators(
  pkg: DemoPackage,
  performanceFacts: PlayerRoundPerformanceFacts,
): RRIndicators[] {
  const summaries = aggregatePlayerRoundPerformanceFacts(performanceFacts);

  return pkg.players.map((player, playerIndex) => {
    const summary = summaries.get(player.steamId64) ?? emptyPlayerPerformanceAggregate(player);
    const playerEconomies = (pkg.playerEconomies ?? []).filter(
      (row) => row.playerIndex === playerIndex,
    );
    const totalRounds = Math.max(summary.rounds, 1);
    const openingDuels = summary.firstKills + summary.firstDeaths;
    const awpKills = summary.weapons
      .filter((weapon) => weapon.weapon === 'awp')
      .reduce((sum, weapon) => sum + weapon.kills, 0);
    const sniperKills = summary.weapons
      .filter((weapon) => ['awp', 'ssg08', 'scout'].includes(weapon.weapon))
      .reduce((sum, weapon) => sum + weapon.kills, 0);
    const clutchScore = [1, 2, 3, 4, 5].reduce(
      (sum, count) =>
        sum +
        (summary.clutch.byOpponentCount[String(count) as '1' | '2' | '3' | '4' | '5']?.wins ?? 0) *
          count,
      0,
    );
    const multiKillRounds =
      summary.twoKillRounds +
      summary.threeKillRounds +
      summary.fourKillRounds +
      summary.fiveKillRounds;
    const playerRoundStats = (count: 1 | 2 | 3 | 4 | 5) =>
      summary.clutch.byOpponentCount[String(count) as '1' | '2' | '3' | '4' | '5'];

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
      clutchWinRate:
        summary.clutch.attempts > 0 ? round(summary.clutch.wins / summary.clutch.attempts, 4) : 0,
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
      ecoRoundCount: playerEconomies.filter((row) => row.type === 'eco').length,
      forceRoundCount: playerEconomies.filter((row) => row.type === 'force').length,
      fullBuyRoundCount: playerEconomies.filter((row) => row.type === 'full').length,
      pistolRoundCount: playerEconomies.filter((row) => row.type === 'pistol').length,
      avgEquipmentValue:
        playerEconomies.length > 0
          ? round(
              playerEconomies.reduce((sum, row) => sum + row.equipmentValue, 0) /
                playerEconomies.length,
              2,
            )
          : 0,
      combatDeathCount: summary.combatDeaths,
      bombDeathCount: summary.bombDeaths,
      wallbangKillCount: summary.weapons.reduce((sum, weapon) => sum + weapon.wallbangKills, 0),
      roundSwingTotal: null,
      roundSwingPerKill: null,
    } satisfies RRIndicators;
  });
}
