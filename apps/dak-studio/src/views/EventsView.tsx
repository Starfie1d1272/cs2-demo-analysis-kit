import { useEffect, useMemo, useRef, useState } from "react";
import type { EventStage, EventStanding } from "@cs2dak/contract";
import { DataTable, ElimBracket, EmptyState, STUDIO_TABLE_CLASSES, SwissBracket, type DataTableColumn } from "@cs2dak/react";
import { listEventRecords, type StudioEventRecord } from "../lib/events";
import type { StudioDemoEntry } from "../lib/library";
import type { RivalHubConnectionState } from "../lib/rivalhub";
import { OFFICIAL_RIVALHUB_URL } from "../lib/rivalhub";
import type { RivalHubRemoteMap, RivalHubRemoteTeam } from "../lib/rivalhub-contract";
import type { RivalHubBatchPhase, RivalHubImportContext, RivalHubMatchCandidate } from "../lib/rivalhub-import";
import { candidateFromSeriesMap } from "../lib/rivalhub-match";
import { rivalHubStatusPresentation } from "../lib/rivalhub-status";
import { RIVALHUB_DROP_ZONE_ATTRIBUTE } from "../lib/rivalhub-acquisition";
import { triggerWindowsDropCapture } from "../lib/dem";
import { elimModelFromResults, swissModelFromResults } from "../lib/event-bracket";
import { listSeriesRecords, type StudioSeriesRecord } from "../lib/series";
import { SeriesInspector } from "./SeriesInspector";

const MATCHABLE_REMOTE_STATUSES = new Set<RivalHubRemoteMap["demoStatus"]>(["finished_pending_demo", "needs_attention", "synced"]);

function remoteMapsForSeries(series: StudioSeriesRecord): Array<{ series: StudioSeriesRecord; map: RivalHubRemoteMap }> {
  return (series.mapAssignments ?? []).flatMap((assignment) => assignment.rivalHub && MATCHABLE_REMOTE_STATUSES.has(assignment.rivalHub.demoStatus)
    ? [{ series, map: assignment.rivalHub }]
    : []);
}

function displayStatusForSeries(series: StudioSeriesRecord) {
  const maps = (series.mapAssignments ?? []).filter((assignment) => assignment.rivalHub).map((assignment) => assignment.rivalHub!);
  if (maps.length === 0) return null;
  const severity = ["needs_attention", "demo_processing", "live", "finished_pending_demo", "synced", "not_started"] as const;
  const status = severity.find((candidate) => maps.some((map) => map.demoStatus === candidate));
  return status ? rivalHubStatusPresentation(status) : null;
}

function formatScore(a: number | null | undefined, b: number | null | undefined): string {
  return `${a ?? "—"}:${b ?? "—"}`;
}

function ImportDropZone({
  label,
  context,
  onImport,
  onPick,
  secondary = false,
}: {
  label: string;
  context: RivalHubImportContext;
  onImport?: (files: Iterable<File>, context: RivalHubImportContext) => Promise<void>;
  onPick?: (context: RivalHubImportContext) => Promise<void>;
  secondary?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  if (!onImport) return null;
  return (
    <>
      <input ref={inputRef} type="file" accept=".dem,.zip,application/zip" multiple hidden onChange={(event) => {
        const files = event.currentTarget.files;
        event.currentTarget.value = "";
        if (files && files.length > 0) void onImport(files, context);
      }} />
      <button
        type="button"
        {...{ [RIVALHUB_DROP_ZONE_ATTRIBUTE]: "" }}
        className={secondary ? "stu-online-drop-zone stu-online-drop-zone-secondary" : "stu-online-drop-zone"}
        onClick={() => { if (onPick) void onPick(context); else inputRef.current?.click(); }}
        onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
        onDrop={(event) => { triggerWindowsDropCapture(event.dataTransfer.files); event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.files.length > 0) void onImport(event.dataTransfer.files, context); }}
      >
        {label}
      </button>
    </>
  );
}

