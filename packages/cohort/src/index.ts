import {
  deriveAccountSignalsV2,
  deriveRRIndicators,
  computeAccountRatingsV2
} from "@cs2dak/core";
import {
  seasonCohortBundleSchema,
  type AccountContextAvailability,
  type AccountSignalsV2,
  type DemoPackage,
  type RRIndicators,
  type SeasonCohortBundle,
  type TeamKey,
  type ValueAccountsWeights
} from "@cs2dak/contract";
import {
  computeCohortAccountsRR,
  computePrism,
  computeRR,
  prismWeightsV1,
  rrToPercentile,
  rrValueAccountsV2Lite,
  rrWeightsV1,
  type PrismComputeInput,
  type PrismWeights,
  type RRWeights
} from "@rivalhub/rival-rating";

export interface SeasonCohortInput {
  matchId: string;
  pkg: DemoPackage;
}

export interface SeasonCohortOptions {
  rrWeights?: RRWeights;
  valueWeights?: ValueAccountsWeights;
  prismWeights?: PrismWeights;
  identityMap?: PlayerIdentityMap;
}

export interface PlayerIdentity {
  playerKey: string;
  displayName?: string;
  userId?: string;
}

export type PlayerIdentityMap = Record<string, string | PlayerIdentity>;

interface PlayerAccumulator {
  playerKey: string;
  steamIds: Set<string>;
  primarySteamId64: string;
  externalUserId: string | null;
  displayName: string | null;
  names: Map<string, number>;
  teamKeys: Set<TeamKey>;
  mapCount: number;
  signals: AccountSignalsV2[];
  indicators: RRIndicators[];
  perMatch: Array<{ matchId: string; steamId64: string; accountRR: number; rrV1: number }>;
}

