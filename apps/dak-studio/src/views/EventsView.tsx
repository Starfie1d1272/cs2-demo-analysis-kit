import { useEffect, useMemo, useRef, useState } from "react";
import type { EventStage } from "@cs2dak/contract";
import { listEventRecords, type StudioEventRecord } from "../lib/events";
import { listSeriesRecords, type StudioSeriesRecord } from "../lib/series";
import type { StudioDemoEntry } from "../lib/library";
import type { RivalHubConnectionState } from "../lib/rivalhub";
import { elimModelFromResults, swissModelFromResults } from "../lib/event-bracket";
import { ElimBracket, SwissBracket, useSortable } from "@cs2dak/react";
import { BpView } from "./BpView";
import { EmptyState } from "@cs2dak/react";

export function EventsView({
  entries,
  onOpenMatch,
  onAnalyzeEvent,
  onGoLibrary,
  rivalHubConnection,
  onConnectRivalHub,
  onRefreshRivalHub,
  onImportOnlineFiles,
  refreshToken = 0,
}: {
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string) => void;
  onAnalyzeEvent: (event: StudioEventRecord) => void;
  onGoLibrary: () => void;
  rivalHubConnection?: RivalHubConnectionState;
  onConnectRivalHub?: (baseUrl: string) => Promise<void>;
  onRefreshRivalHub?: () => Promise<void>;
  onImportOnlineFiles?: (files: Iterable<File>, context: OnlineImportContext) => Promise<void>;
  refreshToken?: number;
}) {
  const [events, setEvents] = useState<StudioEventRecord[]>([]);
  const [series, setSeries] = useState<StudioSeriesRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState(rivalHubConnection?.baseUrl ?? "");
  useEffect(() => {
    void Promise.all([listEventRecords(), listSeriesRecords()]).then(([nextEvents, nextSeries]) => {
      setEvents(nextEvents);
      setSeries(nextSeries);
      setActiveId((current) => current ?? nextEvents[0]?.id ?? null);
    });
  }, [refreshToken]);
  useEffect(() => {
    if (rivalHubConnection?.baseUrl) setBaseUrl(rivalHubConnection.baseUrl);
  }, [rivalHubConnection?.baseUrl]);
  const orderedEvents = useMemo(() => [...events].sort((a, b) => {
    const sourceOrder = (event: StudioEventRecord) => event.source === "rivalhub" ? 0 : 1;
    return sourceOrder(a) - sourceOrder(b) || b.updatedAt - a.updatedAt;
  }), [events]);
  const active = orderedEvents.find((event) => event.id === activeId) ?? orderedEvents[0] ?? null;
  const eventSeries = useMemo(
    () => active ? series.filter((row) => row.eventId === active.id) : [],
    [active, series],
  );
  return (
    <div className="stu-view stu-reading-view">
      <header className="stu-view-header">
        <div><h1>赛事目录</h1><p>按 Event → Stage → Series → Map 浏览赛事；在线 RivalHub 数据优先，Demo 仍在本地解析。</p></div>
        {onConnectRivalHub && (
          <div className="stu-rivalhub-connection" aria-label="RivalHub 连接">
            <div className="stu-rivalhub-connection-row">
              <span className={rivalHubConnection?.status === "connected" ? "stu-status-dot stu-status-dot-ok" : "stu-status-dot"} />
              <span>{rivalHubConnection?.status === "connected" ? "RivalHub 已连接" : rivalHubConnection?.status === "connecting" ? "正在连接…" : "RivalHub 未连接"}</span>
              {rivalHubConnection?.lastSyncAt ? <small>· {new Date(rivalHubConnection.lastSyncAt).toLocaleTimeString("zh-CN")} 已刷新</small> : null}
            </div>
            <div className="stu-rivalhub-connection-actions">
              <input aria-label="RivalHub 地址" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://rivalhub.example" />
              {rivalHubConnection?.status === "connected" ? (
                <>
                  <button type="button" className="stu-button" onClick={() => void onRefreshRivalHub?.()}>刷新赛事</button>
                  <button type="button" className="stu-button stu-button-ghost" onClick={() => setBaseUrl("")}>更换地址</button>
                </>
              ) : (
                <button type="button" className="stu-button" onClick={() => void onConnectRivalHub(baseUrl)} disabled={rivalHubConnection?.status === "connecting" || !baseUrl.trim()}>连接 RivalHub</button>
              )}
            </div>
            {rivalHubConnection?.error && <small className="stu-error-text">{rivalHubConnection.error}</small>}
          </div>
        )}
      </header>
      {events.length === 0 ? (
        <EmptyState title="还没有赛事目录" hint="连接 RivalHub 获取在线赛事，或在资料库导入本地 event-package/1.0 资源包。" action={<button className="stu-button" onClick={onGoLibrary}>去资料库</button>} />
      ) : (
      <div className="stu-event-directory">
        <aside className="stu-event-list" aria-label="赛事列表">
          <span className="stu-event-list-label">在线赛事优先 · {orderedEvents.length}</span>
          {orderedEvents.map((event) => {
            const linkedSeries = series.filter((row) => row.eventId === event.id);
            const linkedMaps = linkedSeries.reduce((sum, row) => sum + (row.mapAssignments?.length ?? row.entryIds.length), 0);
            return (
              <button
                key={event.id}
                type="button"
                className={event.id === activeId ? "stu-event-list-item stu-event-list-item-active" : "stu-event-list-item"}
                onClick={() => setActiveId(event.id)}
              >
                <b>{event.name}</b>
                <span>{event.source === "rivalhub" ? "RivalHub" : "本地"} · {linkedSeries.length} 个系列 · {linkedMaps} 图{event.rivalHub?.stale ? " · 缓存已过期" : ""}</span>
              </button>
            );
          })}
        </aside>
        {active && (
          <section className="stu-event-content">
            <header className="stu-event-content-head">
              <div>
                <h2>{active.name}</h2>
                <p>{active.kind} · {eventSeries.length} 个系列 · {active.source}{active.readOnly ? " · 只读资产" : ""}</p>
              </div>
              <button type="button" className="stu-button" onClick={() => onAnalyzeEvent(active)}>查看赛事总览</button>
            </header>
            {active.stages.map((stage) => (
              <EventStageSection
                key={stage.key}
                stage={stage}
                series={eventSeries.filter((row) => row.stageKey === stage.key)}
                entries={entries}
                onOpenMatch={onOpenMatch}
                onImportOnlineFiles={onImportOnlineFiles}
              />
            ))}
            {eventSeries.some((row) => !row.stageKey) && <EventStageSection stage={{ key: "other", name: "未分阶段", type: "round_robin", teamCount: 2, advanceCount: 0 }} series={eventSeries.filter((row) => !row.stageKey)} entries={entries} onOpenMatch={onOpenMatch} onImportOnlineFiles={onImportOnlineFiles} />}
          </section>
        )}
      </div>
      )}
    </div>
  );
}

