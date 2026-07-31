import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildSeriesSummary } from "@cs2dak/presentation";
import type { MatchWorkspaceModel, SeriesSummary } from "@cs2dak/contract";
import { MatchWorkspace, QaReportPanel } from "@cs2dak/react";
import { entryDate, loadMatchWorkspaceModel, matchIdForEntry, registerDemoCacheInvalidator, type StudioDemoEntry } from "../lib/library";
import { listSeriesRecords, type StudioSeriesRecord } from "../lib/series";
import { EmptyState } from "@cs2dak/react";
import { SeriesWorkspace } from "./SeriesWorkspace";
import type { EvidenceContinuation, ReplaySessionState } from "../lib/evidence-continuation";
import {
  estimateMatchWorkspaceModelBytes,
  REPLAY_MODEL_CACHE_BYTE_LIMIT,
  REPLAY_MODEL_CACHE_ENTRY_LIMIT,
  ReplayModelCache,
} from "../lib/replay-model-cache";
import type { ReplayViewerSession } from "@cs2dak/react";
import type { AnalysisFinding } from "@cs2dak/presentation";
import { createTrainingFocus } from "../lib/training-focus";
import { savePrepItem } from "../lib/series";
import { replayEvidenceParticipantIds } from "../lib/replay-evidence-focus";

export interface MatchViewProps {
  entries: StudioDemoEntry[];
  demoId: string | null;
  deepLink?: { roundNumber: number; tick?: number } | null;
  onSelectDemo: (id: string) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  evidenceContinuation?: EvidenceContinuation | null;
  onReturnToSource?: () => void;
  onSelectEvidence?: (index: number) => void;
  onReplaySessionChange?: (session: ReplaySessionState) => void;
}

const modelCache = new ReplayModelCache<MatchWorkspaceModel>(
  REPLAY_MODEL_CACHE_ENTRY_LIMIT,
  REPLAY_MODEL_CACHE_BYTE_LIMIT,
  estimateMatchWorkspaceModelBytes,
);
registerDemoCacheInvalidator((demoId) => modelCache.invalidate(demoId));

function replaySessionStorageKey(demoId: string): string {
  return `dak:replay-session:${demoId}`;
}

function readReplaySession(demoId: string): ReplayViewerSession | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(replaySessionStorageKey(demoId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ReplayViewerSession>;
    return typeof value.roundNumber === "number"
      && typeof value.playheadSeconds === "number"
      && typeof value.playbackRate === "number"
      && value.layers != null
      && value.cameraByMap != null
      && (value.labelMode === "number" || value.labelMode === "short" || value.labelMode === "full")
      ? value as ReplayViewerSession
      : null;
  } catch {
    return null;
  }
}

async function loadModel(id: string): Promise<MatchWorkspaceModel> {
  return modelCache.load(id, () => loadMatchWorkspaceModel(id));
}

function fullFinding(continuation: EvidenceContinuation | null | undefined): AnalysisFinding | null {
  if (continuation?.snapshot?.finding) return continuation.snapshot.finding;
  return continuation?.finding && "evidence" in continuation.finding
    ? continuation.finding
    : null;
}

