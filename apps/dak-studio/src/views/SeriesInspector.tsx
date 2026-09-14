import { useRef, useState } from "react";
import type { SeriesVeto } from "@cs2dak/contract";
import type { StudioDemoEntry } from "../lib/library";
import type { RivalHubImportContext } from "../lib/rivalhub-import";
import type { RivalHubMatchCandidate } from "../lib/rivalhub-match";
import { mapDisplayName, type StudioSeriesRecord } from "../lib/series";
import { rivalHubStatusPresentation } from "../lib/rivalhub-status";
import { RIVALHUB_DROP_ZONE_ATTRIBUTE } from "../lib/rivalhub-acquisition";
import { triggerWindowsDropCapture } from "../lib/dem";
import { BpView } from "./BpView";

function mapsForSeries(series: StudioSeriesRecord): NonNullable<StudioSeriesRecord["mapAssignments"]> {
  if (series.mapAssignments) return series.mapAssignments;
  return series.entryIds.map((entryId, index) => ({ order: index + 1, mapName: "", entryId }));
}

function seriesScore(series: StudioSeriesRecord, entries: StudioDemoEntry[]): { a: number; b: number } {
  if (series.scoreA != null && series.scoreB != null) return { a: series.scoreA, b: series.scoreB };
  return mapsForSeries(series).reduce((score, assignment) => {
    const entry = entries.find((candidate) => candidate.id === assignment.entryId);
    if (!entry || entry.meta.teamAScore === entry.meta.teamBScore) return score;
    const teamAIsSeriesA = entry.meta.teamAName.trim().toLocaleLowerCase() === series.teamAName.trim().toLocaleLowerCase();
    const winnerA = teamAIsSeriesA ? entry.meta.teamAScore > entry.meta.teamBScore : entry.meta.teamBScore > entry.meta.teamAScore;
    return { a: score.a + (winnerA ? 1 : 0), b: score.b + (winnerA ? 0 : 1) };
  }, { a: 0, b: 0 });
}

function MapDrop({
  map,
  eventId,
  candidates,
  onImport,
  onPick,
}: {
  map: NonNullable<StudioSeriesRecord["mapAssignments"]>[number];
  eventId: string;
  candidates: RivalHubMatchCandidate[];
  onImport?: (files: Iterable<File>, context: RivalHubImportContext) => Promise<void>;
  onPick?: (context: RivalHubImportContext) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scopedCandidates = candidates.filter((candidate) => candidate.map.id === map.rivalHub?.id);
  if (!onImport || !map.rivalHub || scopedCandidates.length === 0) return null;
  const context: RivalHubImportContext = {
    scope: "map",
    eventId,
    candidates: scopedCandidates,
    fixedMatchMapId: map.rivalHub.id,
  };
  const start = (files: FileList | File[]) => {
    if (files.length > 0) void onImport(files, context);
  };
  return (
    <>
      <input ref={inputRef} type="file" accept=".dem,.zip,application/zip" hidden onChange={(event) => {
        const files = event.currentTarget.files;
        event.currentTarget.value = "";
        if (files) start(files);
      }} />
      <button
        type="button"
        className="stu-button-sm"
        {...{ [RIVALHUB_DROP_ZONE_ATTRIBUTE]: "" }}
        onClick={() => { if (onPick) void onPick(context); else inputRef.current?.click(); }}
        onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
        onDrop={(event) => { triggerWindowsDropCapture(event.dataTransfer.files); event.preventDefault(); event.stopPropagation(); start(event.dataTransfer.files); }}
      >
        选择 / 拖入 Demo
      </button>
    </>
  );
}

export function SeriesInspector({
  series,
  entries,
  eventId,
  candidates,
  onOpenMatch,
  onImportOnlineFiles,
  onPickOnlineFiles,
}: {
  series: StudioSeriesRecord | null;
  entries: StudioDemoEntry[];
  eventId: string;
  candidates: RivalHubMatchCandidate[];
  onOpenMatch: (entryId: string) => void;
  onImportOnlineFiles?: (files: Iterable<File>, context: RivalHubImportContext) => Promise<void>;
  onPickOnlineFiles?: (context: RivalHubImportContext) => Promise<void>;
}) {
  const [activeMapOrder, setActiveMapOrder] = useState<number | null>(null);
  if (!series) return <div className="stu-card stu-muted">选择一场系列赛查看地图、Demo 与 BP。</div>;
  const score = seriesScore(series, entries);
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const maps = mapsForSeries(series);
  const activeOrder = activeMapOrder ?? maps[0]?.order ?? null;
  const activeMap = maps.find((map) => map.order === activeOrder) ?? maps[0];
  return (
    <section className="stu-card stu-series-inspector" aria-label="系列赛详情">
      <header className="stu-series-inspector-head">
        <div>
          <h3>{series.teamAName} <span className="stu-series-score">{score.a} : {score.b}</span> {series.teamBName}</h3>
          <p className="stu-muted">{series.format.toUpperCase()} · {series.completedAt ? new Date(series.completedAt).toLocaleString("zh-CN") : "时间未定"}</p>
        </div>
        {series.rivalHub && <span className="stu-muted">官方系列赛</span>}
      </header>
      <div className="stu-series-inspector-maps">
        {maps.map((map) => {
          const entry = map.entryId ? entryById.get(map.entryId) : undefined;
          const remoteStatus = map.rivalHub ? rivalHubStatusPresentation(map.rivalHub.demoStatus) : null;
          return (
            <div key={map.order} className={activeMap?.order === map.order ? "stu-series-map-row stu-series-map-row-active" : "stu-series-map-row"}>
              <button type="button" className="stu-series-map-select" onClick={() => setActiveMapOrder(map.order)}>
                <b>M{map.order} · {mapDisplayName(map.mapName || entry?.meta.mapName || "未知地图")}</b>
                {entry && <span className="stu-muted">{entry.meta.teamAScore}:{entry.meta.teamBScore}</span>}
              </button>
              <div className="stu-series-map-actions">
                {entry ? <span className="stu-rivalhub-status stu-rivalhub-status-synced"><i />本地 Demo 已关联</span> : <span className="stu-muted">本地未关联</span>}
                {remoteStatus && <span className={remoteStatus.className}><i />{remoteStatus.label}</span>}
                {entry && <button type="button" className="stu-button-sm" onClick={() => onOpenMatch(entry.id)}>打开 Demo</button>}
                <MapDrop map={map} eventId={eventId} candidates={candidates} onImport={onImportOnlineFiles} onPick={onPickOnlineFiles} />
              </div>
            </div>
          );
        })}
      </div>
      {series.veto && (series.format === "bo1"
        ? <div className="stu-series-inspector-bp"><b>BP · BO1</b><BpView veto={series.veto} matchUrl={series.matchUrl} /></div>
        : <details className="stu-series-inspector-bp"><summary>BP · {series.format.toUpperCase()}</summary><BpView veto={series.veto} matchUrl={series.matchUrl} /></details>)}
      {!series.veto && <p className="stu-muted">BP：未录入</p>}
      {activeMap?.rivalHub?.demoIssues && activeMap.rivalHub.demoIssues.length > 0 && (
        <details className="stu-online-issue"><summary>查看该地图的同步问题</summary><ul>{activeMap.rivalHub.demoIssues.map((issue) => <li key={`${issue.code}:${issue.path ?? ""}`}>{issue.message}</li>)}</ul></details>
      )}
    </section>
  );
}
