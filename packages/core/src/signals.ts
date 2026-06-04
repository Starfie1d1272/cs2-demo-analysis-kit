import {
  computeLeagueMeanV2,
  computeValueAccountsRR,
  rrValueAccountsV2Lite
} from "@rivalhub/rival-rating";
import type { AccountSignalsV2, DemoPackage, ValueAccountsWeights } from "@cs2dak/contract";
import type { RRResultV2 } from "@rivalhub/rival-rating";
import { normalizeDemoPackage } from "./normalize.js";
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

export function deriveAccountSignalsV2(input: unknown): AccountSignalsV2[] {
  const pkg = normalizeDemoPackage(input);
  const statsBySteamId = new Map(pkg.playerStats.map((row) => [row.steamId64, row]));
  const killsByBuyDelta = buildKillsByBuyDelta(pkg);
  const killsByManState = buildKillsByManState(pkg);
  const tradedOpeningDeaths = buildTradedOpeningDeaths(pkg);
  const objective = buildObjectiveSignals(pkg);
  const utility = buildUtilitySignals(pkg);

  // context 分桶的"数据源是否存在"。源缺失 → 发 null（模型降级为乘子 1.0），
  // 而非零桶——零桶语义是"源在、但该选手无相关样本"。区分二者是 v2 可信展示的前提。
  const buyDeltaAvailable = pkg.playerEconomies.length > 0;
  const manStateAvailable = pkg.rounds.length > 0;

  return pkg.players.map((player) => {
    const stats = statsBySteamId.get(player.steamId64);
    const playerKills = pkg.kills.filter((kill) => kill.killerSteamId64 === player.steamId64);
    const playerDeaths = pkg.kills.filter((kill) => kill.victimSteamId64 === player.steamId64);
    const playerClutches = pkg.clutches.filter((row) => row.clutcherSteamId64 === player.steamId64);
    const rounds = Math.max(stats?.rounds ?? pkg.rounds.length, 0);

    return {
      steamId64: player.steamId64,
      rounds,
      sourceVersion: "cs2-demo-analysis-kit/1.0",
      combat: {
        kills: stats?.kills ?? playerKills.length,
        deaths: stats?.deaths ?? playerDeaths.length,
        assists: stats?.assists ?? 0,
        effectiveDamage: stats?.damageHealth ?? sumDamageForPlayer(pkg, player.steamId64),
        openingKills: stats?.firstKillCount ?? openingKillsForPlayer(pkg, player.steamId64),
        openingDeaths: stats?.firstDeathCount ?? openingDeathsForPlayer(pkg, player.steamId64),
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
        tradedOpeningDeaths: tradedOpeningDeaths.get(player.steamId64) ?? 0
      },
      clutch: {
        vsOne: clutchSplitV2(stats?.vsOneCount, stats?.vsOneWonCount, playerClutches, 1),
        vsTwo: clutchSplitV2(stats?.vsTwoCount, stats?.vsTwoWonCount, playerClutches, 2),
        vsThree: clutchSplitV2(stats?.vsThreeCount, stats?.vsThreeWonCount, playerClutches, 3),
        vsFour: clutchSplitV2(stats?.vsFourCount, stats?.vsFourWonCount, playerClutches, 4),
        vsFive: clutchSplitV2(stats?.vsFiveCount, stats?.vsFiveWonCount, playerClutches, 5)
      },
      objective: objective.get(player.steamId64) ?? { plants: 0, defuses: 0, plantsConverted: 0 },
      utility: utility.get(player.steamId64) ?? {
        flashAssists: stats?.flashAssistCount ?? 0,
        enemyFlashDurationSeconds: stats?.enemyFlashDurationSeconds ?? 0,
        teamFlashDurationSeconds: stats?.teamFlashDurationSeconds ?? 0,
        utilityDamage: stats?.utilityDamage ?? 0
      }
    } satisfies AccountSignalsV2;
  });
}

export function computeAccountRatingsV2(input: unknown): Array<{ signals: AccountSignalsV2; rr: RRResultV2 }> {
  const weights = rrValueAccountsV2Lite as unknown as ValueAccountsWeights;
  const rated = deriveAccountSignalsV2(input).map((signals) => ({
    signals,
    rr: computeValueAccountsRR(signals, weights)
  }));

  // 联赛锚定（weights.anchor.mode === "league_mean"）：整体乘 (1.0 / mean)，
  // 使 1.00 = 本场均值。本层一次只处理单场，故"联赛均值"= 本场均值（per-match）；
  // 真正的赛季级锚定属于上游跨场聚合层，详见 docs/design/rr-v2-lite.md。
  const mean = computeLeagueMeanV2(rated.map((row) => row.rr));
  const factor = mean > 0 ? 1.0 / mean : 1.0;
  return rated.map((row) => ({
    signals: row.signals,
    rr: { ...row.rr, rr: row.rr.rr * factor }
  }));
}