export function buildSeasonCohort(
  demos: SeasonCohortInput[],
  opts: SeasonCohortOptions = {}
): SeasonCohortBundle {
  const rrWeights = opts.rrWeights ?? (rrWeightsV1 as unknown as RRWeights);
  const valueWeights = opts.valueWeights ?? (rrValueAccountsV2Lite as unknown as ValueAccountsWeights);
  const prismWeights = opts.prismWeights ?? (prismWeightsV1 as unknown as PrismWeights);
  const identityMap = opts.identityMap ?? {};
  const players = new Map<string, PlayerAccumulator>();

  for (const demo of demos) {
    const signals = deriveAccountSignalsV2(demo.pkg);
    const indicators = deriveRRIndicators(demo.pkg);
    const matchAccounts = computeAccountRatingsV2(demo.pkg);
    const matchAccountBySteamId = new Map(matchAccounts.map((row) => [row.signals.steamId64, row.rr]));
    const rrBySteamId = new Map(indicators.map((row) => [row.steamId64, computeRR(row, rrWeights)]));

    for (const player of demo.pkg.players) {
      const signal = signals.find((row) => row.steamId64 === player.steamId64);
      const indicator = indicators.find((row) => row.steamId64 === player.steamId64);
      if (!signal || !indicator) continue;
      const identity = resolveIdentity(player.steamId64, identityMap);

      const acc = getOrInit(players, identity.playerKey, () => ({
        playerKey: identity.playerKey,
        steamIds: new Set<string>(),
        primarySteamId64: player.steamId64,
        externalUserId: identity.userId ?? null,
        displayName: identity.displayName ?? null,
        names: new Map<string, number>(),
        teamKeys: new Set<TeamKey>(),
        mapCount: 0,
        signals: [],
        indicators: [],
        perMatch: []
      }));

      acc.steamIds.add(player.steamId64);
      if (!acc.externalUserId && identity.userId) acc.externalUserId = identity.userId;
      if (!acc.displayName && identity.displayName) acc.displayName = identity.displayName;
      acc.names.set(player.name, (acc.names.get(player.name) ?? 0) + 1);
      acc.teamKeys.add(player.teamKey);
      acc.mapCount += 1;
      acc.signals.push(signal);
      acc.indicators.push(indicator);
      acc.perMatch.push({
        matchId: demo.matchId,
        steamId64: player.steamId64,
        accountRR: round(matchAccountBySteamId.get(player.steamId64)?.rr ?? 0, 3),
        rrV1: round(rrBySteamId.get(player.steamId64)?.rr ?? 0, 3)
      });
    }
  }

  const seasonRows = [...players.values()].map((acc) => {
    const signals = aggregateAccountSignals(acc.playerKey, acc.signals);
    const indicators = aggregateRRIndicators(acc.playerKey, acc.indicators);
    const rrV1 = computeRR(indicators, rrWeights);
    return { acc, signals, indicators, rrV1 };
  });

  // 账户平衡（标准化 + 残差化）由 rival-rating 的 computeCohortAccountsRR 拥有（公式归属）。
  // scale 对齐到 rrV1 的离散度，使 v2 与已被 HLTV 逆向验证的 v1 量纲可比。详见该库 docs/rr-v2.md
  // 与本仓库 docs/design/cohort.md。
  const targetStd = stdev(seasonRows.map((row) => row.rrV1.rr));
  const balancedByKey = new Map(
    computeCohortAccountsRR(seasonRows.map((row) => row.signals), valueWeights, { targetStd }).map((b) => [
      b.steamId64,
      b
    ])
  );
  const rrV1Scores = seasonRows.map((row) => row.rrV1.rr);
  const prismInputs: PrismComputeInput[] = seasonRows.map((row) => ({
    indicators: row.indicators,
    mapCount: row.acc.mapCount,
    rrPercentile: rrToPercentile(rrV1Scores, row.rrV1.rr)
  }));
  const prismResults = new Map(computePrism(prismInputs, prismWeights).map((row) => [row.steamId64, row]));

  return seasonCohortBundleSchema.parse({
    version: "cs2-demo-analysis-kit/season-0.1",
    matchCount: demos.length,
    weightsVersion: `${rrWeights.version}+${valueWeights.version}+${prismWeights.version}`,
    players: seasonRows
      .map((row) => {
        const balanced = balancedByKey.get(row.acc.playerKey)!;
        const contextStatus = accountContextStatus(row.acc.signals);
        const steamIds = [...row.acc.steamIds].sort();
        return {
          playerKey: row.acc.playerKey,
          steamIds,
          primarySteamId64: row.acc.primarySteamId64,
          externalUserId: row.acc.externalUserId,
          name: row.acc.displayName ?? mostCommonName(row.acc.names),
          teamKeys: [...row.acc.teamKeys],
          mapCount: row.acc.mapCount,
          rrV1: round(row.rrV1.rr, 3),
          rrV1Percentile: round(rrToPercentile(rrV1Scores, row.rrV1.rr), 1),
          indicators: row.indicators,
          accountRR: round(balanced.rr, 3),
          accountRRRaw: round(balanced.rrRaw, 3),
          accountBreakdown: {
            combat: round(balanced.accounts.combat, 4),
            trade: round(balanced.accounts.trade, 4),
            clutch: round(balanced.accounts.clutch, 4),
            objective: round(balanced.accounts.objective, 4),
            utility: round(balanced.accounts.utility, 4)
          },
          accountContextStatus: contextStatus,
          prism: prismResults.get(row.acc.playerKey) ?? null,
          confidence: confidence(row.acc.mapCount, contextStatus),
          perMatch: row.acc.perMatch.sort((a, b) => a.matchId.localeCompare(b.matchId))
        };
      })
      .sort((a, b) => b.accountRR - a.accountRR || b.rrV1 - a.rrV1 || a.name.localeCompare(b.name))
  });
}

function resolveIdentity(steamId64: string, identityMap: PlayerIdentityMap): PlayerIdentity {
  const value = identityMap[steamId64];
  if (!value) return { playerKey: `steam:${steamId64}` };
  if (typeof value === "string") return { playerKey: value };
  return value;
}

