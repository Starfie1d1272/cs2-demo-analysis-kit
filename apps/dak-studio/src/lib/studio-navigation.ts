import { emptyOpeningPageState, emptyControlPageState } from "./spatial-view-state";
import { emptyPatternPageState } from "./pattern-page-state";
import { createAnalysisContext, createAnalysisContextPreset, type AnalysisContext } from "./analysis-context.js";
import { emptyDuelState, emptyEconomyState, emptyLineupsState } from "./analysis-theme-state";
import { emptyMaterialsPageState } from "./material-page-state";
import type { LectureMaterialRef, MaterialRef } from "./material-ref.js";
import { emptyMatchesState, emptyEventsState, emptyUtilityState, emptyPlayerState, emptyTeamState, emptyAnalysisState, emptyRolesState, type StudioPageStateMap } from "./studio-page-state.js";

export type StudioSection = "workbench" | "matches" | "analysis" | "materials" | "management";
export type AnalysisPageId = "analysis" | "player" | "team" | "event-analysis" | "duel" | "economy" | "utility" | "lineups" | "opening" | "control" | "patterns" | "roles";
export type AnalysisDestination = { [P in AnalysisPageId]: { page: P; context: AnalysisContext } }[AnalysisPageId];
export type StudioDestination =
  | { page: "workbench" } | { page: "matches"; entryIds?: string[] } | { page: "events"; eventId?: string }
  | { page: "match"; entryId: string; roundNumber?: number; tick?: number }
  | AnalysisDestination | { page: "materials" } | { page: "material"; materialRef: MaterialRef }
  | { page: "lecture"; materialRef: LectureMaterialRef }
  | { page: "management"; tab: "identity" | "assets" | "library" };
export type StudioPageId = StudioDestination["page"];
export type DestinationFor<P extends StudioPageId> = Extract<StudioDestination, { page: P }>;
export type StudioFrame = { [P in StudioPageId]: { id: string; destination: DestinationFor<P>; ui: StudioPageStateMap[P]; scrollY: number; anchorKey?: string; originSavedAnalysisId?: string } }[StudioPageId];

export const PAGE_SECTION: Record<StudioPageId, StudioSection> = {
  workbench: "workbench", matches: "matches", events: "matches", match: "matches",
  analysis: "analysis", player: "analysis", team: "analysis",
  "event-analysis": "analysis", duel: "analysis", economy: "analysis", utility: "analysis",
  lineups: "analysis", opening: "analysis", control: "analysis", patterns: "analysis", roles: "analysis",
  materials: "materials", material: "materials", lecture: "materials", management: "management",
};
export function defaultDestination(section: StudioSection): StudioDestination {
  switch (section) {
    case "workbench": return { page: "workbench" };
    case "matches": return { page: "matches" };
    case "analysis": return { page: "analysis", context: createAnalysisContextPreset("explore") };
    case "materials": return { page: "materials" };
    case "management": return { page: "management", tab: "identity" };
  }
}
function copyDestination(destination: StudioDestination): StudioDestination {
  if (destination.page === "matches" && destination.entryIds) return { ...destination, entryIds: [...destination.entryIds] };
  if ("context" in destination) return { ...destination, context: createAnalysisContext(destination.context) };
  if ("materialRef" in destination) return { ...destination, materialRef: { ...destination.materialRef } } as StudioDestination;
  return { ...destination };
}
function frame(id: string, destination: StudioDestination): StudioFrame {
  return { id, destination: copyDestination(destination), ui: destination.page === "roles" ? emptyRolesState() : destination.page === "opening" ? emptyOpeningPageState() : destination.page === "control" ? emptyControlPageState() : destination.page === "patterns" ? emptyPatternPageState() : destination.page === "analysis" || destination.page === "event-analysis" ? emptyAnalysisState() : destination.page === "player" ? emptyPlayerState() : destination.page === "team" ? emptyTeamState() : destination.page === "materials" ? emptyMaterialsPageState() : destination.page === "duel" ? emptyDuelState() : destination.page === "economy" ? emptyEconomyState() : destination.page === "lineups" ? emptyLineupsState() : destination.page === "utility" ? emptyUtilityState() : destination.page === "matches" ? emptyMatchesState() : destination.page === "events" ? { ...emptyEventsState(), activeEventId: destination.eventId ?? null } : destination.page === "management" ? { tab: destination.tab, library: emptyMatchesState() } : null, scrollY: 0 } as StudioFrame;
}
export interface StudioNavigation {
  active: StudioFrame;
  history: StudioFrame[];
  resume: Partial<Record<StudioSection, string>>;
}
export type NavigationAction =
  | { intent: "open"; id: string; destination: StudioDestination; scrollY: number }
  | { intent: "open-saved"; id: string; saved: import("./saved-analysis").SavedAnalysis; scrollY: number }
  | { intent: "switch-analysis"; id: string; destination: AnalysisDestination; scrollY: number }
  | { intent: "evidence"; id: string; destination: DestinationFor<"match">; scrollY: number; sourceKey?: string }
  | { intent: "resume"; id: string; section: StudioSection; scrollY: number }
  | { intent: "back"; id: string }
  | { intent: "restore"; frame: StudioFrame }
  | { intent: "evidence-target"; destination: DestinationFor<"match"> }
  | { intent: "saved-origin"; frameId: string; id: string }
  | { intent: "context"; frameId: string; context: AnalysisContext }
  | { intent: "ui"; frameId: string; ui: StudioPageStateMap[StudioPageId] }
  | { intent: "position"; frameId: string; scrollY: number; anchorKey?: string };
