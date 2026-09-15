import {
  computeFrozenProBaselineRR,
  computeRRSixAccounts,
  rrSixAccountProBaselineV0,
  rrSixAccountWeightsV1
} from "@rivalhub/rival-rating";
import type { DemoPackage, RRSignals, RRSixAccountWeights } from "@cs2dak/contract";
import type { CohortAccountResult, ProBaselineConfig, RRSixAccountResult } from "@rivalhub/rival-rating";
import { normalizeDemoPackage } from "./normalize.js";
import { loadSpatialAssets } from "./spatial/annotate.js";
import { buildOfficialMapControl } from "./spatial/mapcontrol.js";
import {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  emptyPlayerPerformanceAggregate,
  type PlayerPerformanceAggregate,
  type PlayerRoundManStateFact,
  type PlayerRoundPerformanceFact,
  type PlayerRoundPerformanceFacts,
} from "./performance-facts.js";
import {
  type BuyDeltaBuckets,
  type ManStateBuckets,
  type ObjectiveBuckets,
  type UtilityBuckets,
  BUY_DELTA_EVEN_THRESHOLD,
  getOrInit,
  zeroBuyDelta,
  zeroManState,
  round,
} from "./utils.js";

export type AccountRatingResult = CohortAccountResult & Pick<RRSixAccountResult, "combatContextFactor" | "weightsVersion" | "model">;

export function deriveRRSignals(input: unknown, performanceFacts?: PlayerRoundPerformanceFacts): RRSignals[] {
  const pkg = normalizeDemoPackage(input);
  const facts = performanceFacts ?? buildPlayerRoundPerformanceFacts(pkg);
  const summaries = aggregatePlayerRoundPerformanceFacts(facts);
  const killsByBuyDelta = buildKillsByBuyDelta(pkg, facts.manState);
  const killsByManState = buildKillsByManState(facts.manState);
  const tradedOpeningDeaths = buildTradedOpeningDeaths(facts.playerRounds);
  const objective = buildObjectiveSignals(facts.playerRounds);
  const utility = buildUtilitySignals(summaries);

  const buyDeltaAvailable = pkg.playerEconomies.length > 0;
  const manStateAvailable = pkg.rounds.length > 0;

  const spatialAssets = loadSpatialAssets(pkg.match?.mapName ?? pkg.manifest?.mapName ?? "");
  const officialMapControl = buildOfficialMapControl(pkg, spatialAssets);
  // replay-based spatial re-impl (step 3)
  const spatialObservable = spatialAssets.routes != null && (pkg.replay?.rounds?.length ?? 0) > 0;

  return pkg.players.map((player) => {
    const summary = summaries.get(player.steamId64) ?? emptyPlayerPerformanceAggregate(player);
    const rounds = Math.max(summary.rounds, 0);

    return {
      steamId64: player.steamId64,
      rounds,
      sourceVersion: "cs2-demo-analysis-kit/1.0",
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
          five: summary.fiveKillRounds
        },
        headshotKills: summary.headshots,
        wallbangKills: summary.weapons.reduce((sum, weapon) => sum + weapon.wallbangKills, 0),
        killsByBuyDelta: buyDeltaAvailable ? (killsByBuyDelta.get(player.steamId64) ?? zeroBuyDelta()) : null,
        killsByManState: manStateAvailable ? (killsByManState.get(player.steamId64) ?? zeroManState()) : null
      },
      trade: {
        tradeKills: summary.tradeKills,
        tradedDeaths: summary.tradedDeaths,
        deaths: summary.deaths,
        tradedOpeningDeaths: tradedOpeningDeaths.get(player.steamId64) ?? 0,
        strategicIsolationDeaths: spatialObservable
          ? (officialMapControl.get(player.steamId64)?.strategicIsolationDeaths ?? 0)
          : null
      },
      mapControl: {
        uniqueStrategicControlSeconds: null,
        contestedFrontierControlSeconds: null,
        routeDenialSeconds: null,
        teammateAdvanceUnits: null,
        firstControlEvents: null
      },
      clutch: {
        vsOne: { count: summary.clutch.byOpponentCount["1"].attempts, won: summary.clutch.byOpponentCount["1"].wins },
        vsTwo: { count: summary.clutch.byOpponentCount["2"].attempts, won: summary.clutch.byOpponentCount["2"].wins },
        vsThree: { count: summary.clutch.byOpponentCount["3"].attempts, won: summary.clutch.byOpponentCount["3"].wins },
        vsFour: { count: summary.clutch.byOpponentCount["4"].attempts, won: summary.clutch.byOpponentCount["4"].wins },
        vsFive: { count: summary.clutch.byOpponentCount["5"].attempts, won: summary.clutch.byOpponentCount["5"].wins }
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
          utilityDamage: 0
        })
      }
    } satisfies RRSignals;
  });
}