function aggregateAccountSignals(steamId64: string, rows: AccountSignalsV2[]): AccountSignalsV2 {
  return {
    steamId64,
    rounds: sum(rows, (row) => row.rounds),
    sourceVersion: "cs2-demo-analysis-kit/season-0.1",
    combat: {
      kills: sum(rows, (row) => row.combat.kills),
      deaths: sum(rows, (row) => row.combat.deaths),
      assists: sum(rows, (row) => row.combat.assists),
      effectiveDamage: sum(rows, (row) => row.combat.effectiveDamage),
      openingKills: sum(rows, (row) => row.combat.openingKills),
      openingDeaths: sum(rows, (row) => row.combat.openingDeaths),
      multiKills: {
        two: sum(rows, (row) => row.combat.multiKills.two),
        three: sum(rows, (row) => row.combat.multiKills.three),
        four: sum(rows, (row) => row.combat.multiKills.four),
        five: sum(rows, (row) => row.combat.multiKills.five)
      },
      headshotKills: sum(rows, (row) => row.combat.headshotKills),
      wallbangKills: sumNullable(rows.map((row) => row.combat.wallbangKills)),
      killsByBuyDelta: sumBuyDelta(rows.map((row) => row.combat.killsByBuyDelta)),
      killsByManState: sumManState(rows.map((row) => row.combat.killsByManState))
    },
    trade: {
      tradeKills: sum(rows, (row) => row.trade.tradeKills),
      tradedDeaths: sum(rows, (row) => row.trade.tradedDeaths),
      deaths: sum(rows, (row) => row.trade.deaths),
      tradedOpeningDeaths: sumNullable(rows.map((row) => row.trade.tradedOpeningDeaths))
    },
    clutch: {
      vsOne: sumSplit(rows, (row) => row.clutch.vsOne),
      vsTwo: sumSplit(rows, (row) => row.clutch.vsTwo),
      vsThree: sumSplit(rows, (row) => row.clutch.vsThree),
      vsFour: sumSplit(rows, (row) => row.clutch.vsFour),
      vsFive: sumSplit(rows, (row) => row.clutch.vsFive)
    },
    objective: {
      plants: sum(rows, (row) => row.objective.plants),
      defuses: sum(rows, (row) => row.objective.defuses),
      plantsConverted: sumNullable(rows.map((row) => row.objective.plantsConverted))
    },
    utility: {
      flashAssists: sum(rows, (row) => row.utility.flashAssists),
      enemyFlashDurationSeconds: sum(rows, (row) => row.utility.enemyFlashDurationSeconds),
      teamFlashDurationSeconds: sumNullable(rows.map((row) => row.utility.teamFlashDurationSeconds)),
      utilityDamage: sum(rows, (row) => row.utility.utilityDamage)
    }
  };
}