function localStandings(series: StudioSeriesRecord[]): Array<EventStanding & { teamName: string }> {
  const rows = new Map<string, { teamName: string; wins: number; losses: number; roundWins: number; roundLosses: number }>();
  for (const match of series.filter((row) => row.status === "finished" && row.scoreA != null && row.scoreB != null)) {
    const add = (teamName: string, own: number, against: number) => {
      const row = rows.get(teamName) ?? { teamName, wins: 0, losses: 0, roundWins: 0, roundLosses: 0 };
      if (own > against) row.wins += 1;
      if (own < against) row.losses += 1;
      row.roundWins += own;
      row.roundLosses += against;
      rows.set(teamName, row);
    };
    add(match.teamAName, match.scoreA!, match.scoreB!);
    add(match.teamBName, match.scoreB!, match.scoreA!);
  }
  return [...rows.values()]
    .sort((a, b) => b.wins - a.wins || (b.roundWins - b.roundLosses) - (a.roundWins - a.roundLosses) || a.teamName.localeCompare(b.teamName))
    .map((row, index) => ({
      entryId: `local:${row.teamName}`,
      teamName: row.teamName,
      rank: index + 1,
      wins: row.wins,
      losses: row.losses,
      roundWins: row.roundWins,
      roundLosses: row.roundLosses,
      roundDiff: row.roundWins - row.roundLosses,
    }));
}

function StandingsTable({ stage, series, remote }: { stage: EventStage; series: StudioSeriesRecord[]; remote: boolean }) {
  const rows = remote
    ? (stage.standings ?? []).map((standing) => ({ ...standing, teamName: standing.teamName ?? standing.entryId }))
    : localStandings(series);
  if (remote && !stage.standings) {
    return <div className="stu-card stu-stage-empty"><b>RivalHub 尚未提供官方积分榜</b><p className="stu-muted">排名与 tiebreak 只显示官方 read model，不在 DAK 端猜算。</p></div>;
  }
  const columns: DataTableColumn<typeof rows[number]>[] = [
    { key: "rank", label: "排名", numeric: true, sortable: true, sortValue: (row) => row.rank, format: (row) => row.rank },
    { key: "team", label: "队伍 / Entry", sortable: true, sortValue: (row) => row.teamName, render: (row) => <span title={row.entryId}>{row.teamName}</span> },
    { key: "record", label: "战绩", sortable: true, sortValue: (row) => row.wins * 100 - row.losses, format: (row) => `${row.wins}-${row.losses}` },
    { key: "roundWins", label: "回合胜", numeric: true, sortable: true, sortValue: (row) => row.roundWins ?? null, format: (row) => row.roundWins ?? "—" },
    { key: "roundLosses", label: "回合负", numeric: true, sortable: true, sortValue: (row) => row.roundLosses ?? null, format: (row) => row.roundLosses ?? "—" },
    { key: "roundDiff", label: "回合差", numeric: true, sortable: true, sortValue: (row) => row.roundDiff ?? null, format: (row) => row.roundDiff ?? "—" },
    { key: "tiebreak", label: "官方 tiebreak", render: (row) => row.tiebreakFacts ? Object.entries(row.tiebreakFacts).map(([key, value]) => `${key}: ${value ?? "—"}`).join(" · ") : "—" },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(row) => row.entryId} classes={STUDIO_TABLE_CLASSES} />;
}

function MatchIndex({ series, selectedId, onSelect }: { series: StudioSeriesRecord[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const ordered = [...series].sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.completedAt ?? a.scheduledAt ?? "").localeCompare(b.completedAt ?? b.scheduledAt ?? "") || a.id.localeCompare(b.id));
  if (ordered.length === 0) return <p className="stu-muted">该阶段暂无系列赛。</p>;
  return (
    <div className="stu-series-index" aria-label="系列赛索引">
      <div className="stu-series-index-head"><b>系列赛</b><span className="stu-muted">按轮次 / 日期</span></div>
      {ordered.map((match) => {
        const status = displayStatusForSeries(match);
        return <button key={match.id} type="button" className={selectedId === match.id ? "stu-series-index-row stu-series-index-row-active" : "stu-series-index-row"} onClick={() => onSelect(match.id)}><span className="stu-series-index-round">{match.round != null ? `R${match.round}` : "—"}</span><span className="stu-series-index-match"><b>{match.teamAName}</b> <strong>{formatScore(match.scoreA, match.scoreB)}</strong> <b>{match.teamBName}</b></span><span className="stu-muted">{match.completedAt ? new Date(match.completedAt).toLocaleDateString("zh-CN") : match.status}</span>{status && <span className={status.className}><i />{status.label}</span>}</button>;
      })}
    </div>
  );
}

function stageSeriesId(key: string, series: StudioSeriesRecord[]): string | null {
  return series.find((row) => row.id === key || row.bracketNodeId === key)?.id ?? null;
}

function RemoteStageStructureUnavailable() {
  return <div className="stu-card stu-stage-empty"><b>RivalHub 尚未提供官方 bracket 结构</b><p className="stu-muted">该阶段的 compact match index 仍可用于逐场查看；官方拓扑补齐后才显示 bracket。</p></div>;
}

