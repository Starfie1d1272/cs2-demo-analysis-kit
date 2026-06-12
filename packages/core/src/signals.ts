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
  type BuyDeltaBuckets,
  type ManStateBuckets,
  type ObjectiveBuckets,
  type UtilityBuckets,
  BUY_DELTA_EVEN_THRESHOLD,
  getOrInit,
  zeroBuyDelta,
  zeroManState,
  clutchSplitV2,
  sumDamageForPlayer,
  openingKillsForPlayer,
  openingDeathsForPlayer,
  multiKillRounds,
  round,
  firstKillMap
} from "./utils.js";

export type AccountRatingResult = CohortAccountResult & Pick<RRSixAccountResult, "combatContextFactor" | "weightsVersion" | "model">;

export function deriveRRSignals(input: unknown): RRSignals[] {
  const pkg = normalizeDemoPackage(input);
  const statsMap = new Map(pkg.playerStats.map((row) => [row.playerIndex, row]));
  const killsByBuyDelta = buildKillsByBuyDelta(pkg);
  const killsByManState = buildKillsByManState(pkg);
  const tradedOpeningDeaths = buildTradedOpeningDeaths(pkg);
  const objective = buildObjectiveSignals(pkg);
  const utility = buildUtilitySignals(pkg, statsMap);

  const buyDeltaAvailable = pkg.playerEconomies.length > 0;
  const manStateAvailable = pkg.rounds.length > 0;

  const spatialAssets = loadSpatialAssets(pkg.match?.mapName ?? pkg.manifest?.mapName ?? "");
  const officialMapControl = buildOfficialMapControl(pkg, spatialAssets);
  // positions-1s removed in v3; replay-based spatial re-impl is step 3
  const spatialObservable = spatialAssets.routes != null && (pkg.replay?.rounds?.length ?? 0) > 0;

  return pkg.players.map((player, playerIdx) => {
    const stats = statsMap.get(playerIdx);
    const playerKills = pkg.kills.filter((kill) => kill.killerIndex === playerIdx);
    const playerDeaths = pkg.kills.filter((kill) => kill.victimIndex === playerIdx);
    const playerClutches = pkg.clutches.filter((row) => row.clutcherIndex === playerIdx);
    const rounds = Math.max(stats?.rounds ?? pkg.rounds.length, 0);

    return {
      steamId64: player.steamId64,
      rounds,
      sourceVersion: "cs2-demo-analysis-kit/1.0",
      combat: {
        kills: stats?.kills ?? playerKills.length,
        deaths: stats?.deaths ?? playerDeaths.length,
        assists: stats?.assists ?? 0,
        effectiveDamage: stats?.damageHealth ?? sumDamageForPlayer(pkg, playerIdx),
        openingKills: stats?.firstKillCount ?? openingKillsForPlayer(pkg, playerIdx),
        openingDeaths: stats?.firstDeathCount ?? openingDeathsForPlayer(pkg, playerIdx),
        multiKills: {
          two: stats?.twoKillCount ?? multiKillRounds(playerKills, 2),
          three: stats?.threeKillCount ?? multiKillRounds(playerKills, 3),
          four: stats?.fourKillCount ?? multiKillRounds(playerKills, 4),
          five: stats?.fiveKillCount ?? multiKillRounds(playerKills, 5)
        },
        headshotKills: stats?.headshotCount ?? playerKills.filter((kill) => kill.headshot).length,
        wallbangKills: stats?.wallbangKillCount ?? playerKills.filter((kill) => kill.penetratedObjects > 0).length,
        killsByBuyDelta: buyDeltaAvailable ? (killsByBuyDelta.get(player.steamId64) ?? zeroBuyDelta()) : null,
        killsByManState: manStateAvailable ? (killsByManState.get(player.steamId64) ?? zeroManState()) : null
      },
      trade: {
        tradeKills: stats?.tradeKillCount ?? playerKills.filter((kill) => kill.tradeKill).length,
        tradedDeaths: stats?.tradeDeathCount ?? playerDeaths.filter((kill) => kill.tradeDeath).length,
        deaths: stats?.deaths ?? playerDeaths.length,
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
        vsOne: clutchSplitV2(stats?.vsOneCount, stats?.vsOneWonCount, playerClutches, 1),
        vsTwo: clutchSplitV2(stats?.vsTwoCount, stats?.vsTwoWonCount, playerClutches, 2),
        vsThree: clutchSplitV2(stats?.vsThreeCount, stats?.vsThreeWonCount, playerClutches, 3),
        vsFour: clutchSplitV2(stats?.vsFourCount, stats?.vsFourWonCount, playerClutches, 4),
        vsFive: clutchSplitV2(stats?.vsFiveCount, stats?.vsFiveWonCount, playerClutches, 5)
      },
      objective: objective.get(player.steamId64) ?? { plants: 0, defuses: 0, plantsConverted: 0 },
      utility: {
        ...(utility.get(player.steamId64) ?? {
          flashAssists: stats?.flashAssistCount ?? 0,
          effectiveEnemyFlashSeconds: stats?.enemyFlashDurationSeconds ?? 0,
          teamFlashSuppressionSeconds: stats?.teamFlashDurationSeconds ?? 0,
          smokeProtectedCrossings: null,
          smokeSightlineDenialSeconds: null,
          smokeIsolationSeconds: null,
          incendiaryPathDelayUnits: null,
          incendiaryDisplacementEvents: null,
          utilityDamage: stats?.utilityDamage ?? 0
        })
      }
    } satisfies RRSignals;
  });
}

