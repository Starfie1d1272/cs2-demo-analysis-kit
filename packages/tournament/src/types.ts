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
