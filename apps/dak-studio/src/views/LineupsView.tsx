import type { AnalysisExportSource } from "../lib/analysis-export";
import { usePageReady } from "../lib/use-page-ready";
import type { StudioDemoEntry } from "../lib/demo-entry";
import { LineupView } from "./LineupView";

export interface LineupsViewProps {
  exportSource?: AnalysisExportSource | null;
  state: import("../lib/analysis-theme-state").LineupsPageState;
  onStateChange: (state: import("../lib/analysis-theme-state").LineupsPageState) => void;
  onPageReady?: (keys: string[]) => void;
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  onOpenEvidence: import("../lib/evidence-continuation").OpenEvidence;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  onRebuild: (ids: string[]) => void;
}

export function LineupsView({ exportSource, state, onStateChange, allEntries, entries, onOpenEvidence, onWatchDemo, onGoLibrary, onRebuild, onPageReady }: LineupsViewProps) {
  usePageReady(allEntries.length === 0 || entries.length === 0, onPageReady);

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>道具点位库</h1>
          <p>按地图聚类常用投掷物，提供出手点、落点、回放与一次性练习；是否有效仍需在比赛证据中核对。</p>
        </div>
      </header>
      <LineupView hasLibrary={allEntries.length > 0} onGoLibrary={onGoLibrary} exportSource={exportSource} state={state} onStateChange={onStateChange} onPageReady={onPageReady} onRebuild={onRebuild} entries={entries} onOpenEvidence={onOpenEvidence} onWatchDemo={onWatchDemo} />
    </div>
  );
}