export interface OnlineImportContext {
  series: StudioSeriesRecord;
  mapAssignments: NonNullable<StudioSeriesRecord["mapAssignments"]>;
}

/** 按阶段赛制选择渲染组件。GSL 小组有 bracketNodes 时走 lane-aware bracket，缺节点的旧资产降级为积分榜。 */
function renderStageContent(stage: EventStage, series: StudioSeriesRecord[], entries: StudioDemoEntry[], onOpenMatch: (entryId: string) => void, onImportOnlineFiles?: (files: Iterable<File>, context: OnlineImportContext) => Promise<void>) {
  const hasNodes = (stage.bracketNodes?.length ?? 0) > 0;
  const asBracket = stage.type === "single_elim" || stage.type === "double_elim" || (stage.type === "gsl_group" && hasNodes);
  if (asBracket) return <EliminationStage stage={stage} series={series} entries={entries} onOpenMatch={onOpenMatch} onImportOnlineFiles={onImportOnlineFiles} double={stage.type !== "single_elim"} />;
  if (stage.type === "swiss") return <SwissStage series={series} entries={entries} onOpenMatch={onOpenMatch} onImportOnlineFiles={onImportOnlineFiles} advanceCount={stage.advanceCount} />;
  if (stage.type === "round_robin" || stage.type === "gsl_group") return <RoundRobinStage series={series} entries={entries} onOpenMatch={onOpenMatch} onImportOnlineFiles={onImportOnlineFiles} />;
  return null;
}

function EventStageSection({ stage, series, entries, onOpenMatch, onImportOnlineFiles }: { stage: EventStage; series: StudioSeriesRecord[]; entries: StudioDemoEntry[]; onOpenMatch: (entryId: string) => void; onImportOnlineFiles?: (files: Iterable<File>, context: OnlineImportContext) => Promise<void> }) {
  return (
    <section className="stu-event-stage">
      <h2>{stage.name} <small className="stu-muted">{stage.type} · {stage.teamCount} 队</small></h2>
      {renderStageContent(stage, series, entries, onOpenMatch, onImportOnlineFiles)}
      {series.length === 0 && <p className="stu-muted">该阶段暂无系列赛。</p>}
    </section>
  );
}

