import type { StudioPageId } from "./studio-navigation.js";

export interface MatchesPageState { search: string; mapFilter: string | null; tagFilter: string | null; serverFilter: string | null; dateFrom: string; dateTo: string }
export interface EventsPageState { activeEventId: string | null; activeStageKey: string | null; selectedSeriesId: string | null }
export const emptyMatchesState = (): MatchesPageState => ({ search: "", mapFilter: null, tagFilter: null, serverFilter: null, dateFrom: "", dateTo: "" });
export const emptyEventsState = (): EventsPageState => ({ activeEventId: null, activeStageKey: null, selectedSeriesId: null });
export type StudioPageStateMap = { [P in StudioPageId]: P extends "matches" ? MatchesPageState : P extends "events" ? EventsPageState : P extends "management" ? { tab: "identity" | "assets" | "library"; library: MatchesPageState } : null };
