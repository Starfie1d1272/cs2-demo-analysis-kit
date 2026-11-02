import type { OpeningPageState, ControlPageState } from "./spatial-view-state";
import type { PatternPageState } from "./pattern-page-state";
import type { LecturePageState, MaterialPageState, MaterialsPageState } from "./material-page-state";
import type { TableState } from "@cs2dak/presentation";
import type { MatchWorkspaceState } from "./match-workspace-state";
import type { DuelPageState, EconomyPageState, LineupsPageState } from "./analysis-theme-state";
import type { StudioPageId } from "./studio-navigation.js";

export interface MatchesPageState { search: string; mapFilter: string | null; tagFilter: string | null; serverFilter: string | null; dateFrom: string; dateTo: string }
export interface EventsPageState { activeEventId: string | null; activeStageKey: string | null; selectedSeriesId: string | null }
export const emptyMatchesState = (): MatchesPageState => ({ search: "", mapFilter: null, tagFilter: null, serverFilter: null, dateFrom: "", dateTo: "" });
export const emptyEventsState = (): EventsPageState => ({ activeEventId: null, activeStageKey: null, selectedSeriesId: null });
export interface UtilityPageState { tables: Partial<Record<"hePlayers" | "heTeams" | "firePlayers" | "fireTeams" | "flashPlayers" | "flashTeams" | "smokePlayers" | "smokeTeams", TableState>>; selectedEvidenceKey: string | null }
export const emptyUtilityState = (): UtilityPageState => ({ tables: {}, selectedEvidenceKey: null });
export type PlayerTrendMetric = "adr" | "kast" | "fkMinusFd" | "utilityDamagePerRound";
export interface PlayerPageState { trendMetric: PlayerTrendMetric; profileTab: "overview" | "aim" | "utility" | "trend"; comparePlayerKey: string | null; flashMode: "net" | "enemy" }
export const emptyPlayerState = (): PlayerPageState => ({ profileTab: "overview", comparePlayerKey: null, flashMode: "net", trendMetric: "adr" });
export interface TeamPageState { compareTeamName: string | null; tables: Partial<Record<"maps" | "roster", TableState>> }
export const emptyTeamState = (): TeamPageState => ({ compareTeamName: null, tables: {} });
export interface PlayerRolesState { tables: Partial<Record<"roles" | "mapPool", TableState>> }
export interface TeamRolesState { matrixMapName: string | null; matrixSide: "t" | "ct"; tables: Partial<Record<"roles", TableState>> }
export interface AnalysisPageState { comparePair: [string, string] | null; leaderboardView: import("@cs2dak/presentation").LeaderboardViewKey; tables: Partial<Record<"maps" | "weapons" | "leaderboard", TableState>> }
export const emptyAnalysisState = (): AnalysisPageState => ({ comparePair: null, leaderboardView: "core", tables: {} });
export interface RolesPageState { player: PlayerRolesState; team: TeamRolesState }
export const emptyRolesState = (): RolesPageState => ({ player: { tables: {} }, team: { matrixMapName: null, matrixSide: "ct", tables: {} } });
export type StudioPageStateMap = { [P in StudioPageId]: P extends "roles" ? RolesPageState : P extends "opening" ? OpeningPageState : P extends "control" ? ControlPageState : P extends "patterns" ? PatternPageState : P extends "analysis" | "event-analysis" ? AnalysisPageState : P extends "player" ? PlayerPageState : P extends "team" ? TeamPageState : P extends "materials" ? MaterialsPageState : P extends "lecture" ? LecturePageState | null : P extends "material" ? MaterialPageState | null : P extends "match" ? MatchWorkspaceState | null : P extends "duel" ? DuelPageState : P extends "economy" ? EconomyPageState : P extends "lineups" ? LineupsPageState : P extends "utility" ? UtilityPageState : P extends "matches" ? MatchesPageState : P extends "events" ? EventsPageState : P extends "management" ? { tab: "identity" | "assets" | "library"; library: MatchesPageState } : null };
