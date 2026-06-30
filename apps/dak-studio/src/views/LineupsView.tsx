import { EmptyState } from "@cs2dak/react";
import type { StudioDemoEntry } from "../lib/library";
import { LineupView } from "./LineupView";

export interface LineupsViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
}

export function LineupsView({ allEntries, entries, onOpenMatch, onWatchDemo, onGoLibrary }: LineupsViewProps) {
  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有道具点位"
          hint="先导入 demo，再按地图查看常用投掷物出手点、落点和证据回合。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>道具点位库</h1>
          <p>按地图聚类常用投掷物，沉淀出手点、落点与可回看的证据回合。</p>
        </div>
      </header>
      {entries.length === 0 ? (
        <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整全局范围。" />
      ) : (
        <LineupView entries={entries} onOpenMatch={onOpenMatch} onWatchDemo={onWatchDemo} />
      )}
    </div>
  );
}