export function StageContent({ stage, series, remote, onSelectSeries }: { stage: EventStage; series: StudioSeriesRecord[]; remote: boolean; onSelectSeries: (id: string) => void }) {
  const hasNodes = (stage.bracketNodes?.length ?? 0) > 0;
  if (remote) {
    if (stage.type === "round_robin" || stage.type === "swiss" || (stage.type === "gsl_group" && !hasNodes)) {
      return <StandingsTable stage={stage} series={series} remote />;
    }
    if (!hasNodes) return <RemoteStageStructureUnavailable />;
  }
  if (stage.type === "round_robin" || (stage.type === "gsl_group" && !hasNodes)) return <StandingsTable stage={stage} series={series} remote={remote} />;
  if (stage.type === "swiss") {
    const model = swissModelFromResults(series);
    return <SwissBracket model={model} onSelectCell={(key) => { const id = stageSeriesId(key, series); if (id) onSelectSeries(id); }} />;
  }
  const model = elimModelFromResults(series, stage);
  return <ElimBracket model={model} onSelectCell={(key) => { const id = stageSeriesId(key, series); if (id) onSelectSeries(id); }} />;
}

function EventStageSection({ eventId, stage, series, entries, candidates, remote, onOpenMatch, onImportOnlineFiles, onPickOnlineFiles }: { eventId: string; stage: EventStage; series: StudioSeriesRecord[]; entries: StudioDemoEntry[]; candidates: RivalHubMatchCandidate[]; remote: boolean; onOpenMatch: (entryId: string) => void; onImportOnlineFiles?: (files: Iterable<File>, context: RivalHubImportContext) => Promise<void>; onPickOnlineFiles?: (context: RivalHubImportContext) => Promise<void> }) {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(series[0]?.id ?? null);
  useEffect(() => { setSelectedSeriesId(series[0]?.id ?? null); }, [stage.key, series.map((row) => row.id).join("|")]);
  const selectedSeries = series.find((row) => row.id === selectedSeriesId) ?? null;
  const stageCandidates = candidates.filter((candidate) => series.some((row) => row.id === candidate.series.id));
  return (
    <section className="stu-event-stage" aria-labelledby={`stage-${eventId}-${stage.key}`}>
      <header className="stu-event-stage-head">
        <div><h3 id={`stage-${eventId}-${stage.key}`}>{stage.name}</h3><span className="stu-muted">{stage.type} · {stage.teamCount} 队 · {series.length} 个系列</span></div>
        {onImportOnlineFiles && stageCandidates.length > 0 && <ImportDropZone label="仅导入本阶段" secondary context={{ scope: "stage", eventId, candidates: stageCandidates }} onImport={onImportOnlineFiles} onPick={onPickOnlineFiles} />}
      </header>
      <StageContent stage={stage} series={series} remote={remote} onSelectSeries={setSelectedSeriesId} />
      <MatchIndex series={series} selectedId={selectedSeriesId} onSelect={setSelectedSeriesId} />
      <SeriesInspector series={selectedSeries} entries={entries} eventId={eventId} candidates={stageCandidates} onOpenMatch={onOpenMatch} onImportOnlineFiles={onImportOnlineFiles} onPickOnlineFiles={onPickOnlineFiles} />
    </section>
  );
}

function stageCandidatesFor(series: StudioSeriesRecord[], eventTeams: RivalHubRemoteTeam[] = []): RivalHubMatchCandidate[] {
  return series.flatMap((row) => remoteMapsForSeries(row).map(({ series: candidateSeries, map }) => candidateFromSeriesMap(candidateSeries, map, eventTeams)));
}