function aggregateRRIndicators(steamId64: string, rows: RRIndicators[]): RRIndicators {
  const totalRounds = Math.max(sum(rows, (row) => row.totalRounds), 1);
  const kills = sum(rows, (row) => row.kills);
  const deaths = sum(rows, (row) => row.deaths);
  const assists = sum(rows, (row) => row.assists);
  const damage = sum(rows, (row) => row.adr * row.totalRounds);
  const kastRounds = sum(rows, (row) => (row.kast / 100) * row.totalRounds);
  const headshotKills = sum(rows, (row) => (row.hsPercent / 100) * row.kills);
  const tradeDeathCount = sum(rows, (row) => row.tradeDeathCount);
  const firstKillCount = sum(rows, (row) => row.firstKillCount);
  const firstDeathCount = sum(rows, (row) => row.firstDeathCount);
  const openingDuels = firstKillCount + firstDeathCount;
  const clutchAttempts = sum(rows, (row) => row.clutchAttempts);
  const clutchWins = sum(rows, (row) => row.clutchWins);
  const clutchScore = sum(rows, (row) => row.clutchScore);
  const awpKills = sum(rows, (row) => row.awpKills);
  const sniperKills = sum(rows, (row) => row.sniperKills);
  const utilityDamage = sum(rows, (row) => row.utilityDamage);
  const flashAssistCount = sum(rows, (row) => row.flashAssistCount);
  const blindDurationTotal = sum(rows, (row) => row.blindDurationTotal);
  const enemyFlashDurationSeconds = sumNullable(rows.map((row) => row.enemyFlashDurationSeconds));
  const teamFlashDurationSeconds = sumNullable(rows.map((row) => row.teamFlashDurationSeconds));
  const grenadeCount = sum(rows, (row) => row.grenadeCount);
  const combatDeathCount = sumNullable(rows.map((row) => row.combatDeathCount));
  const bombDeathCount = sumNullable(rows.map((row) => row.bombDeathCount));
  const wallbangKillCount = sumNullable(rows.map((row) => row.wallbangKillCount));

  return {
    steamId64,
    totalRounds,
    kills,
    deaths,
    assists,
    kpr: round(kills / totalRounds, 4),
    dpr: round(deaths / totalRounds, 4),
    apr: round(assists / totalRounds, 4),
    adr: round(damage / totalRounds, 2),
    hsPercent: kills > 0 ? round((headshotKills / kills) * 100, 2) : 0,
    kast: round((kastRounds / totalRounds) * 100, 2),
    survivalRate: round(Math.max(0, totalRounds - deaths) / totalRounds, 4),
    twoKillRounds: sum(rows, (row) => row.twoKillRounds),
    threeKillRounds: sum(rows, (row) => row.threeKillRounds),
    fourKillRounds: sum(rows, (row) => row.fourKillRounds),
    fiveKillRounds: sum(rows, (row) => row.fiveKillRounds),
    multiKillRate: round(sum(rows, (row) => row.twoKillRounds + row.threeKillRounds + row.fourKillRounds + row.fiveKillRounds) / totalRounds, 4),
    firstKillCount,
    firstDeathCount,
    firstKillRate: round(firstKillCount / totalRounds, 4),
    firstDeathRate: round(firstDeathCount / totalRounds, 4),
    openingDuelRate: round(openingDuels / totalRounds, 4),
    openingDuelWinRate: openingDuels > 0 ? round(firstKillCount / openingDuels, 4) : 0,
    tradeKillCount: sum(rows, (row) => row.tradeKillCount),
    tradeDeathCount,
    tradeKillRate: round(sum(rows, (row) => row.tradeKillCount) / totalRounds, 4),
    tradeDeathRate: deaths > 0 ? round(tradeDeathCount / deaths, 4) : 0,
    clutchAttempts,
    clutchWins,
    clutchWinRate: clutchAttempts > 0 ? round(clutchWins / clutchAttempts, 4) : 0,
    clutchFrequency: round(clutchAttempts / totalRounds, 4),
    clutchScore,
    clutchScoreRate: round(clutchScore / totalRounds, 4),
    vsOne: sumSplit(rows, (row) => row.vsOne),
    vsTwo: sumSplit(rows, (row) => row.vsTwo),
    vsThree: sumSplit(rows, (row) => row.vsThree),
    vsFour: sumSplit(rows, (row) => row.vsFour),
    vsFive: sumSplit(rows, (row) => row.vsFive),
    awpKills,
    awpKillsPerRound: round(awpKills / totalRounds, 4),
    awpKillRate: kills > 0 ? round(awpKills / kills, 4) : 0,
    sniperKills,
    sniperKillRate: kills > 0 ? round(sniperKills / kills, 4) : 0,
    awpMultiKillRate: weightedNullableRate(rows, "awpMultiKillRate"),
    awpDuelWinRate: weightedNullableRate(rows, "awpDuelWinRate"),
    utilityDamage,
    utilityDamagePerRound: round(utilityDamage / totalRounds, 2),
    flashAssistCount,
    flashAssistPerRound: round(flashAssistCount / totalRounds, 4),
    blindDurationTotal: round(blindDurationTotal, 2),
    blindDurationPerRound: round(blindDurationTotal / totalRounds, 2),
    enemyFlashDurationSeconds: enemyFlashDurationSeconds == null ? null : round(enemyFlashDurationSeconds, 2),
    enemyFlashDurationPerRound: enemyFlashDurationSeconds == null ? null : round(enemyFlashDurationSeconds / totalRounds, 2),
    teamFlashDurationSeconds: teamFlashDurationSeconds == null ? null : round(teamFlashDurationSeconds, 2),
    teamFlashDurationPerRound: teamFlashDurationSeconds == null ? null : round(teamFlashDurationSeconds / totalRounds, 2),
    grenadeCount,
    grenadeCountPerRound: round(grenadeCount / totalRounds, 4),
    ecoRoundCount: sum(rows, (row) => row.ecoRoundCount),
    forceRoundCount: sum(rows, (row) => row.forceRoundCount),
    fullBuyRoundCount: sum(rows, (row) => row.fullBuyRoundCount),
    pistolRoundCount: sum(rows, (row) => row.pistolRoundCount),
    avgEquipmentValue: weightedAverage(rows.map((row) => ({ value: row.avgEquipmentValue, weight: row.totalRounds }))),
    combatDeathCount,
    bombDeathCount,
    wallbangKillCount,
    roundSwingTotal: sumNullable(rows.map((row) => row.roundSwingTotal)),
    roundSwingPerKill: weightedNullableRate(rows, "roundSwingPerKill")
  };
}

