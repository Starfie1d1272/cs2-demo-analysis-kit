import { createAnalysisContext, createAnalysisContextPreset, type AnalysisContext } from "./analysis-context.js";
import type { LectureMaterialRef, MaterialRef } from "./material-ref.js";
import type { StudioPageStateMap } from "./studio-page-state.js";

export type StudioSection = "workbench" | "matches" | "analysis" | "materials" | "management";
export type AnalysisPageId = "analysis" | "personal-review" | "player" | "team" | "event-analysis" | "duel" | "economy" | "utility" | "lineups" | "opening" | "control" | "patterns";
export type AnalysisDestination = { [P in AnalysisPageId]: { page: P; context: AnalysisContext } }[AnalysisPageId];
export type StudioDestination =
  | { page: "workbench" } | { page: "matches" } | { page: "events"; eventId?: string }
  | { page: "match"; entryId: string; roundNumber?: number; tick?: number }
  | AnalysisDestination | { page: "materials" } | { page: "material"; materialRef: MaterialRef }
  | { page: "lecture"; materialRef: LectureMaterialRef }
  | { page: "management"; tab: "identity" | "assets" | "library" };
export type StudioPageId = StudioDestination["page"];
export type DestinationFor<P extends StudioPageId> = Extract<StudioDestination, { page: P }>;
export type StudioFrame = { [P in StudioPageId]: { id: string; destination: DestinationFor<P>; ui: StudioPageStateMap[P]; scrollY: number; anchorKey?: string } }[StudioPageId];

export const PAGE_SECTION: Record<StudioPageId, StudioSection> = {
  workbench: "workbench", matches: "matches", events: "matches", match: "matches",
  analysis: "analysis", "personal-review": "analysis", player: "analysis", team: "analysis",
  "event-analysis": "analysis", duel: "analysis", economy: "analysis", utility: "analysis",
  lineups: "analysis", opening: "analysis", control: "analysis", patterns: "analysis",
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
  if ("context" in destination) return { ...destination, context: createAnalysisContext(destination.context) };
  if ("materialRef" in destination) return { ...destination, materialRef: { ...destination.materialRef } } as StudioDestination;
  return { ...destination };
}
function frame(id: string, destination: StudioDestination): StudioFrame {
  return { id, destination: copyDestination(destination), ui: null, scrollY: 0 } as StudioFrame;
}
export interface StudioNavigation {
  active: StudioFrame;
  history: StudioFrame[];
  resume: Partial<Record<StudioSection, string>>;
}
export type NavigationAction =
  | { intent: "open"; id: string; destination: StudioDestination; scrollY: number }
  | { intent: "evidence"; id: string; destination: DestinationFor<"match">; scrollY: number; sourceKey?: string }
  | { intent: "resume"; id: string; section: StudioSection; scrollY: number }
  | { intent: "back"; id: string }
  | { intent: "context"; frameId: string; context: AnalysisContext }
  | { intent: "ui"; frameId: string; ui: null }
  | { intent: "position"; frameId: string; scrollY: number; anchorKey?: string };
export function createStudioNavigation(id: string): StudioNavigation {
  return { active: frame(id, defaultDestination("workbench")), history: [], resume: {} };
}
export function studioNavigationReducer(state: StudioNavigation, action: NavigationAction): StudioNavigation {
  if (action.intent === "context") {
    if (state.active.id !== action.frameId || !("context" in state.active.destination)) return state;
    return { ...state, active: { ...state.active, destination: { ...state.active.destination, context: createAnalysisContext(action.context) } } as StudioFrame };
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
  const source = { ...state.active, scrollY: action.scrollY, ...(action.intent === "evidence" ? { anchorKey: action.sourceKey } : {}) } as StudioFrame;
  const section = PAGE_SECTION[source.destination.page];
  let history = [...state.history, source];
  let active: StudioFrame;
  if (action.intent === "resume") {
    const resumeId = state.resume[action.section];
    const index = history.findIndex(item => item.id === resumeId);
    active = index >= 0 ? history[index] : frame(action.id, defaultDestination(action.section));
    if (index >= 0) history = history.slice(0, index);
  } else active = frame(action.id, action.destination);
  history = history.slice(-20);
  const ids = new Set([active.id, ...history.map(item => item.id)]);
  const resume = Object.fromEntries(Object.entries({ ...state.resume, [section]: source.id }).filter(([, id]) => ids.has(id)));
  return { active, history, resume: { ...resume, [PAGE_SECTION[active.destination.page]]: active.id } };
}