export function EventsView({ entries, onOpenMatch, onAnalyzeEvent, onGoLibrary, rivalHubConnection, onConnectRivalHub, onRevokeRivalHub, onRefreshRivalHub, onImportOnlineFiles, onPickOnlineFiles, refreshToken = 0 }: {
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string) => void;
  onAnalyzeEvent: (event: StudioEventRecord) => void;
  onGoLibrary: () => void;
  rivalHubConnection?: RivalHubConnectionState;
  onConnectRivalHub?: (baseUrl: string) => Promise<void>;
  onRevokeRivalHub?: () => Promise<void>;
  onRefreshRivalHub?: () => Promise<void | boolean>;
  onImportOnlineFiles?: (files: Iterable<File>, context: RivalHubImportContext) => Promise<void>;
  onPickOnlineFiles?: (context: RivalHubImportContext) => Promise<void>;
  refreshToken?: number;
}) {
  const [events, setEvents] = useState<StudioEventRecord[]>([]);
  const [series, setSeries] = useState<StudioSeriesRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeStageKey, setActiveStageKey] = useState<string | null>(null);
  const [customBaseUrl, setCustomBaseUrl] = useState(rivalHubConnection?.baseUrl ?? "");
  useEffect(() => { void Promise.all([listEventRecords(), listSeriesRecords()]).then(([nextEvents, nextSeries]) => { setEvents(nextEvents); setSeries(nextSeries); setActiveId((current) => current ?? nextEvents[0]?.id ?? null); }); }, [refreshToken]);
  useEffect(() => { if (rivalHubConnection?.baseUrl) setCustomBaseUrl(rivalHubConnection.baseUrl); }, [rivalHubConnection?.baseUrl]);
  const orderedEvents = useMemo(() => [...events].sort((a, b) => (a.source === "rivalhub" ? 0 : 1) - (b.source === "rivalhub" ? 0 : 1) || b.updatedAt - a.updatedAt), [events]);
  const active = orderedEvents.find((event) => event.id === activeId) ?? orderedEvents[0] ?? null;
  const eventSeries = useMemo(() => active ? series.filter((row) => row.eventId === active.id) : [], [active, series]);
  const eventCandidates = useMemo(() => stageCandidatesFor(eventSeries, active?.rivalHub?.teams ?? []), [active?.rivalHub?.teams, eventSeries]);
  const stageOptions = useMemo(() => {
    if (!active) return [];
    const options = [...active.stages];
    if (eventSeries.some((row) => !row.stageKey)) options.push({ key: "other", name: "未分阶段", type: "round_robin", teamCount: 2, advanceCount: 0 });
    return options;
  }, [active, eventSeries]);
  useEffect(() => {
    const firstWithContent = stageOptions.find((stage) => eventSeries.some((row) => row.stageKey === stage.key) || (stage.key === "other" && eventSeries.some((row) => !row.stageKey))) ?? stageOptions[0];
    setActiveStageKey((current) => current && stageOptions.some((stage) => stage.key === current) ? current : firstWithContent?.key ?? null);
  }, [active?.id, eventSeries, stageOptions]);
  const activeStage = stageOptions.find((stage) => stage.key === activeStageKey) ?? stageOptions[0] ?? null;
  const activeStageSeries = activeStage ? eventSeries.filter((row) => activeStage.key === "other" ? !row.stageKey : row.stageKey === activeStage.key) : [];
  const totalMaps = eventSeries.reduce((sum, row) => sum + (row.mapAssignments?.length ?? row.entryIds.length), 0);
  const localLinked = eventSeries.reduce((sum, row) => sum + (row.mapAssignments?.filter((map) => map.entryId).length ?? row.entryIds.length), 0);
  const remoteSynced = eventCandidates.filter(({ map }) => map.demoStatus === "synced").length;
  const remoteNeedsAttention = eventCandidates.filter(({ map }) => map.demoStatus === "needs_attention").length;

  return (
    <div className="stu-view stu-reading-view">
      <header className="stu-view-header">
        <div><h1>赛事目录</h1><p>按 Event → Stage → Series → Map 浏览赛事；官方结构与排名来自 RivalHub，本地 Demo 只负责分析与关联。</p></div>
        {onConnectRivalHub && <div className="stu-rivalhub-connection" aria-label="RivalHub 连接">
          <div className="stu-rivalhub-connection-row"><span className={rivalHubConnection?.status === "connected" ? "stu-status-dot stu-status-dot-ok" : "stu-status-dot"} /><span>{rivalHubConnection?.status === "connected" ? "RivalHub 已连接" : rivalHubConnection?.status === "connecting" ? "正在连接…" : "RivalHub 未连接"}</span>{rivalHubConnection?.lastSyncAt ? <small>· {new Date(rivalHubConnection.lastSyncAt).toLocaleTimeString("zh-CN")} 已刷新</small> : null}</div>
          <div className="stu-rivalhub-connection-actions">{rivalHubConnection?.status === "connected" ? <><button type="button" className="stu-button" onClick={() => void onRefreshRivalHub?.()}>刷新赛事</button>{rivalHubConnection.pairingId && onRevokeRivalHub ? <button type="button" className="stu-button" onClick={() => void onRevokeRivalHub()}>断开并撤销此设备</button> : null}</> : <button type="button" className="stu-button" onClick={() => void onConnectRivalHub(OFFICIAL_RIVALHUB_URL)} disabled={rivalHubConnection?.status === "connecting"}>连接 RivalHub</button>}</div>
          {rivalHubConnection?.status !== "connected" && <details className="stu-rivalhub-custom-url"><summary>高级：自定义服务器</summary><div className="stu-rivalhub-connection-actions"><input aria-label="自定义 RivalHub 地址" value={customBaseUrl} onChange={(event) => setCustomBaseUrl(event.target.value)} placeholder={OFFICIAL_RIVALHUB_URL} /><button type="button" className="stu-button-sm" onClick={() => void onConnectRivalHub(customBaseUrl)} disabled={rivalHubConnection?.status === "connecting" || !customBaseUrl.trim()}>连接自定义地址</button></div></details>}
          {rivalHubConnection?.error && <small className="stu-error-text">{rivalHubConnection.error}</small>}
        </div>}
      </header>
      {events.length === 0 ? <EmptyState title="还没有赛事目录" hint="连接 RivalHub 获取在线赛事，或在资料库导入本地 event-package/1.0 资源包。" action={<button className="stu-button" onClick={onGoLibrary}>去资料库</button>} /> : <div className="stu-event-directory">
        <aside className="stu-event-list" aria-label="赛事列表"><span className="stu-event-list-label">在线赛事优先 · {orderedEvents.length}</span>{orderedEvents.map((event) => { const linkedSeries = series.filter((row) => row.eventId === event.id); const linked = linkedSeries.reduce((sum, row) => sum + (row.mapAssignments?.filter((map) => map.entryId).length ?? row.entryIds.length), 0); const remote = linkedSeries.flatMap((row) => row.mapAssignments?.flatMap((map) => map.rivalHub ? [map.rivalHub] : []) ?? []); return <button key={event.id} type="button" className={event.id === activeId ? "stu-event-list-item stu-event-list-item-active" : "stu-event-list-item"} onClick={() => setActiveId(event.id)}><b>{event.name}</b><span>{event.source === "rivalhub" ? "RivalHub" : "本地"} · 本地已关联 {linked} 图 · 远程已同步 {remote.filter((map) => map.demoStatus === "synced").length}{event.rivalHub?.stale ? " · 缓存已过期" : ""}</span></button>; })}</aside>
        {active && <section className="stu-event-content"><header className="stu-event-content-head"><div><h2>{active.name}</h2><p>{active.kind} · {eventSeries.length} 个系列 · {active.source}{active.readOnly ? " · 只读资产" : ""}</p><div className="stu-event-sync-summary"><span>本地已关联 {localLinked}/{totalMaps} 图</span>{active.source === "rivalhub" && <><span>远程已同步 {remoteSynced}/{eventCandidates.length} 图</span><span>需要处理 {remoteNeedsAttention}</span>{active.rivalHub?.lastSyncedAt && <span>上次同步 {new Date(active.rivalHub.lastSyncedAt).toLocaleString("zh-CN")}{active.rivalHub.stale ? " · 缓存已过期" : ""}</span>}</>}</div></div><button type="button" className="stu-button" onClick={() => onAnalyzeEvent(active)}>查看赛事总览</button></header>{onImportOnlineFiles && active.source === "rivalhub" && eventCandidates.length > 0 && <ImportDropZone label="将本赛事 Demo 拖到这里；可混合排位赛 / 正赛，自动匹配。" context={{ scope: "event", eventId: active.id, candidates: eventCandidates }} onImport={onImportOnlineFiles} onPick={onPickOnlineFiles} />}{stageOptions.length > 0 && <div className="stu-stage-tabs" role="tablist" aria-label="赛事阶段">{stageOptions.map((stage) => <button key={stage.key} type="button" role="tab" aria-selected={activeStage?.key === stage.key} className={activeStage?.key === stage.key ? "stu-chip stu-chip-active" : "stu-chip"} onClick={() => setActiveStageKey(stage.key)}>{stage.name}</button>)}</div>}{activeStage && <EventStageSection eventId={active.id} stage={activeStage} series={activeStageSeries} entries={entries} candidates={eventCandidates} remote={active.source === "rivalhub"} onOpenMatch={onOpenMatch} onImportOnlineFiles={onImportOnlineFiles} onPickOnlineFiles={onPickOnlineFiles} />}</section>}
      </div>}
    </div>
  );
}

export type { RivalHubBatchPhase };
