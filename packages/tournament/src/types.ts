export type TournamentTeamSlot = "teamA" | "teamB";
export type TournamentEconomyType = "pistol" | "eco" | "semi" | "force" | "full";
export type TournamentManAdvantage = "5v4" | "4v5" | "5v3" | "3v5";

export interface WinLossCount {
  opportunities: number;
  wins: number;
}

export interface TournamentTeamMapCount {
  rounds: number;
  roundWins: number;
  tRounds: number;
  tWins: number;
  ctRounds: number;
  ctWins: number;
}

export interface TournamentTeamConversionCount {
  pistol: WinLossCount;
  round2: {
    conversion: WinLossCount;
    break: WinLossCount;
  };
  ecoSemiUpset: WinLossCount;
  manAdvantage: Record<TournamentManAdvantage, WinLossCount>;
}

export interface TournamentEconomyMatrixCount {
  lowEconomy: TournamentEconomyType;
  highEconomy: TournamentEconomyType;
  rounds: number;
  lowEconomyWins: number;
}

export interface TournamentPlayerWeaponCount {
  playerEntityKey: string;
  teamEntityKey: string;
  weapon: string;
  kills: number;
  headshotKills: number;
}

export interface TournamentMapFacts {
  semanticProfile: string;
  analysisVersion: string;
  mapKey: string;
  matchKey: string;
  mapName: string;
  teamEntityKeys: Record<TournamentTeamSlot, string>;
  teamMaps: Record<TournamentTeamSlot, TournamentTeamMapCount>;
  teamConversions: Record<TournamentTeamSlot, TournamentTeamConversionCount>;
  economyMatrix: TournamentEconomyMatrixCount[];
  pistolSides: {
    t: WinLossCount;
    ct: WinLossCount;
  };
  playerWeapons: TournamentPlayerWeaponCount[];
}

export interface TournamentEntityLabels {
  teams?: Record<string, string>;
  players?: Record<string, string>;
}

export interface RateCount extends WinLossCount {
  rate: number | null;
}

export interface TournamentEntityRef {
  entityKey: string;
  displayName: string;
}

export interface TournamentAnalytics {
  provenance: {
    semanticProfile: string | null;
    analysisVersions: string[];
  };
  totals: {
    matchCount: number;
    mapCount: number;
    roundCount: number;
    t: RateCount;
    ct: RateCount;
    pistolT: RateCount;
    pistolCt: RateCount;
    round2Conversion: RateCount;
    round2Break: RateCount;
    ecoSemiUpset: RateCount;
    manAdvantage: Record<TournamentManAdvantage, RateCount>;
  };
  maps: Array<{
    mapName: string;
    mapCount: number;
    roundCount: number;
    t: RateCount;
    ct: RateCount;
    pistolT: RateCount;
    pistolCt: RateCount;
  }>;
  teams: Array<{
    team: TournamentEntityRef;
    mapCount: number;
    rounds: number;
    roundWins: number;
    roundWinRate: number | null;
    t: RateCount;
    ct: RateCount;
    pistol: RateCount;
    round2: {
      conversion: RateCount;
      break: RateCount;
    };
    ecoSemiUpset: RateCount;
    manAdvantage: Record<TournamentManAdvantage, RateCount>;
  }>;
  economyMatrix: Array<TournamentEconomyMatrixCount & {
    lowWinRate: number | null;
  }>;
  weapons: Array<{
    weapon: string;
    kills: number;
    headshotKills: number;
    headshotRate: number | null;
    topPlayer: (TournamentEntityRef & { kills: number }) | null;
  }>;
}

/** Side carried by a frozen player-round fact. */
export type TournamentSide = "t" | "ct";

/** Opening-duel state carried by a frozen player-round fact. */
export type TournamentOpeningDuel = "none" | "won" | "lost";

export type TournamentClutchOpponentCount = 1 | 2 | 3 | 4 | 5;

/**
 * A raw numerator/denominator pair. `rate` is a fraction in [0, 1] when the
 * numerator is a count, and is deliberately left unformatted for consumers.
 * It is also used for transparent per-round/per-event quantities such as
 * damage per throw, where `successes` is the raw quantity rather than a
 * count of successes.
 */
export interface TournamentRateSample {
  successes: number;
  attempts: number;
  rate: number | null;
}

