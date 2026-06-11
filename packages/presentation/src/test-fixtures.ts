import type { SeasonCohortBundle, SeasonPlayerRow } from "@cs2dak/contract";
import type { PrismAxisKey, PrismAxisResult, PrismResult } from "@rivalhub/rival-rating";

const AXES = [
  "firepower",
  "opening",
  "clutch",
  "sniping",
  "survival",
  "utility",
  "trading",
  "entry"
] as const;

function prism(seed: number, steamId64: string, mapCount: number): PrismResult {
  const axes = {} as Record<PrismAxisKey, PrismAxisResult>;
  for (const [index, key] of AXES.entries()) {
    axes[key] = {
      involvementRaw: seed + index,
      efficiencyRaw: seed + index / 10,
      hasSignal: true,
      availableSignalWeight: 1,
      z: (seed + index) / 10,
      percentile: Math.min(98, 30 + seed * 9 + index * 3)
    };
  }
  return {
    steamId64,
    mapCount,
    weightsVersion: "test-prism",
    rrPercentile: 40 + seed * 8,
    axes
  };
}

function player(index: number, overrides: Partial<SeasonPlayerRow> = {}): SeasonPlayerRow {
  const kills = 20 + index * 5;
  const deaths = index === 4 ? 0 : 18 + index * 2;
  const totalRounds = 48;
  const steamId64 = `7656119800000000${index}`;
  const base: SeasonPlayerRow = {
    playerKey: `steam:${steamId64}`,
    steamIds: [steamId64],
    primarySteamId64: steamId64,
    externalUserId: null,
    name: `Player ${index}`,
    teamKeys: ["teamA"],
    mapCount: 2 + index,
    rrV1: 0.9 + index * 0.08,
    rrV1Percentile: 35 + index * 10,
    indicators: {
      steamId64,
      totalRounds,
      kills,
      deaths,
      assists: 5 + index,
      kpr: kills / totalRounds,
      dpr: deaths / totalRounds,
      apr: (5 + index) / totalRounds,
      adr: 65 + index * 6,
      hsPercent: 42 + index,
      kast: 66 + index * 3,
      survivalRate: deaths === 0 ? 1 : 1 - deaths / totalRounds,
      twoKillRounds: 3 + index,
      threeKillRounds: 1 + index,
      fourKillRounds: index % 2,
      fiveKillRounds: 0,
      multiKillRate: (4 + index) / totalRounds,
      firstKillCount: 2 + index,
      firstDeathCount: 1 + index,
      firstKillRate: (2 + index) / totalRounds,
      firstDeathRate: (1 + index) / totalRounds,
      openingDuelRate: (3 + index * 2) / totalRounds,
      openingDuelWinRate: (2 + index) / (3 + index * 2),
      tradeKillCount: 2 + index,
      tradeDeathCount: 1,
      tradeKillRate: (2 + index) / totalRounds,
      tradeDeathRate: 1 / totalRounds,
      clutchAttempts: index,
      clutchWins: Math.max(0, index - 1),
      clutchWinRate: index > 0 ? (index - 1) / index : 0,
      clutchFrequency: index / totalRounds,
      clutchScore: index * 2,
      clutchScoreRate: (index * 2) / totalRounds,
      vsOne: { count: index, won: Math.max(0, index - 1) },
      vsTwo: { count: 0, won: 0 },
      vsThree: { count: 0, won: 0 },
      vsFour: { count: 0, won: 0 },
      vsFive: { count: 0, won: 0 },
      awpKills: index,
      awpKillsPerRound: index / totalRounds,
      awpKillRate: index / Math.max(1, kills),
      sniperKills: index,
      sniperKillRate: index / Math.max(1, kills),
      awpMultiKillRate: null,
      awpDuelWinRate: null,
      utilityDamage: 20 + index * 5,
      utilityDamagePerRound: (20 + index * 5) / totalRounds,
      flashAssistCount: index,
      flashAssistPerRound: index / totalRounds,
      blindDurationTotal: index * 2,
      blindDurationPerRound: (index * 2) / totalRounds,
      enemyFlashDurationSeconds: index * 3,
      enemyFlashDurationPerRound: (index * 3) / totalRounds,
      teamFlashDurationSeconds: index,
      teamFlashDurationPerRound: index / totalRounds,
      grenadeCount: 10 + index,
      grenadeCountPerRound: (10 + index) / totalRounds,
      ecoRoundCount: 4,
      forceRoundCount: 5,
      fullBuyRoundCount: 30,
      pistolRoundCount: 4,
      avgEquipmentValue: 3800 + index * 100,
      combatDeathCount: deaths,
      bombDeathCount: 0,
      wallbangKillCount: index,
      roundSwingTotal: index * 1.5,
      roundSwingPerKill: kills > 0 ? (index * 1.5) / kills : null
    },
    weaponHighlights: {
      steamId64,
      totalKills: kills,
      weapons: [
        {
          weapon: "ak47",
          kills: kills - index,
          headshotKills: Math.floor((kills - index) / 2),
          tradeKills: index,
          noScopeKills: 0,
          throughSmokeKills: 1,
          wallbangKills: index,
          penetratedObjects: index
        },
        {
          weapon: "awp",
          kills: index,
          headshotKills: 0,
          tradeKills: 0,
          noScopeKills: index > 2 ? 1 : 0,
          throughSmokeKills: 0,
          wallbangKills: 0,
          penetratedObjects: 0
        }
      ],
      highlights: {
        wallbangKills: index,
        noScopeKills: index > 2 ? 1 : 0,
        throughSmokeKills: 1,
        collateralKills: 0
      }
    },
    accountRR: 1 + index * 0.1,
    accountRRRaw: 0.95 + index * 0.1,
    accountBreakdown: {
      combat: 0.5 + index,
      trade: 0.4 + index,
      mapControl: 0.3 + index,
      clutch: 0.2 + index,
      objective: 0.1 + index,
      utility: index
    },
    accountContextStatus: {
      buyDelta: "available",
      manState: "available"
    },
    prism: index === 5 ? null : prism(index, steamId64, 2 + index),
    confidence: 0.6 + index * 0.05,
    perMatch: [
      { matchId: "m2", steamId64, accountRR: 1 + index * 0.1, rrV1: 0.9 + index * 0.08 },
      { matchId: "m1", steamId64, accountRR: 0.95 + index * 0.1, rrV1: 0.85 + index * 0.08 }
    ]
  };
  return { ...base, ...overrides };
}

export function buildTestSeasonCohortBundle(): SeasonCohortBundle {
  return {
    version: "cs2-demo-analysis-kit/cohort-1.0",
    matchCount: 2,
    weightsVersion: "test-weights",
    players: [1, 2, 3, 4, 5].map((i) => player(i)),
    provenance: {
      cohortVersion: "cs2-demo-analysis-kit/cohort-1.0",
      sourceSchemaVersion: "cs2-demo-format/2.0",
      matches: [
        { matchId: "m1", sourceDemoHash: "hash-1" },
        { matchId: "m2", sourceDemoHash: "hash-2" }
      ]
    }
  };
}