// 账户平衡的数学（标准化 + 残差化）已迁入 rival-rating 的 computeCohortAccountsRR（公式归属）。
// 本层只负责把 std(rrV1) 作为 targetStd 传进去，对齐 v2 与 HLTV 逆向的量纲。
function stdev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = sum(xs, (x) => x) / xs.length;
  return Math.sqrt(sum(xs, (x) => (x - m) ** 2) / xs.length);
}

function accountContextStatus(rows: AccountSignalsV2[]): { buyDelta: AccountContextAvailability; manState: AccountContextAvailability } {
  return {
    buyDelta: availability(rows.map((row) => row.combat.killsByBuyDelta != null)),
    manState: availability(rows.map((row) => row.combat.killsByManState != null))
  };
}

function confidence(mapCount: number, status: { buyDelta: AccountContextAvailability; manState: AccountContextAvailability }): number {
  const completeness = (availabilityScore(status.buyDelta) + availabilityScore(status.manState)) / 2;
  const sample = mapCount / (mapCount + 3);
  return round(0.7 * completeness + 0.3 * sample, 3);
}

function availability(values: boolean[]): AccountContextAvailability {
  const available = values.filter(Boolean).length;
  if (available === 0) return "missing";
  if (available === values.length) return "available";
  return "partial";
}

function availabilityScore(value: AccountContextAvailability): number {
  if (value === "available") return 1;
  if (value === "partial") return 0.5;
  return 0;
}

function sumBuyDelta(values: AccountSignalsV2["combat"]["killsByBuyDelta"][]): AccountSignalsV2["combat"]["killsByBuyDelta"] {
  const present = values.filter((value): value is NonNullable<typeof value> => value != null);
  if (present.length === 0) return null;
  return {
    disadvantage: sum(present, (value) => value.disadvantage),
    even: sum(present, (value) => value.even),
    advantage: sum(present, (value) => value.advantage)
  };
}

function sumManState(values: AccountSignalsV2["combat"]["killsByManState"][]): AccountSignalsV2["combat"]["killsByManState"] {
  const present = values.filter((value): value is NonNullable<typeof value> => value != null);
  if (present.length === 0) return null;
  return {
    manDown: sum(present, (value) => value.manDown),
    even: sum(present, (value) => value.even),
    manUp: sum(present, (value) => value.manUp)
  };
}

function sumSplit<T>(rows: T[], select: (row: T) => { count: number; won: number }): { count: number; won: number } {
  return {
    count: sum(rows, (row) => select(row).count),
    won: sum(rows, (row) => select(row).won)
  };
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) return null;
  return sum(present, (value) => value);
}

function weightedNullableRate(rows: RRIndicators[], field: "awpMultiKillRate" | "awpDuelWinRate" | "roundSwingPerKill"): number | null {
  const present = rows
    .filter((row) => row[field] != null)
    .map((row) => ({ value: row[field] ?? 0, weight: row.totalRounds }));
  return present.length === 0 ? null : weightedAverage(present);
}

function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  const weight = sum(values, (row) => row.weight);
  if (weight <= 0) return 0;
  return round(sum(values, (row) => row.value * row.weight) / weight, 4);
}

function mostCommonName(names: Map<string, number>): string {
  return [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "Unknown";
}

function getOrInit<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
  const next = create();
  map.set(key, next);
  return next;
}

function sum<T>(rows: T[], select: (row: T) => number): number {
  return rows.reduce((total, row) => total + select(row), 0);
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