export const deriveAccountSignalsV2 = deriveRRSignals;

export function computeAccountRatingsV2(input: unknown): Array<{ signals: RRSignals; rr: AccountRatingResult }> {
  const weights = rrSixAccountWeightsV1 as unknown as RRSixAccountWeights;
  const baseline = rrSixAccountProBaselineV0 as unknown as ProBaselineConfig;
  const signals = deriveRRSignals(input);
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

function buildKillsByBuyDelta(pkg: DemoPackage): Map<string, BuyDeltaBuckets> {
  const out = new Map<string, BuyDeltaBuckets>();
  const economyByPlayerRound = new Map(pkg.playerEconomies.map((row) => [`${row.roundNumber}:${row.playerIndex}`, row]));

  for (const kill of pkg.kills) {
    if (kill.killerIndex === null) continue;
    const killerEconomy = economyByPlayerRound.get(`${kill.roundNumber}:${kill.killerIndex}`);
    const victimEconomy = economyByPlayerRound.get(`${kill.roundNumber}:${kill.victimIndex}`);
    if (!killerEconomy || !victimEconomy) continue;

    const killerSteamId = pkg.players[kill.killerIndex]?.steamId64;
    if (!killerSteamId) continue;
    const buckets = getOrInit(out, killerSteamId, zeroBuyDelta);
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

function buildKillsByManState(pkg: DemoPackage): Map<string, ManStateBuckets> {
  const out = new Map<string, ManStateBuckets>();
  const teamAIndices = new Set(pkg.players.flatMap((p, i) => p.teamKey === "teamA" ? [i] : []));
  const teamBIndices = new Set(pkg.players.flatMap((p, i) => p.teamKey === "teamB" ? [i] : []));

  for (const roundRow of pkg.rounds) {
    const aliveA = new Set(teamAIndices);
    const aliveB = new Set(teamBIndices);
    const roundKills = pkg.kills
      .filter((kill) => kill.roundNumber === roundRow.roundNumber)
      .sort((a, b) => a.tick - b.tick);

    for (const kill of roundKills) {
      if (kill.killerIndex === null) continue;
      const killerTeam = pkg.players[kill.killerIndex]?.teamKey;
      const victimTeam = pkg.players[kill.victimIndex]?.teamKey;
      if (!killerTeam || !victimTeam || killerTeam === victimTeam) continue;

      const killerSteamId = pkg.players[kill.killerIndex]!.steamId64;
      const buckets = getOrInit(out, killerSteamId, zeroManState);
      const killerAlive = killerTeam === "teamA" ? aliveA.size : aliveB.size;
      const victimAlive = victimTeam === "teamA" ? aliveA.size : aliveB.size;
      const diff = killerAlive - victimAlive;
      if (diff < 0) {
        buckets.manDown += 1;
      } else if (diff > 0) {
        buckets.manUp += 1;
      } else {
        buckets.even += 1;
      }

      if (victimTeam === "teamA") aliveA.delete(kill.victimIndex);
      else aliveB.delete(kill.victimIndex);
    }
  }

  return out;
}

function buildTradedOpeningDeaths(pkg: DemoPackage): Map<string, number> {
  const out = new Map<string, number>();
  for (const kill of firstKillMap(pkg).values()) {
    if (kill.tradeDeath) {
      const victimSteamId = pkg.players[kill.victimIndex]?.steamId64;
      if (victimSteamId) out.set(victimSteamId, (out.get(victimSteamId) ?? 0) + 1);
    }
  }
  return out;
}

function buildObjectiveSignals(pkg: DemoPackage): Map<string, ObjectiveBuckets> {
  const out = new Map<string, ObjectiveBuckets>();
  const roundWinner = new Map(pkg.rounds.map((round) => [round.roundNumber, round.winnerTeamKey]));

  for (const bomb of pkg.bombs) {
    if (bomb.actorIndex === null) continue;
    const actorSteamId = pkg.players[bomb.actorIndex]?.steamId64;
    if (!actorSteamId) continue;
    const buckets = getOrInit(out, actorSteamId, () => ({ plants: 0, defuses: 0, plantsConverted: 0 }));
    if (bomb.type === "planted") {
      buckets.plants += 1;
      const actorTeamKey = pkg.players[bomb.actorIndex]?.teamKey;
      if (actorTeamKey && roundWinner.get(bomb.roundNumber) === actorTeamKey) {
        buckets.plantsConverted = (buckets.plantsConverted ?? 0) + 1;
      }
    } else if (bomb.type === "defused") {
      buckets.defuses += 1;
    }
  }

  return out;
}

function buildUtilitySignals(pkg: DemoPackage, statsMap: Map<number, DemoPackage["playerStats"][number]>): Map<string, UtilityBuckets> {
  const out = new Map<string, UtilityBuckets>();

  pkg.players.forEach((player, playerIdx) => {
    const stats = statsMap.get(playerIdx);
    out.set(player.steamId64, {
      flashAssists: stats?.flashAssistCount ?? pkg.kills.filter((kill) => kill.flashAssisterIndex === playerIdx).length,
      effectiveEnemyFlashSeconds: stats?.enemyFlashDurationSeconds ?? 0,
      teamFlashSuppressionSeconds: stats?.teamFlashDurationSeconds ?? 0,
      smokeProtectedCrossings: null,
      smokeSightlineDenialSeconds: null,
      smokeIsolationSeconds: null,
      incendiaryPathDelayUnits: null,
      incendiaryDisplacementEvents: null,
      utilityDamage: stats?.utilityDamage ?? 0
    });
  });

  for (const blind of pkg.blinds) {
    const flasherSteamId = pkg.players[blind.flasherIndex]?.steamId64;
    if (!flasherSteamId) continue;
    const buckets = getOrInit(out, flasherSteamId, () => ({
      flashAssists: 0,
      effectiveEnemyFlashSeconds: 0,
      teamFlashSuppressionSeconds: 0,
      smokeProtectedCrossings: null,
      smokeSightlineDenialSeconds: null,
      smokeIsolationSeconds: null,
      incendiaryPathDelayUnits: null,
      incendiaryDisplacementEvents: null,
      utilityDamage: 0
    }));
    const flasherTeam = pkg.players[blind.flasherIndex]?.teamKey;
    const flashedTeam = pkg.players[blind.flashedIndex]?.teamKey;
    if (flasherTeam !== flashedTeam) {
      buckets.effectiveEnemyFlashSeconds = round((buckets.effectiveEnemyFlashSeconds ?? 0) + blind.durationSeconds, 3);
    } else if (blind.flashedIndex !== blind.flasherIndex) {
      buckets.teamFlashSuppressionSeconds = round((buckets.teamFlashSuppressionSeconds ?? 0) + blind.durationSeconds, 3);
    }
  }

  return out;
}