export interface TournamentSideSlices<T> {
  overall: T;
  t: T;
  ct: T;
}

export interface TournamentPerformanceUtilityFact {
  flashesThrown: number;
  enemyBlindSeconds: number;
  teamBlindSeconds: number;
  enemyBlindVictims: number;
  flashAssists: number;
  heThrows: number;
  heDamage: number;
  fireThrows: number;
  fireDamage: number;
  smokesThrown: number;
  utilityKills: number;
  utilityDamage: number;
}

export interface TournamentPerformancePlayerRoundFact {
  roundSeq: number;
  playerEntityKey: string;
  teamEntityKey: string;
  side: TournamentSide;
  teamWonRound: boolean;

  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  headshots: number;
  survived: boolean;
  kast: boolean;

  tradeKills: number;
  tradedDeaths: number;
  openingDuel: TournamentOpeningDuel;

  clutch: {
    opponentCount: TournamentClutchOpponentCount;
    won: boolean;
  } | null;

  utility: TournamentPerformanceUtilityFact;
}

export interface TournamentPerformanceObjectiveFact {
  roundSeq: number;
  type: "planted" | "defused";
  playerEntityKey: string | null;
  teamEntityKey: string | null;
  side: TournamentSide | null;
  teamWonRound: boolean | null;
}

export interface TournamentPerformancePlayerWeaponFact {
  playerEntityKey: string;
  teamEntityKey: string;
  weapon: string;
  kills: number;
  headshotKills: number;
}

/**
 * Public additive input for tournament performance analytics. It contains
 * only already-frozen sufficient facts; it is not a DemoPackage replacement.
 */
export interface TournamentPerformanceMapFacts {
  semanticProfile: string;
  analysisVersion: string;
  mapKey: string;
  matchKey: string;
  mapName: string;
  teamEntityKeys: Record<TournamentTeamSlot, string>;

  playerRounds: TournamentPerformancePlayerRoundFact[];
  objectives: TournamentPerformanceObjectiveFact[];
  playerWeapons: TournamentPerformancePlayerWeaponFact[];
}

export interface TournamentPerformanceSample {
  rounds: number;
}

export interface TournamentPerformanceCombatSummary {
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  headshots: number;
  killsPerRound: TournamentRateSample;
  deathsPerRound: TournamentRateSample;
  assistsPerRound: TournamentRateSample;
  damagePerRound: TournamentRateSample;
  headshotRate: TournamentRateSample;
  twoKillRounds: number;
  threeKillRounds: number;
  fourKillRounds: number;
  fiveKillRounds: number;
}

export interface TournamentPerformanceOpeningSummary {
  firstKills: number;
  firstDeaths: number;
  attempts: number;
  successRate: TournamentRateSample;
  attemptRate: TournamentRateSample;
  firstKillsPerRound: TournamentRateSample;
  firstDeathsPerRound: TournamentRateSample;
  roundWinsAfterWinningOpeningDuel: number;
  winRateAfterWinningOpeningDuel: TournamentRateSample;
  roundWinsAfterLosingOpeningDuel: number;
  comebackRateAfterLosingOpeningDuel: TournamentRateSample;
}

/**
 * Map/global opening conversion is round-based. It deliberately does not
 * expose player duel attempts, which would count both sides of one duel.
 */
export interface TournamentPerformanceOpeningConversionSummary {
  /** All rounds in the map/global scope; the coverage denominator. */
  openingRounds: number;
  /** Rounds containing one validated opening duel. */
  roundsWithOpening: number;
  openingWinnerTeamRoundWins: number;
  openingLoserTeamComebacks: number;
  conversionRate: TournamentRateSample;
  comebackRate: TournamentRateSample;
}

export interface TournamentPerformanceTradeSummary {
  tradeKills: number;
  tradedDeaths: number;
  tradedOpeningDeaths: number;
  deaths: number;
  tradeKillsPerRound: TournamentRateSample;
  tradedDeathsPerDeath: TournamentRateSample;
}

export type TournamentClutchSplitKey = "1" | "2" | "3" | "4" | "5";
export type TournamentClutchSplits = Record<TournamentClutchSplitKey, TournamentRateSample>;

export interface TournamentPerformanceClutchSummary {
  attempts: number;
  wins: number;
  winRate: TournamentRateSample;
  frequency: TournamentRateSample;
  byOpponentCount: TournamentClutchSplits;
}