export function computeAccountRatingsV2(input: unknown, performanceFacts?: PlayerRoundPerformanceFacts): Array<{ signals: RRSignals; rr: AccountRatingResult }> {
  const weights = rrSixAccountWeightsV1 as unknown as RRSixAccountWeights;
  const baseline = rrSixAccountProBaselineV0 as unknown as ProBaselineConfig;
  const signals = deriveRRSignals(input, performanceFacts);
  const rawBySteamId = new Map(signals.map((row) => [row.steamId64, computeRRSixAccounts(row, weights)]));
  const balanced = signals.map((signal) => computeFrozenProBaselineRR(signal, weights, baseline));

  return balanced.map((rr, index) => {
    const signal = signals[index]!;
    const raw = rawBySteamId.get(signal.steamId64);
    return {
      signals: signal,
      rr: {
        ...rr,
        combatContextFactor: raw?.combatContextFactor ?? 1,
        weightsVersion: raw?.weightsVersion ?? weights.version,
        model: raw?.model ?? "rr-six-accounts"
      }
    };
  });
}

function buildKillsByBuyDelta(pkg: DemoPackage, rows: PlayerRoundManStateFact[]): Map<string, BuyDeltaBuckets> {
  const out = new Map<string, BuyDeltaBuckets>();
  const playerIndexBySteamId = new Map(pkg.players.map((player, index) => [player.steamId64, index]));
  const economyByPlayerRound = new Map(pkg.playerEconomies.map((row) => [`${row.roundNumber}:${row.playerIndex}`, row]));

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
    if (row.openingDuel === "lost" && row.tradedDeaths > 0) {
      out.set(row.steamId64, (out.get(row.steamId64) ?? 0) + 1);
    }
  }
  return out;
}

function buildObjectiveSignals(rows: PlayerRoundPerformanceFact[]): Map<string, ObjectiveBuckets> {
  const out = new Map<string, ObjectiveBuckets>();
  for (const row of rows) {
    if (row.objective.plants === 0 && row.objective.defuses === 0) continue;
    const buckets = getOrInit(out, row.steamId64, () => ({ plants: 0, defuses: 0, plantsConverted: 0 }));
    buckets.plants += row.objective.plants;
    buckets.defuses += row.objective.defuses;
    if (row.teamWonRound) buckets.plantsConverted = (buckets.plantsConverted ?? 0) + row.objective.plants;
  }

  return out;
}

function buildUtilitySignals(summaries: Map<string, PlayerPerformanceAggregate>): Map<string, UtilityBuckets> {
  return new Map([...summaries.entries()].map(([steamId64, summary]) => [steamId64, {
      flashAssists: summary.utility.flashAssists,
      effectiveEnemyFlashSeconds: round(summary.utility.enemyBlindSeconds, 3),
      teamFlashSuppressionSeconds: round(summary.utility.teamBlindSeconds, 3),
      smokeProtectedCrossings: null,
      smokeSightlineDenialSeconds: null,
      smokeIsolationSeconds: null,
      incendiaryPathDelayUnits: null,
      incendiaryDisplacementEvents: null,
      utilityDamage: summary.utility.utilityDamage
    } satisfies UtilityBuckets]));
}