export function createStudioNavigation(id: string): StudioNavigation {
  return { active: frame(id, defaultDestination("workbench")), history: [], resume: {} };
}
/** 查找同一语义上下文的最近分析页面，用于主题切换恢复。 */
export function findAnalysisFrame(history: readonly StudioFrame[], destination: AnalysisDestination, originSavedAnalysisId?: string): StudioFrame | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (item.originSavedAnalysisId === originSavedAnalysisId && item.destination.page === destination.page && "context" in item.destination && JSON.stringify(item.destination.context) === JSON.stringify(destination.context)) return item;
  }
  return undefined;
}
export function studioNavigationReducer(state: StudioNavigation, action: NavigationAction): StudioNavigation {
  if (action.intent === "restore") return { ...state, active: structuredClone(action.frame), history: state.history.filter(item => item.id !== action.frame.id) };
  if (action.intent === "evidence-target") return { ...state, active: { ...state.active, destination: action.destination, ui: null } as StudioFrame };
  if (action.intent === "saved-origin") return state.active.id === action.frameId ? { ...state, active: { ...state.active, originSavedAnalysisId: action.id } as StudioFrame } : state;
  if (action.intent === "context") {
    if (state.active.id !== action.frameId || !("context" in state.active.destination)) return state;
    const focusChanged = JSON.stringify(state.active.destination.context.focus) !== JSON.stringify(action.context.focus);
    return { ...state, active: { ...state.active, ...(focusChanged ? { originSavedAnalysisId: undefined } : {}), destination: { ...state.active.destination, context: createAnalysisContext(action.context) } } as StudioFrame };
  }
  if (action.intent === "ui") return state.active.id === action.frameId ? { ...state, active: { ...state.active, ui: action.ui } as StudioFrame } : state;
  if (action.intent === "position") return state.active.id === action.frameId ? { ...state, active: { ...state.active, scrollY: action.scrollY, anchorKey: action.anchorKey } } : state;
  if (action.intent === "back") {
    const previous = state.history.at(-1);
    const history = state.history.slice(0, -1);
    const active = previous ?? frame(action.id, defaultDestination(PAGE_SECTION[state.active.destination.page]));
    const ids = new Set([active.id, ...history.map(item => item.id)]);
    const resume = Object.fromEntries(Object.entries(state.resume).filter(([, id]) => ids.has(id)));
    return { active, history, resume: { ...resume, [PAGE_SECTION[active.destination.page]]: active.id } };
  }
  if (action.intent === "open-saved") {
    const next = studioNavigationReducer(state, { intent: "open", id: action.id, destination: { page: action.saved.page, context: action.saved.context }, scrollY: action.scrollY });
    return { ...next, active: { ...next.active, ui: structuredClone(action.saved.ui), originSavedAnalysisId: action.saved.id } as StudioFrame };
  }
  if (action.intent === "switch-analysis") {
    const source = { ...state.active, scrollY: action.scrollY } as StudioFrame;
    const active = findAnalysisFrame(state.history, action.destination, state.active.originSavedAnalysisId);
    if (active) {
      const history = [...state.history.filter(item => item.id !== active.id), source].slice(-20);
      return { active, history, resume: { ...state.resume, analysis: active.id } };
    }
    const next = studioNavigationReducer(state, { ...action, intent: "open" });
    return { ...next, active: { ...next.active, originSavedAnalysisId: state.active.originSavedAnalysisId } as StudioFrame };
  }
  const source = { ...state.active, scrollY: action.scrollY, ...(action.intent === "evidence" ? { anchorKey: action.sourceKey } : {}) } as StudioFrame;
  const section = PAGE_SECTION[source.destination.page];
  let history = [...state.history, source];
  let active: StudioFrame;
  if (action.intent === "resume") {
    const resumeId = state.resume[action.section];
    const index = history.findIndex(item => item.id === resumeId);
    active = index >= 0 ? history[index] : frame(action.id, defaultDestination(action.section));
    if (index >= 0) history = history.filter((_, i) => i !== index);
  } else active = frame(action.id, action.destination);
  history = history.slice(-20);
  const ids = new Set([active.id, ...history.map(item => item.id)]);
  const resume = Object.fromEntries(Object.entries({ ...state.resume, [section]: source.id }).filter(([, id]) => ids.has(id)));
  return { active, history, resume: { ...resume, [PAGE_SECTION[active.destination.page]]: active.id } };
}