export function MatchView({ entries, demoId, deepLink, onSelectDemo, onWatchDemo, onGoLibrary, evidenceContinuation, onReturnToSource, onSelectEvidence, onReplaySessionChange }: MatchViewProps) {
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
  const [evidenceSaveStatus, setEvidenceSaveStatus] = useState<string | null>(null);
  const [localReplaySessionState, setLocalReplaySessionState] = useState<{
    demoId: string;
    session: ReplayViewerSession;
  } | null>(() => {
    if (!activeId) return null;
    const session = readReplaySession(activeId);
    return session ? { demoId: activeId, session } : null;
  });
  const localReplaySession = useMemo(() => {
    if (!activeId) return null;
    if (localReplaySessionState?.demoId === activeId) return localReplaySessionState.session;
    return readReplaySession(activeId);
  }, [activeId, localReplaySessionState]);
  const finding = fullFinding(evidenceContinuation);
  const evidenceSequence = finding?.evidence ?? (evidenceContinuation ? [evidenceContinuation.evidence] : []);
  const evidenceIndex = Math.max(0, Math.min(evidenceSequence.length - 1, evidenceContinuation?.evidenceIndex ?? 0));
  const focusPlayerIds = useMemo(() => {
    if (!model || !evidenceContinuation) return [];
    return replayEvidenceParticipantIds(model.replay, evidenceContinuation.evidence, finding?.subject.id);
  }, [evidenceContinuation, finding?.subject.id, model]);

  useEffect(() => {
    setEvidenceSaveStatus(null);
  }, [evidenceContinuation?.evidenceIndex, evidenceContinuation?.finding?.key]);

  const saveEvidenceAction = async () => {
    if (!finding || !evidenceContinuation?.snapshot) return;
    if (finding.capability === "tactical") {
      await savePrepItem({
        id: `finding:${finding.key}:${Date.now()}`,
        group: finding.title,
        matchId: evidenceContinuation.evidence.matchId,
        mapName: activeEntry?.meta.mapName,
        roundNumber: evidenceContinuation.evidence.roundNumber,
        source: "system-finding",
        coverage: finding.sample.coverage ?? finding.sample.label,
        snapshot: evidenceContinuation.snapshot,
        note: finding.statement,
      });
      setEvidenceSaveStatus("已加入备战清单");
      return;
    }
    if (!finding.subject.id) return;
    await createTrainingFocus({
      playerKey: finding.subject.id,
      finding,
      snapshot: evidenceContinuation.snapshot,
      origin: "system",
      evidence: finding.evidence,
      contextSummary: [finding.sample.label, finding.baseline].filter(Boolean).join(" · "),
    });
    setEvidenceSaveStatus("已保存为训练重点");
  };

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
    modelCache.setActive(activeId);
    return () => modelCache.setActive(null);
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
    loadModel(activeId)
      .then((built) => { if (!cancelled) setModel(built); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [activeId, activeEntry, entries]);

  // 汇总模式：懒构建系列内各图模型 → 跨图记分板
  useEffect(() => {
    if (!summaryMode || !activeSeries || seriesEntries.length === 0) return;
    let cancelled = false;
    setSummary(null);
    Promise.all(seriesEntries.map(async (entry) => ({ matchId: matchIdForEntry(entry), model: await loadModel(entry.id) })))
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
      : <MatchWorkspace
        key={activeId}
        model={model}
        initialTarget={deepLink}
        replaySession={evidenceContinuation?.replaySession ?? localReplaySession}
        hudAssetBaseUrl="/hud-death-notice"
        replayFocusPlayerIds={focusPlayerIds}
        onReplaySessionChange={(session) => {
          if (activeId) setLocalReplaySessionState({ demoId: activeId, session });
          if (activeId && typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(replaySessionStorageKey(activeId), JSON.stringify(session));
          }
          onReplaySessionChange?.({ ...session, selectedEvidenceIndex: evidenceContinuation?.evidenceIndex ?? null });
        }}
      />;

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
        <section className="stu-evidence-review" aria-label="当前 Finding 证据">
          <div className="stu-evidence-review-main">
            <span className="stu-evidence-kicker">正在复核</span>
            <strong>{finding?.title ?? evidenceContinuation.finding?.title ?? evidenceContinuation.evidence.reason}</strong>
            <p>{finding?.statement ?? evidenceContinuation.finding?.statement ?? evidenceContinuation.evidence.reason}</p>
          </div>
          <div className="stu-evidence-review-meta">
            <b>证据 {evidenceIndex + 1}/{Math.max(1, evidenceSequence.length)}</b>
            <span>R{evidenceContinuation.evidence.roundNumber}</span>
            {evidenceContinuation.evidence.tick != null && <span>Tick {evidenceContinuation.evidence.tick}</span>}
            {evidenceContinuation.snapshot && <span>已冻结快照</span>}
            {evidenceContinuation.snapshot?.sourcePackageHashes[evidenceContinuation.evidence.matchId] === null && <span className="stu-evidence-warning">来源比赛已删除</span>}
          </div>
          {finding && (
            <details className="stu-evidence-details">
              <summary>依据与限制</summary>
              <div>
                <span>样本：{finding.sample.label}{finding.sample.coverage ? ` · ${finding.sample.coverage}` : ""}</span>
                <span>基线：{finding.baseline ?? "未设置"}</span>
                <span>依据：{finding.basis.join("；")}</span>
                <span>限制：{finding.limitations.join("；")}</span>
              </div>
            </details>
          )}
          <div className="stu-evidence-review-actions">
            {onReturnToSource && <button type="button" className="stu-button-sm" onClick={onReturnToSource}>返回来源</button>}
            <button type="button" className="stu-button-sm" disabled={evidenceIndex <= 0} onClick={() => onSelectEvidence?.(evidenceIndex - 1)}>上一证据</button>
            <button type="button" className="stu-button-sm" disabled={evidenceIndex >= evidenceSequence.length - 1} onClick={() => onSelectEvidence?.(evidenceIndex + 1)}>下一证据</button>
            {finding && (finding.capability === "tactical" || finding.subject.id) && (
              <button
                type="button"
                className="stu-button"
                disabled={!evidenceContinuation.snapshot || evidenceSaveStatus != null}
                onClick={() => void saveEvidenceAction()}
              >
                {evidenceSaveStatus ?? (finding.capability === "tactical" ? "加入备战清单" : "保存为训练重点")}
              </button>
            )}
          </div>
        </section>
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