function standings(series: StudioSeriesRecord[]) {
  const rows = new Map<string, { team: string; played: number; wins: number; losses: number; mapsFor: number; mapsAgainst: number }>();
  for (const match of series.filter((row) => row.status === "finished" && row.scoreA != null && row.scoreB != null)) {
    for (const [team, own, against] of [[match.teamAName, match.scoreA!, match.scoreB!], [match.teamBName, match.scoreB!, match.scoreA!]] as const) {
      const row = rows.get(team) ?? { team, played: 0, wins: 0, losses: 0, mapsFor: 0, mapsAgainst: 0 };
      row.played += 1;
      row.wins += own > against ? 1 : 0;
      row.losses += own < against ? 1 : 0;
      row.mapsFor += own;
      row.mapsAgainst += against;
      rows.set(team, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.wins - a.wins || (b.mapsFor - b.mapsAgainst) - (a.mapsFor - a.mapsAgainst) || a.team.localeCompare(b.team));
}

type StandingsKey = "played" | "wins" | "losses" | "diff";

function RoundRobinStage(props: StageProps) {
  const { sortKey, sortDesc, handleSort } = useSortable<StandingsKey>("wins");
  const base = useMemo(() => standings(props.series), [props.series]);
  const diff = (row: ReturnType<typeof standings>[number]) => row.mapsFor - row.mapsAgainst;
  const table = [...base].sort((a, b) => {
    const dir = sortDesc ? 1 : -1;
    const va = sortKey === "diff" ? diff(a) : a[sortKey];
    const vb = sortKey === "diff" ? diff(b) : b[sortKey];
    return (vb - va) * dir || a.team.localeCompare(b.team);
  });
  const arrow = (key: StandingsKey) => (sortKey === key ? (sortDesc ? " ↓" : " ↑") : "");
  const COLS: Array<{ key: StandingsKey; label: string }> = [
    { key: "played", label: "场" }, { key: "wins", label: "胜" }, { key: "losses", label: "负" }, { key: "diff", label: "图差" },
  ];
  return <div><table className="stu-mini-table"><thead><tr><th>队伍</th>{COLS.map((c) => <th key={c.key} className="stu-num stu-col-sortable" onClick={() => handleSort(c.key)}>{c.label}{arrow(c.key)}</th>)}</tr></thead><tbody>{table.map((row) => <tr key={row.team}><td>{row.team}</td><td className="stu-num">{row.played}</td><td className="stu-num">{row.wins}</td><td className="stu-num">{row.losses}</td><td className="stu-num">{diff(row)}</td></tr>)}</tbody></table><SeriesList {...props} /></div>;
}

function SwissStage(props: StageProps & { advanceCount: number }) {
  const model = swissModelFromResults(props.series);
  const rounds = [...new Set(props.series.map((row) => row.round ?? 0))].sort((a, b) => a - b);
  return <>
    <SwissBracket model={model} onOpenMatch={props.onOpenMatch} />
    <details className="stu-card"><summary className="stu-muted">详细列表与 BP</summary>
      {rounds.map((round) => <div key={round}><h4>第 {round} 轮</h4><SeriesList {...props} series={props.series.filter((row) => (row.round ?? 0) === round)} showRecord /></div>)}
    </details>
  </>;
}

function EliminationStage(props: StageProps & { double: boolean; stage: EventStage }) {
  const model = elimModelFromResults(props.series, props.stage);
  // ElimBracket 内部按 model.nodes 有无自动选择渲染模式：
  // 有 nodes → SVG lane-aware 布局 + 晋级连线（双败/GSL），
  // 无 nodes → DOM 列布局（单败/旧资产），均可点击开 demo。
  return <>
    <ElimBracket model={model} onOpenMatch={props.onOpenMatch} />
    <details className="stu-card"><summary className="stu-muted">详细列表与 BP</summary>
      <SeriesList {...props} />
    </details>
  </>;
}

interface StageProps { series: StudioSeriesRecord[]; entries: StudioDemoEntry[]; onOpenMatch: (entryId: string) => void; onImportOnlineFiles?: (files: Iterable<File>, context: OnlineImportContext) => Promise<void> }

function SeriesList({ series, entries, onOpenMatch, onImportOnlineFiles, showRecord = false }: StageProps & { showRecord?: boolean }) {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const [pickContext, setPickContext] = useState<OnlineImportContext | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseFiles = (context: OnlineImportContext) => {
    setPickContext(context);
    inputRef.current?.click();
  };
  const importDropped = (files: FileList | File[], context: OnlineImportContext) => {
    if (files.length === 0 || !onImportOnlineFiles) return;
    void onImportOnlineFiles(files, context);
  };
  return (
    <div>
      {onImportOnlineFiles && <input ref={inputRef} type="file" accept=".dem,.zip,application/zip" multiple hidden onChange={(event) => {
        const context = pickContext;
        const files = event.currentTarget.files;
        event.currentTarget.value = "";
        setPickContext(null);
        if (context && files) importDropped(files, context);
      }} />}
      {series.map((match) => (
        <details key={match.id} className="stu-card">
          <summary>
            <b>{match.teamAName}</b> {match.status === "finished" ? `${match.scoreA ?? 0}:${match.scoreB ?? 0}` : "vs"} <b>{match.teamBName}</b> · {match.format.toUpperCase()}
            {showRecord && (match.teamARecordBefore || match.teamBRecordBefore) ? ` · ${match.teamARecordBefore ?? "-"} / ${match.teamBRecordBefore ?? "-"}` : ""}
          </summary>
          <p className="stu-muted">
            {match.completedAt ? `完成于 ${new Date(match.completedAt).toLocaleString("zh-CN")}` : match.scheduledAt ? `计划于 ${new Date(match.scheduledAt).toLocaleString("zh-CN")}` : match.status === "finished" ? "完成时间未知" : "未排期"} · {match.mapAssignments?.filter((map) => map.entryId).length ?? match.entryIds.length}/{match.mapAssignments?.length ?? match.entryIds.length} 图已有资源
          </p>
          {match.rivalHub && <p className="stu-muted">RivalHub：{match.rivalHub.stageRunId ? "已绑定 StageRun" : "赛事数据"} · revision 已随刷新更新</p>}
          {(match.rawDemoHint?.downloadUrl || match.matchUrl) && (
            <p className="stu-muted">
              原始 demo：{match.rawDemoHint?.downloadUrl ? (
                <a href={match.rawDemoHint.downloadUrl} target="_blank" rel="noreferrer">
                  {match.rawDemoHint.fileName ?? "下载链接"}
                </a>
              ) : (
                <a href={match.matchUrl ?? undefined} target="_blank" rel="noreferrer">HLTV 来源页</a>
              )}
            </p>
          )}
          <div className="stu-chip-row">
            {match.entryIds.map((id) => {
              const entry = entryById.get(id);
              return entry ? <button key={id} className="stu-chip" onClick={() => onOpenMatch(id)}>{entry.meta.mapName} {entry.meta.teamAScore}:{entry.meta.teamBScore}</button> : null;
            })}
          </div>
          {onImportOnlineFiles && match.mapAssignments?.some((map) => map.rivalHub) && (
            <>
              <div className="stu-online-map-status" aria-label="在线赛事地图状态">
                {match.mapAssignments.filter((map) => map.rivalHub).map((map) => <div key={map.order} className="stu-online-map-status-item">
                  <span className="stu-chip">{map.mapName} · {demoStatusLabel(map.rivalHub!.demoStatus)}</span>
                  {map.rivalHub!.demoStatus === "needs_attention" && (map.rivalHub!.demoIssues?.length ?? 0) > 0 && (
                    <details className="stu-online-issue">
                      <summary>查看原因</summary>
                      <ul>{map.rivalHub!.demoIssues!.map((issue) => <li key={`${issue.code}:${issue.path ?? ""}`}>{issue.message}</li>)}</ul>
                      <p className="stu-muted">请刷新赛事上下文或重新上传正确的 Demo；不会在 RivalHub 网页中手改统计。</p>
                    </details>
                  )}
                </div>)}
              </div>
              <button
                type="button"
                className="stu-online-drop-zone"
                onClick={() => chooseFiles({ series: match, mapAssignments: match.mapAssignments?.filter((map) => map.rivalHub) ?? [] })}
                onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
                onDrop={(event) => { event.preventDefault(); event.stopPropagation(); importDropped(event.dataTransfer.files, { series: match, mapAssignments: match.mapAssignments?.filter((map) => map.rivalHub) ?? [] }); }}
              >
                将一张或多张 .dem 拖到这里，自动匹配在线赛事地图并提交
              </button>
            </>
          )}
          {match.veto && <BpView veto={match.veto} matchUrl={match.matchUrl} />}
        </details>
      ))}
    </div>
  );
}

function demoStatusLabel(status: NonNullable<NonNullable<StudioSeriesRecord["mapAssignments"]>[number]["rivalHub"]>["demoStatus"]): string {
  return {
    not_started: "未开始",
    live: "LIVE",
    finished_pending_demo: "已结束·待 Demo",
    demo_processing: "Demo 处理中",
    synced: "已同步",
    needs_attention: "需要处理",
  }[status];
}
