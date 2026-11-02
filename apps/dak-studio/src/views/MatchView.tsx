import { usePageReady } from "../lib/use-page-ready";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../lib/queries/query-cache";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { buildSeriesSummary } from "@cs2dak/analytics";
import type { MatchWorkspaceModel, SeriesSummary } from "@cs2dak/presentation";
import { QaReportPanel } from "@cs2dak/react";
import { normalizeReplayViewState } from "@cs2dak/presentation";
import { MatchReviewWorkspace } from "./match/MatchReviewWorkspace";
import { createMatchWorkspaceState, type MatchWorkspaceState } from "../lib/match-workspace-state";
import { entryDate, matchIdForEntry, type StudioDemoEntry } from "../lib/demo-entry";
import { loadMatchWorkspaceModel } from "../lib/match-workspace-loader";
import { listSeriesRecords, type StudioSeriesRecord } from "../lib/series";
import { EmptyState } from "@cs2dak/react";
import { SeriesWorkspace } from "./SeriesWorkspace";
import type { EvidenceContinuation } from "../lib/evidence-continuation";

export interface MatchViewProps {
  onPageReady?: (keys: string[]) => void;
  onOpened?: (target: { roundNumber?: number; tick?: number }) => void;
  onReplayPaused?: (target: { roundNumber: number; tick: number }) => void;
  entries: StudioDemoEntry[];
  demoId: string | null;
  deepLink?: { roundNumber: number; tick?: number } | null;
  onSelectDemo: (id: string) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  evidenceContinuation?: EvidenceContinuation | null;
  onReturnToSource?: () => void;
}

const modelCache = new Map<string, MatchWorkspaceModel>();
const MAX_MODEL_CACHE_ENTRIES = 5;

function cacheModel(id: string, model: MatchWorkspaceModel): void {
  modelCache.delete(id);
  modelCache.set(id, model);
  while (modelCache.size > MAX_MODEL_CACHE_ENTRIES) {
    const oldest = modelCache.keys().next().value;
    if (oldest === undefined) break;
    modelCache.delete(oldest);
  }
}

async function loadModel(id: string, generation: number): Promise<MatchWorkspaceModel> {
  assertAnalysisGeneration(generation);
  const key = `${generation}:${id}`;
  for (const old of modelCache.keys()) if (!old.startsWith(`${generation}:`)) modelCache.delete(old);
  const cached = modelCache.get(key);
  if (cached) return cached;
  const model = await loadMatchWorkspaceModel(id);
  assertAnalysisGeneration(generation);
  cacheModel(key, model);
  return model;
}

