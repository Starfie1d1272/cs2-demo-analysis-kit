import { useEffect, useMemo, useState } from "react";
import type { EventStage } from "@cs2dak/contract";
import { listEventRecords, type StudioEventRecord } from "../lib/events";
import { listSeriesRecords, type StudioSeriesRecord } from "../lib/series";
import type { StudioDemoEntry } from "../lib/library";
import { elimModelFromResults, swissModelFromResults } from "../lib/event-bracket";
import { ElimBracket, SwissBracket, useSortable } from "@cs2dak/react";
import { BpView } from "./BpView";
import { EmptyState } from "@cs2dak/react";

export function EventsView({
  entries,
  onOpenMatch,
  onAnalyzeEvent,
  onGoLibrary,
}: {
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string) => void;
  onAnalyzeEvent: (event: StudioEventRecord) => void;
  onGoLibrary: () => void;
}) {
  const [events, setEvents] = useState<StudioEventRecord[]>([]);
  const [series, setSeries] = useState<StudioSeriesRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all([listEventRecords(), listSeriesRecords()]).then(([nextEvents, nextSeries]) => {
      setEvents(nextEvents);
      setSeries(nextSeries);
      setActiveId((current) => current ?? nextEvents[0]?.id ?? null);
    });
  }, []);
  const active = events.find((event) => event.id === activeId) ?? null;
  const eventSeries = useMemo(
    () => active ? series.filter((row) => row.eventId === active.id) : [],
    [active, series],
  );
  if (events.length === 0) {
    return <div className="stu-view"><EmptyState title="还没有赛事目录" hint="在资料库获取内置/在线赛事，或导入本地 event-package/1.0 资源包。" action={<button className="stu-button" onClick={onGoLibrary}>去资料库</button>} /></div>;
  }
  return (
    <div className="stu-view stu-reading-view">
      <header className="stu-view-header"><div><h1>赛事目录</h1><p>按 Event → Stage → Series → Map 浏览本地赛事，并从当前赛事进入总览。</p></div></header>
      <div className="stu-event-directory">
        <aside className="stu-event-list" aria-label="本地赛事">
          <span className="stu-event-list-label">本地赛事 · {events.length}</span>
          {events.map((event) => {
            const linkedSeries = series.filter((row) => row.eventId === event.id);
            const linkedMaps = linkedSeries.reduce((sum, row) => sum + row.entryIds.length, 0);
            return (
              <button
                key={event.id}
                type="button"
                className={event.id === activeId ? "stu-event-list-item stu-event-list-item-active" : "stu-event-list-item"}
                onClick={() => setActiveId(event.id)}
              >
                <b>{event.name}</b>
                <span>{linkedSeries.length} 个系列 · {linkedMaps} 图</span>
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
              />
            ))}
            {eventSeries.some((row) => !row.stageKey) && <EventStageSection stage={{ key: "other", name: "未分阶段", type: "round_robin", teamCount: 2, advanceCount: 0 }} series={eventSeries.filter((row) => !row.stageKey)} entries={entries} onOpenMatch={onOpenMatch} />}
          </section>
        )}
      </div>
    </div>
  );
}

/** 按阶段赛制选择渲染组件。GSL 小组有 bracketNodes 时走 lane-aware bracket，缺节点的旧资产降级为积分榜。 */
function renderStageContent(stage: EventStage, series: StudioSeriesRecord[], entries: StudioDemoEntry[], onOpenMatch: (entryId: string) => void) {
  const hasNodes = (stage.bracketNodes?.length ?? 0) > 0;
  const asBracket = stage.type === "single_elim" || stage.type === "double_elim" || (stage.type === "gsl_group" && hasNodes);
  if (asBracket) return <EliminationStage stage={stage} series={series} entries={entries} onOpenMatch={onOpenMatch} double={stage.type !== "single_elim"} />;
  if (stage.type === "swiss") return <SwissStage series={series} entries={entries} onOpenMatch={onOpenMatch} advanceCount={stage.advanceCount} />;
  if (stage.type === "round_robin" || stage.type === "gsl_group") return <RoundRobinStage series={series} entries={entries} onOpenMatch={onOpenMatch} />;
  return null;
}

function EventStageSection({ stage, series, entries, onOpenMatch }: { stage: EventStage; series: StudioSeriesRecord[]; entries: StudioDemoEntry[]; onOpenMatch: (entryId: string) => void }) {
  return (
    <section className="stu-event-stage">
      <h2>{stage.name} <small className="stu-muted">{stage.type} · {stage.teamCount} 队</small></h2>
      {renderStageContent(stage, series, entries, onOpenMatch)}
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

interface StageProps { series: StudioSeriesRecord[]; entries: StudioDemoEntry[]; onOpenMatch: (entryId: string) => void }

function SeriesList({ series, entries, onOpenMatch, showRecord = false }: StageProps & { showRecord?: boolean }) {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  return (
    <div>
      {series.map((match) => (
        <details key={match.id} className="stu-card">
          <summary>
            <b>{match.teamAName}</b> {match.status === "finished" ? `${match.scoreA ?? 0}:${match.scoreB ?? 0}` : "vs"} <b>{match.teamBName}</b> · {match.format.toUpperCase()}
            {showRecord && (match.teamARecordBefore || match.teamBRecordBefore) ? ` · ${match.teamARecordBefore ?? "-"} / ${match.teamBRecordBefore ?? "-"}` : ""}
          </summary>
          <p className="stu-muted">
            {match.completedAt ? `完成于 ${new Date(match.completedAt).toLocaleString("zh-CN")}` : match.scheduledAt ? `计划于 ${new Date(match.scheduledAt).toLocaleString("zh-CN")}` : match.status === "finished" ? "完成时间未知" : "未排期"} · {match.mapAssignments?.filter((map) => map.entryId).length ?? match.entryIds.length}/{match.mapAssignments?.length ?? match.entryIds.length} 图已有资源
          </p>
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
          {match.veto && <BpView veto={match.veto} matchUrl={match.matchUrl} />}
        </details>
      ))}
    </div>
  );
}
