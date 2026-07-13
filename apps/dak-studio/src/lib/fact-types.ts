import type { C4RouteFact, ExecuteBucket, PlayerPositionRoundFact, SiteEntryFact, TacticalGrenadeOccurrence, TacticalPlantFact, TacticalRoundFact, TeamShapeRoundFact } from "@cs2dak/core";
import type { SeasonCohortFactRow } from "@cs2dak/cohort";
import type { DemoPackage, MatchWorkspaceModel, OpeningTrailsModel, Side, TeamKey } from "@cs2dak/contract";
import type { CalloutGrid, LineupGrenadeLike, TriangleBvh, Vec3 } from "@cs2dak/maps";
import type {
  DuelInsightsFacts,
  PlayerMechanicsProfile,
  PlayerSeasonInsights,
  PlayerWeaponStat,
  TeamComparisonFacts,
  TournamentFacts,
  UtilityValueSummary,
} from "@cs2dak/presentation";

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

export interface PlayerInsightFact extends PlayerFactBase {
  insight: PlayerSeasonInsights;
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

export interface CohortFact extends PlayerFactBase {
  row: SeasonCohortFactRow;
}

export interface TournamentFact extends MatchFactBase {
  row: TournamentFacts;
}

export interface TeamComparisonFact extends MatchFactBase {
  row: TeamComparisonFacts;
}

export interface DuelFact extends MatchFactBase {
  row: DuelInsightsFacts;
}

export interface MatchWorkspaceFact extends MatchFactBase {
  row: MatchWorkspaceModel;
}

export interface OpeningTrailFact extends MatchFactBase {
  playerKey: string;
  steamId64: string;
  row: OpeningTrailsModel;
}

export interface LineupFact extends MatchFactBase {
  grenades: LineupGrenadeLike[];
  roundWinners: Array<[string, string]>;
  tickrate: number;
}

export interface UtilityValueFact extends MatchFactBase {
  row: UtilityValueSummary;
}

export interface MatchFacts {
  matchId: string;
  mapName: string;
  playerMatchStats: PlayerMatchStatsFact[];
  playerInsights: PlayerInsightFact[];
  playerWeapons: PlayerWeaponFact[];
  mechanicsSamples: MechanicsSamplesFact[];
  cohortRows: CohortFact[];
  tournamentFacts: TournamentFact[];
  teamComparisonFacts: TeamComparisonFact[];
  duelFacts: DuelFact[];
  matchWorkspace: MatchWorkspaceFact[];
  openingTrails: OpeningTrailFact[];
  lineups: LineupFact[];
  tacticalRounds: TacticalRoundFact[];
  playerPositionRounds: PlayerPositionRoundFact[];
  teamShapeRounds: TeamShapeRoundFact[];
  utilityValueFacts: UtilityValueFact[];
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
  getPlayerInsights(scope?: FactsScope): Promise<PlayerInsightFact[]>;
  getPlayerWeapons(scope?: FactsScope): Promise<PlayerWeaponFact[]>;
  getMechanicsRows(scope?: FactsScope): Promise<ProjectedMechanicsRows[]>;
  getCohortRows(scope?: FactsScope): Promise<SeasonCohortFactRow[]>;
  getTournamentFacts(scope?: FactsScope): Promise<TournamentFacts[]>;
  getTeamComparisonFacts(scope?: FactsScope): Promise<TeamComparisonFacts[]>;
  getDuelFacts(scope?: FactsScope): Promise<DuelInsightsFacts[]>;
  /** 单场 workspace：仅读旧库残留（新导入不再持久化，由 loadMatchWorkspaceModel 懒算）。 */
  getMatchWorkspace(matchId: string): Promise<MatchWorkspaceFact | null>;
  getOpeningTrails(scope?: FactsScope): Promise<OpeningTrailFact[]>;
  getLineups(scope?: FactsScope): Promise<LineupFact[]>;
  getTacticalRounds(scope?: FactsScope): Promise<TacticalRoundFact[]>;
  getPlayerPositionRounds(scope?: FactsScope): Promise<PlayerPositionRoundFact[]>;
  getTeamShapeRounds(scope?: FactsScope): Promise<TeamShapeRoundFact[]>;
  getUtilityValueFacts(scope?: FactsScope): Promise<UtilityValueSummary[]>;
  /** 只读 utility facts 的逐场可用性；不加载或重算完整 DemoPackage。 */
  getUtilityValueFactMatchIds(scope?: FactsScope): Promise<string[]>;
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

export type { C4RouteFact, ExecuteBucket, PlayerPositionRoundFact, SiteEntryFact, TacticalGrenadeOccurrence, TacticalPlantFact, TacticalRoundFact, TeamShapeRoundFact };
export type { DemoPackage, Side, TeamKey };
export type { Vec3 };