export function MatchView({ entries, demoId, deepLink, onSelectDemo, onWatchDemo, onGoLibrary, evidenceContinuation, onReturnToSource, onPageReady, onOpened, onReplayPaused }: MatchViewProps) {
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  useEffect(() => subscribeAnalysisDataInvalidation(() => { if (getAnalysisDataSnapshot().status !== "ready") modelCache.clear(); }), []);
  const activeId = demoId;
  const activeEntry = activeId ? entries.find((entry) => entry.id === activeId) ?? null : null;
  const [loaded, setLoaded] = useState<{ id: string; generation: number; model: MatchWorkspaceModel; state: MatchWorkspaceState } | null>(null);
  const model = loaded?.id === activeId && loaded.generation === analysis.generation && analysis.status === "ready" ? loaded.model : null;
  const [error, setError] = useState<string | null>(null);
  const [showQa, setShowQa] = useState(false);
  const [seriesRecords, setSeriesRecords] = useState<StudioSeriesRecord[]>([]);
  const [seriesReady, setSeriesReady] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [summaryMode, setSummaryMode] = useState(false);
  const [summary, setSummary] = useState<SeriesSummary | null>(null);
  const [summaryGeneration, setSummaryGeneration] = useState(-1);
  // 50+ 场时纯下拉不可用：搜索过滤（队名/地图/日期/文件名）+ 按地图分组
  const [matchSearch, setMatchSearch] = useState("");

  usePageReady(!activeId || !activeEntry || (seriesReady && (model !== null || error !== null || analysis.status === "error")), onPageReady);

  useEffect(() => {
    let cancelled = false;
    void listSeriesRecords().then((rows) => { if (!cancelled) setSeriesRecords(rows); })
      .catch((reason) => { if (!cancelled) setSeriesError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (!cancelled) setSeriesReady(true); });
    return () => { cancelled = true; };
  }, []);

  const groupedEntries = useMemo(() => {
    const term = matchSearch.trim().toLowerCase();
    const hit = entries.filter((entry) => {
      if (!term) return true;
      return [entry.fileName, entry.meta.mapName, entry.meta.teamAName, entry.meta.teamBName, ...entry.tags]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
    const groups = new Map<string, StudioDemoEntry[]>();
    for (const entry of hit) {
      const list = groups.get(entry.meta.mapName) ?? [];
      list.push(entry);
      groups.set(entry.meta.mapName, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries, matchSearch]);

  // 当前 demo 所属的系列赛（含它的 entryIds）
  const activeSeries = useMemo(
    () => (activeId ? seriesRecords.find((record) => record.entryIds.includes(activeId)) ?? null : null),
    [seriesRecords, activeId]
  );
  const seriesEntries = useMemo(() => {
    if (!activeSeries) return [];
    return activeSeries.entryIds
      .map((id) => entries.find((entry) => entry.id === id))
      .filter((entry): entry is StudioDemoEntry => Boolean(entry))
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
  }, [activeSeries, entries]);

  // 切换当前 demo 时退出汇总模式
  useEffect(() => {
    setSummaryMode(false);
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !activeEntry || analysis.status !== "ready") return;
    setShowQa(false);
    for (const key of modelCache.keys()) if (!key.startsWith(`${analysis.generation}:`)) modelCache.delete(key);
    const cached = modelCache.get(`${analysis.generation}:${activeId}`);
    if (cached) {
      setLoaded(prev => ({ id: activeId, generation: analysis.generation, model: cached, state: prev?.id === activeId ? prev.state : createMatchWorkspaceState(cached) }));
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    loadModel(activeId, analysis.generation)
      .then((built) => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setLoaded(prev => ({ id: activeId, generation: analysis.generation, model: built, state: prev?.id === activeId ? prev.state : createMatchWorkspaceState(built) })); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [activeId, Boolean(activeEntry), analysis.generation, analysis.status]);

  useEffect(() => {
    if (!deepLink || !loaded || loaded.id !== activeId) return;
    const round = loaded.model.replay.rounds.find(r => r.roundNumber === deepLink.roundNumber);
    if (!round || !loaded.state.replay) return;
    setLoaded(prev => prev && prev.id === activeId ? { ...prev, state: { ...prev.state, view: "replay", replay: normalizeReplayViewState(prev.model.replay, prev.model.map.view, { ...prev.state.replay!, roundNumber: round.roundNumber, tick: deepLink.tick ?? round.freezeEndTick, playing: false }) } } : prev);
  }, [deepLink, activeId, loaded?.id]);

  useEffect(() => {
    if (model) onOpened?.(deepLink ?? {});
  }, [model, onOpened]);

  // 汇总模式：懒构建系列内各图模型 → 跨图记分板
  useEffect(() => {
    if (!summaryMode || !activeSeries || seriesEntries.length === 0 || analysis.status !== "ready") return;
    let cancelled = false;
    setSummary(null);
    Promise.all(seriesEntries.map(async (entry) => ({ matchId: matchIdForEntry(entry), model: await loadModel(entry.id, analysis.generation) })))
      .then((matches) => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setSummary(buildSeriesSummary(matches)); setSummaryGeneration(analysis.generation); } })
      .catch(() => { if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, [summaryMode, activeSeries, seriesEntries, analysis.generation, analysis.status]);

  if (activeId && !activeEntry) {
    return <div className="stu-view"><EmptyState variant="insufficient" title="比赛已不存在" hint="此比赛可能已从资料库删除。" action={<button type="button" className="stu-button" onClick={onGoLibrary}>返回资料库</button>} /></div>;
  }

  if (entries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有可分析的比赛"
          hint="先在资料库导入 v3 ZIP。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  const workspaceBody = analysis.status !== "ready" ? <div className="stu-loading">{analysis.status === "error" ? "分析缓存不可用，请重试刷新" : "分析数据正在更新…"}</div> : error
    ? <EmptyState variant="error" title="加载失败" hint={error} />
    : !model
      ? <div className="stu-loading">读取本地持久化工作台…</div>
      : <MatchReviewWorkspace model={model} state={loaded!.state} onStateChange={(state) => { if (loaded?.state.replay?.playing && state.replay && !state.replay.playing) onReplayPaused?.({ roundNumber: state.replay.roundNumber, tick: state.replay.tick }); setLoaded(prev => prev && prev.id === activeId ? { ...prev, state } : prev); }} />;

  return (
    <div className="stu-view stu-view-flush">
      {seriesError && <p className="stu-error" role="alert">读取系列赛失败：{seriesError}</p>}
      <div className="stu-context-bar">
        <span className="stu-context-label">当前比赛</span>
        {entries.length > 8 && (
          <input
            className="stu-search"
            type="search"
            placeholder="搜索队伍 / 地图 / 文件名…"
            value={matchSearch}
            onChange={(e) => setMatchSearch(e.target.value)}
          />
        )}
        <select className="stu-select" value={activeId ?? ""} onChange={(e) => onSelectDemo(e.target.value)}>
          {groupedEntries.map(([mapName, group]) => (
            <optgroup key={mapName} label={`${mapName}（${group.length} 场）`}>
              {group.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.meta.teamAName} {entry.meta.teamAScore}:{entry.meta.teamBScore} {entry.meta.teamBName}
                  {entryDate(entry) ? ` · ${entryDate(entry)}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {activeEntry?.sourceDemPath && onWatchDemo && (
          <button type="button" className="stu-button-sm" onClick={() => onWatchDemo(activeEntry.id, deepLink ?? undefined)}>
            进游戏
          </button>
        )}
        {model && (
          <button
            type="button"
            className={model.adminQa.ok ? "stu-qa-badge stu-qa-badge-ok" : "stu-qa-badge stu-qa-badge-warn"}
            title="导出包数据质量（strict validator + 分析 QA）"
            onClick={() => setShowQa((v) => !v)}
          >
            {model.adminQa.ok ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
            {model.adminQa.ok ? "QA 通过" : `QA ${model.adminQa.summary.issueCount} 项`}
          </button>
        )}
      </div>
      {evidenceContinuation && (
        <div className="stu-evidence-review" role="status">
          <span>正在复核：{evidenceContinuation.finding?.title ?? evidenceContinuation.evidence.reason} · R{evidenceContinuation.evidence.roundNumber}</span>
          {onReturnToSource && <button type="button" className="stu-button-sm" onClick={onReturnToSource}>返回来源</button>}
        </div>
      )}
      {model && showQa && (
        <div className="stu-embed stu-qa-panel">
          <QaReportPanel report={model.adminQa} />
        </div>
      )}
      <div className="stu-embed">
        {activeSeries && seriesEntries.length > 0 ? (
          <SeriesWorkspace
            series={activeSeries}
            entries={seriesEntries}
            activeId={activeId ?? ""}
            summaryMode={summaryMode}
            summary={analysis.status === "ready" && summaryGeneration === analysis.generation ? summary : null}
            onSelectMap={(id) => { setSummaryMode(false); onSelectDemo(id); }}
            onShowSummary={() => setSummaryMode(true)}
          >
            {workspaceBody}
          </SeriesWorkspace>
        ) : (
          workspaceBody
        )}
      </div>
    </div>
  );
}