function buildKillsByBuyDelta(pkg: DemoPackage): Map<string, BuyDeltaBuckets> {
  const out = new Map<string, BuyDeltaBuckets>();
  const economyByPlayerRound = new Map(pkg.playerEconomies.map((row) => [`${row.roundNumber}:${row.steamId64}`, row]));

  for (const kill of pkg.kills) {
    if (!kill.killerSteamId64) continue;
    const killerEconomy = economyByPlayerRound.get(`${kill.roundNumber}:${kill.killerSteamId64}`);
    const victimEconomy = economyByPlayerRound.get(`${kill.roundNumber}:${kill.victimSteamId64}`);
    if (!killerEconomy || !victimEconomy) continue;

    const buckets = getOrInit(out, kill.killerSteamId64, zeroBuyDelta);
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
  const playersByTeam = {
    teamA: pkg.players.filter((player) => player.teamKey === "teamA").map((player) => player.steamId64),
    teamB: pkg.players.filter((player) => player.teamKey === "teamB").map((player) => player.steamId64)
  };

  for (const roundRow of pkg.rounds) {
    const alive = {
      teamA: new Set(playersByTeam.teamA),
      teamB: new Set(playersByTeam.teamB)
    };
    const roundKills = pkg.kills
      .filter((kill) => kill.roundNumber === roundRow.roundNumber)
      .sort((a, b) => a.tick - b.tick);

    for (const kill of roundKills) {
      if (kill.killerSteamId64 && kill.killerTeamKey && kill.killerTeamKey !== kill.victimTeamKey) {
        const buckets = getOrInit(out, kill.killerSteamId64, zeroManState);
        const killerAlive = alive[kill.killerTeamKey].size;
        const victimAlive = alive[kill.victimTeamKey].size;
        const diff = killerAlive - victimAlive;
        if (diff < 0) {
          buckets.manDown += 1;
        } else if (diff > 0) {
          buckets.manUp += 1;
        } else {
          buckets.even += 1;
        }
      }
      alive[kill.victimTeamKey].delete(kill.victimSteamId64);
    }
  }

  return out;
}

function buildTradedOpeningDeaths(pkg: DemoPackage): Map<string, number> {
  const out = new Map<string, number>();
  for (const kill of firstKillMap(pkg).values()) {
    if (kill.tradeDeath) {
      out.set(kill.victimSteamId64, (out.get(kill.victimSteamId64) ?? 0) + 1);
    }
  }
  return out;
}

function buildObjectiveSignals(pkg: DemoPackage): Map<string, ObjectiveBuckets> {
  const out = new Map<string, ObjectiveBuckets>();
  const roundWinner = new Map(pkg.rounds.map((round) => [round.roundNumber, round.winnerTeamKey]));

  for (const bomb of pkg.bombs) {
    if (!bomb.actorSteamId64) continue;
    const buckets = getOrInit(out, bomb.actorSteamId64, () => ({ plants: 0, defuses: 0, plantsConverted: 0 }));
    if (bomb.type === "planted") {
      buckets.plants += 1;
      if (bomb.actorTeamKey && roundWinner.get(bomb.roundNumber) === bomb.actorTeamKey) {
        buckets.plantsConverted = (buckets.plantsConverted ?? 0) + 1;
      }
    } else if (bomb.type === "defused") {
      buckets.defuses += 1;
    }
  }

  return out;
}

function buildUtilitySignals(pkg: DemoPackage): Map<string, UtilityBuckets> {
  const out = new Map<string, UtilityBuckets>();
  const statsBySteamId = new Map(pkg.playerStats.map((row) => [row.steamId64, row]));

  for (const player of pkg.players) {
    const stats = statsBySteamId.get(player.steamId64);
    out.set(player.steamId64, {
      flashAssists: stats?.flashAssistCount ?? pkg.kills.filter((kill) => kill.flashAssisterSteamId64 === player.steamId64).length,
      enemyFlashDurationSeconds: stats?.enemyFlashDurationSeconds ?? 0,
      teamFlashDurationSeconds: stats?.teamFlashDurationSeconds ?? 0,
      utilityDamage: stats?.utilityDamage ?? 0
    });
  }

  for (const blind of pkg.blinds) {
    const buckets = getOrInit(out, blind.flasherSteamId64, () => ({
      flashAssists: 0,
      enemyFlashDurationSeconds: 0,
      teamFlashDurationSeconds: 0,
      utilityDamage: 0
    }));
    if (blind.flasherTeamKey !== blind.flashedTeamKey) {
      buckets.enemyFlashDurationSeconds = round(buckets.enemyFlashDurationSeconds + blind.durationSeconds, 3);
    } else if (blind.flashedSteamId64 !== blind.flasherSteamId64) {
      buckets.teamFlashDurationSeconds = round((buckets.teamFlashDurationSeconds ?? 0) + blind.durationSeconds, 3);
    }
  }

  return out;
}
