import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildSeriesSummary } from "@cs2dak/presentation";
import type { MatchWorkspaceModel, SeriesSummary } from "@cs2dak/contract";
import { MatchWorkspace, QaReportPanel } from "@cs2dak/react";
import { matchDateFromFileName, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { getFactsStore } from "../lib/facts";
import { listSeriesRecords, type StudioSeriesRecord } from "../lib/series";
import { EmptyState } from "../components/primitives";
import { SeriesWorkspace } from "./SeriesWorkspace";

export interface MatchViewProps {
  entries: StudioDemoEntry[];
  demoId: string | null;
  deepLink?: { roundNumber: number; tick?: number } | null;
  onSelectDemo: (id: string) => void;
  onGoLibrary: () => void;
}

const modelCache = new Map<string, MatchWorkspaceModel>();

async function loadModel(id: string, matchId: string): Promise<MatchWorkspaceModel> {
  const cached = modelCache.get(id);
  if (cached) return cached;
  const factsStore = getFactsStore();
  const stored = await factsStore.getMatchWorkspaces({ matchIds: [matchId] });
  if (stored[0]) {
    modelCache.set(id, stored[0].row);
    return stored[0].row;
  }
  throw new Error("本场还没有本地持久化 workspace facts，请重新导入或执行 facts 回填后再打开。");
}

export function MatchView({ entries, demoId, deepLink, onSelectDemo, onGoLibrary }: MatchViewProps) {
  const activeId = demoId ?? entries[0]?.id ?? null;
  const activeEntry = activeId ? entries.find((entry) => entry.id === activeId) ?? null : null;
  const [model, setModel] = useState<MatchWorkspaceModel | null>(activeId ? modelCache.get(activeId) ?? null : null);
  const [error, setError] = useState<string | null>(null);
  const [showQa, setShowQa] = useState(false);
  const [seriesRecords, setSeriesRecords] = useState<StudioSeriesRecord[]>([]);
  const [summaryMode, setSummaryMode] = useState(false);
  const [summary, setSummary] = useState<SeriesSummary | null>(null);
  // 50+ 场时纯下拉不可用：搜索过滤（队名/地图/日期/文件名）+ 按地图分组
  const [matchSearch, setMatchSearch] = useState("");

  useEffect(() => {
    void listSeriesRecords().then(setSeriesRecords);
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
    if (!activeId || !activeEntry) return;
    setShowQa(false);
    const cached = modelCache.get(activeId);
    if (cached) {
      setModel(cached);
      setError(null);
      return;
    }
    let cancelled = false;
    setModel(null);
    setError(null);
    loadModel(activeId, matchIdForEntry(activeEntry))
      .then((built) => { if (!cancelled) setModel(built); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [activeId, activeEntry, entries]);

  // 汇总模式：懒构建系列内各图模型 → 跨图记分板
  useEffect(() => {
    if (!summaryMode || !activeSeries || seriesEntries.length === 0) return;
    let cancelled = false;
    setSummary(null);
    Promise.all(seriesEntries.map(async (entry) => ({ matchId: matchIdForEntry(entry), model: await loadModel(entry.id, matchIdForEntry(entry)) })))
      .then((matches) => { if (!cancelled) setSummary(buildSeriesSummary(matches)); })
      .catch(() => { if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, [summaryMode, activeSeries, seriesEntries]);

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

  const workspaceBody = error
    ? <EmptyState variant="error" title="加载失败" hint={error} />
    : !model
      ? <div className="stu-loading">读取本地持久化工作台…</div>
      : <MatchWorkspace model={model} initialTarget={deepLink} />;

  return (
    <div className="stu-view stu-view-flush">
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
                  {matchDateFromFileName(entry.fileName) ? ` · ${matchDateFromFileName(entry.fileName)}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
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
            summary={summary}
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
