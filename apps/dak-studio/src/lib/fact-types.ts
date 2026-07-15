import type { C4RouteFact, CtRotationRoundFact, ExecuteBucket, PlayerPositionRoundFact, SiteEntryFact, TacticalGrenadeOccurrence, TacticalPlantFact, TacticalRoundFact, TeamAwpRoundFact, TeamShapeRoundFact } from "@cs2dak/core";
import type { DemoPackage, PlayerWeaponHighlightFacts, RRIndicators, RRSignals, Side, TeamKey } from "@cs2dak/contract";
import type { CalloutGrid, LineupGrenadeLike, TriangleBvh, Vec3 } from "@cs2dak/maps";
import type { PlayerMechanicsProfile, PlayerSeasonInsights, PlayerWeaponStat } from "@cs2dak/presentation";

interface FactBase {
  matchId: string;
}

interface PlayerFactBase extends FactBase {
  playerKey: string;
  steamId64: string;
  playerName: string;
}

interface MatchFactBase extends FactBase {
  mapName: string;
}

export interface PlayerMatchStatsFact extends PlayerFactBase {
  teamKey: TeamKey;
  mapName: string;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  damageHealth: number;
  kastRounds: number;
  firstKillCount: number;
  firstDeathCount: number;
  flashAssistCount: number;
  enemyFlashDurationSeconds: number;
  teamFlashDurationSeconds: number;
  utilityDamage: number;
  tradeKillCount: number;
  tradeDeathCount: number;
  headshotCount: number;
  vsOneCount: number;
  vsOneWonCount: number;
  vsTwoCount: number;
  vsTwoWonCount: number;
  vsThreeCount: number;
  vsThreeWonCount: number;
  vsFourCount: number;
  vsFourWonCount: number;
  vsFiveCount: number;
  vsFiveWonCount: number;
}

export interface PlayerWeaponFact extends PlayerFactBase {
  weapon: string;
  kills: number;
  headshots: number;
}

export interface MechanicsSamplesFact extends PlayerFactBase {
  weapon: string;
  row: import("@cs2dak/core").PlayerMechanicsFact;
}

export interface PlayerRrFact extends PlayerFactBase {
  sourceDemoHash: string | null;
  teamKey: TeamKey;
  signals: RRSignals;
  indicators: RRIndicators;
  weaponHighlight: PlayerWeaponHighlightFacts | null;
}

export interface LineupFact extends MatchFactBase {
  grenades: LineupGrenadeLike[];
  roundWinners: Array<[string, string]>;
  tickrate: number;
}

export interface MatchFacts {
  matchId: string;
  mapName: string;
  playerMatchStats: PlayerMatchStatsFact[];
  playerWeapons: PlayerWeaponFact[];
  mechanicsSamples: MechanicsSamplesFact[];
  rrSignalRows: PlayerRrFact[];
  lineups: LineupFact[];
  tacticalRounds: TacticalRoundFact[];
  playerPositionRounds: PlayerPositionRoundFact[];
  teamShapeRounds: TeamShapeRoundFact[];
  teamAwpRounds: TeamAwpRoundFact[];
  ctRotationRounds: CtRotationRoundFact[];
}

export interface ExtractMatchFactsOptions {
  matchId: string;
  visibilityFor?: (mapName: string) => TriangleBvh | null;
  calloutGrid?: CalloutGrid | null;
  playerKeyFor?: (player: { steamId64: string; name: string; teamKey: string }) => string;
}

export interface FactsScope {
  matchIds?: string[];
  playerKeys?: string[];
  steamIds?: string[];
  mapNames?: string[];
}

export interface ProjectedMechanicsRows {
  matchId: string;
  rows: import("@cs2dak/core").PlayerMechanicsFact[];
}

export interface FactsStore {
  putMatchFacts(facts: MatchFacts): Promise<void>;
  getPlayerMatchStats(scope?: FactsScope): Promise<PlayerMatchStatsFact[]>;
  getPlayerWeapons(scope?: FactsScope): Promise<PlayerWeaponFact[]>;
  getMechanicsRows(scope?: FactsScope): Promise<ProjectedMechanicsRows[]>;
  getRrSignalRows(scope?: FactsScope): Promise<PlayerRrFact[]>;
  getLineups(scope?: FactsScope): Promise<LineupFact[]>;
  getTacticalRounds(scope?: FactsScope): Promise<TacticalRoundFact[]>;
  getPlayerPositionRounds(scope?: FactsScope): Promise<PlayerPositionRoundFact[]>;
  getTeamShapeRounds(scope?: FactsScope): Promise<TeamShapeRoundFact[]>;
  getTeamAwpRounds(scope?: FactsScope): Promise<TeamAwpRoundFact[]>;
  getCtRotationRounds(scope?: FactsScope): Promise<CtRotationRoundFact[]>;
  deleteMatchFacts(matchId: string): Promise<void>;
}

export interface PlayerSeasonDetailsFactsOptions extends FactsScope {
  steamIds: string[];
}

export interface PlayerSeasonDetailsFromFacts {
  insights: PlayerSeasonInsights;
  weaponStats: PlayerWeaponStat[];
  mechanics: PlayerMechanicsProfile;
}

export interface PlayerFlashSummariesFactsOptions extends FactsScope {
  players: Array<{ playerKey: string; name: string; steamIds: string[] }>;
}

export interface UtilityValueFactsOptions extends FactsScope {
  players: Array<{ playerKey: string; name: string; steamIds: string[] }>;
  teamRenames?: Record<string, string>;
  selectedTeams?: string[];
}

export type { C4RouteFact, CtRotationRoundFact, ExecuteBucket, PlayerPositionRoundFact, SiteEntryFact, TacticalGrenadeOccurrence, TacticalPlantFact, TacticalRoundFact, TeamAwpRoundFact, TeamShapeRoundFact };
export type { DemoPackage, Side, TeamKey };
export type { Vec3 };
