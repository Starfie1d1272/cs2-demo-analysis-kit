import type { ReplayViewState, TableState } from "@cs2dak/presentation";
import type { EconomyEntry } from "@cs2dak/tactics";

export interface PatternExplorerState {
  mapName: string | null;
  side: "t" | "ct";
  economyEntry: EconomyEntry | "all";
  clusterId: string | null;
  selectedFactKey: string | null;
  replaySource: string | null;
  replay: ReplayViewState | null;
  evidenceTable: TableState;
  namesTable: TableState;
}
export interface PatternPageState {
  section: "patterns" | "anti";
  explorer: PatternExplorerState;
}
export const emptyPatternPageState = (): PatternPageState => ({
  section: "patterns", explorer: { mapName: null, side: "t", economyEntry: "gun", clusterId: null, selectedFactKey: null, replaySource: null, replay: null, evidenceTable: { sort: { key: null, direction: "desc" }, page: 0 }, namesTable: { sort: { key: null, direction: "desc" }, page: 0 } },
});