export interface TournamentPerformanceUtilitySummary {
  flashesThrown: number;
  enemyBlindSeconds: number;
  teamBlindSeconds: number;
  netBlindSeconds: number;
  enemyBlindVictims: number;
  flashAssists: number;
  heThrows: number;
  heDamage: number;
  fireThrows: number;
  fireDamage: number;
  smokesThrown: number;
  utilityKills: number;
  utilityDamage: number;
  enemyBlindSecondsPerFlash: TournamentRateSample;
  netBlindSecondsPerFlash: TournamentRateSample;
  enemyBlindSecondsPerRound: TournamentRateSample;
  teamBlindSecondsPerRound: TournamentRateSample;
  flashAssistsPerRound: TournamentRateSample;
  heDamagePerThrow: TournamentRateSample;
  heDamagePerRound: TournamentRateSample;
  fireDamagePerThrow: TournamentRateSample;
  fireDamagePerRound: TournamentRateSample;
  smokesPerRound: TournamentRateSample;
  utilityKillsPerRound: TournamentRateSample;
  utilityDamagePerRound: TournamentRateSample;
}

export interface TournamentPerformanceObjectiveSummary {
  plants: number;
  defuses: number;
  plantsConverted: number;
  plantConversions: TournamentRateSample;
}

export interface TournamentPerformancePlayerSlice {
  sample: TournamentPerformanceSample;
  combat: TournamentPerformanceCombatSummary;
  kast: TournamentRateSample;
  survival: TournamentRateSample;
  opening: TournamentPerformanceOpeningSummary;
  trade: TournamentPerformanceTradeSummary;
  clutch: TournamentPerformanceClutchSummary;
  utility: TournamentPerformanceUtilitySummary;
  objective: TournamentPerformanceObjectiveSummary;
}

export interface TournamentPerformanceTeamSlice {
  sample: TournamentPerformanceSample;
  opening: TournamentPerformanceOpeningSummary;
  trade: TournamentPerformanceTradeSummary;
  clutch: TournamentPerformanceClutchSummary;
  utility: TournamentPerformanceUtilitySummary;
  objective: TournamentPerformanceObjectiveSummary;
}

export interface TournamentPerformanceWeaponSummary {
  weapon: string;
  kills: number;
  headshotKills: number;
  headshotRate: TournamentRateSample;
  killShare: TournamentRateSample;
  killsPerRound: TournamentRateSample;
}

export interface TournamentPerformancePlayerWeaponSummary extends TournamentPerformanceWeaponSummary {
  teamEntityKeys: string[];
}

export interface TournamentPerformanceGlobalWeaponSummary extends TournamentPerformanceWeaponSummary {
  topPlayer: (TournamentEntityRef & { kills: number }) | null;
}

export interface TournamentPerformancePlayerSummary {
  player: TournamentEntityRef;
  teamEntityKeys: string[];
  matchCount: number;
  mapCount: number;
  slices: TournamentSideSlices<TournamentPerformancePlayerSlice>;
  weapons: TournamentPerformancePlayerWeaponSummary[];
}

export interface TournamentPerformanceTeamSummary {
  team: TournamentEntityRef;
  matchCount: number;
  mapCount: number;
  roundCount: number;
  slices: TournamentSideSlices<TournamentPerformanceTeamSlice>;
  weapons: TournamentPerformanceWeaponSummary[];
}

export interface TournamentPerformanceMapSummary {
  mapName: string;
  matchCount: number;
  mapCount: number;
  roundCount: number;
  opening: TournamentPerformanceOpeningConversionSummary;
  utility: TournamentPerformanceUtilitySummary;
  objective: TournamentPerformanceObjectiveSummary;
}

export interface TournamentPerformanceAnalytics {
  provenance: {
    semanticProfile: string | null;
    analysisVersions: string[];
  };
  totals: {
    matchCount: number;
    mapCount: number;
    roundCount: number;
    opening: TournamentPerformanceOpeningConversionSummary;
    utility: TournamentPerformanceUtilitySummary;
    objective: TournamentPerformanceObjectiveSummary;
  };
  players: TournamentPerformancePlayerSummary[];
  teams: TournamentPerformanceTeamSummary[];
  maps: TournamentPerformanceMapSummary[];
  weapons: TournamentPerformanceGlobalWeaponSummary[];
}
