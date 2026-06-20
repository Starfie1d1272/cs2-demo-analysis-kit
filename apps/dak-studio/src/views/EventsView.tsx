import { useEffect, useMemo, useState } from "react";
import type { EventStage } from "@cs2dak/contract";
import { listEventRecords, type StudioEventRecord } from "../lib/events";
import { listSeriesRecords, type StudioSeriesRecord } from "../lib/series";
import type { StudioDemoEntry } from "../lib/library";
import { BpView } from "./BpView";
import { EmptyState } from "../components/primitives";

export function EventsView({
  entries,
  onOpenMatch,
  onGoLibrary,
}: {
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string) => void;
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
    return <div className="stu-view"><EmptyState title="还没有赛事合集" hint="在资料库导入 event-package/1.0，或从在线赛事资产下载。" action={<button className="stu-button" onClick={onGoLibrary}>去资料库</button>} /></div>;
  }
  return (
    <div className="stu-view">
      <header className="stu-view-header"><div><h1>赛事合集</h1><p>Event → Stage → Series → Map 的本地只读赛事视图。</p></div></header>
      <div className="stu-chip-row">
        {events.map((event) => <button key={event.id} className={event.id === activeId ? "stu-chip stu-chip-active" : "stu-chip"} onClick={() => setActiveId(event.id)}>{event.name}</button>)}
      </div>
      {active && (
        <>
          <section className="stu-card">
            <h2>{active.name}</h2>
            <p className="stu-muted">{active.kind} · {eventSeries.length} 个系列 · {active.source}{active.readOnly ? " · 只读资产" : ""}</p>
          </section>
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
        </>
      )}
    </div>
  );
}

function EventStageSection({ stage, series, entries, onOpenMatch }: { stage: EventStage; series: StudioSeriesRecord[]; entries: StudioDemoEntry[]; onOpenMatch: (entryId: string) => void }) {
  return (
    <section className="stu-card">
      <h2>{stage.name} <small className="stu-muted">{stage.type} · {stage.teamCount} 队</small></h2>
      {stage.type === "round_robin" || stage.type === "gsl_group" ? <RoundRobinStage series={series} entries={entries} onOpenMatch={onOpenMatch} /> : null}
      {stage.type === "swiss" ? <SwissStage series={series} entries={entries} onOpenMatch={onOpenMatch} advanceCount={stage.advanceCount} /> : null}
      {stage.type === "single_elim" || stage.type === "double_elim" ? <EliminationStage series={series} entries={entries} onOpenMatch={onOpenMatch} double={stage.type === "double_elim"} /> : null}
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

function RoundRobinStage(props: StageProps) {
  const table = standings(props.series);
  return <div><table className="stu-mini-table"><thead><tr><th>队伍</th><th>场</th><th>胜</th><th>负</th><th>图差</th></tr></thead><tbody>{table.map((row) => <tr key={row.team}><td>{row.team}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.mapsFor - row.mapsAgainst}</td></tr>)}</tbody></table><SeriesList {...props} /></div>;
}

function SwissStage(props: StageProps & { advanceCount: number }) {
  const rounds = [...new Set(props.series.map((row) => row.round ?? 0))].sort((a, b) => a - b);
  return <div className="stu-pe-grid">{rounds.map((round) => <div key={round}><h3>第 {round} 轮</h3><SeriesList {...props} series={props.series.filter((row) => (row.round ?? 0) === round)} showRecord /></div>)}{rounds.length > 0 && <div><h3>晋级目标</h3><p className="stu-muted">{props.advanceCount} 队晋级；战绩以每场赛前 record 展示。</p></div>}</div>;
}

function EliminationStage(props: StageProps & { double: boolean }) {
  const lanes = props.double ? ["winner", "loser", "grand"] : ["single"];
  const laneOf = (row: StudioSeriesRecord) => {
    const value = (row.entryRound ?? "").toLowerCase();
    if (!props.double) return "single";
    if (value.includes("loser") || value.includes("lower")) return "loser";
    if (value.includes("grand")) return "grand";
    return "winner";
  };
  return <div>{lanes.map((lane) => {
    const rows = props.series.filter((row) => laneOf(row) === lane);
    if (rows.length === 0) return null;
    const rounds = [...new Set(rows.map((row) => row.entryRound ?? `R${row.round ?? 1}`))];
    return <div key={lane}><h3>{lane === "winner" ? "胜者组" : lane === "loser" ? "败者组" : lane === "grand" ? "总决赛" : "淘汰赛"}</h3><div className="stu-pe-grid">{rounds.map((round) => <div key={round}><h4>{round}</h4><SeriesList {...props} series={rows.filter((row) => (row.entryRound ?? `R${row.round ?? 1}`) === round)} /></div>)}</div></div>;
  })}</div>;
}

interface StageProps { series: StudioSeriesRecord[]; entries: StudioDemoEntry[]; onOpenMatch: (entryId: string) => void }

function SeriesList({ series, entries, onOpenMatch, showRecord = false }: StageProps & { showRecord?: boolean }) {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  return <div>{series.map((match) => <details key={match.id} className="stu-card"><summary><b>{match.teamAName}</b> {match.status === "finished" ? `${match.scoreA ?? 0}:${match.scoreB ?? 0}` : "vs"} <b>{match.teamBName}</b> · {match.format.toUpperCase()}{showRecord && (match.teamARecordBefore || match.teamBRecordBefore) ? ` · ${match.teamARecordBefore ?? "-"} / ${match.teamBRecordBefore ?? "-"}` : ""}</summary><p className="stu-muted">{match.scheduledAt ? new Date(match.scheduledAt).toLocaleString("zh-CN") : "未排期"} · {match.mapAssignments?.filter((map) => map.entryId).length ?? match.entryIds.length}/{match.mapAssignments?.length ?? match.entryIds.length} 图已有资源</p><div className="stu-chip-row">{match.entryIds.map((id) => { const entry = entryById.get(id); return entry ? <button key={id} className="stu-chip" onClick={() => onOpenMatch(id)}>{entry.meta.mapName} {entry.meta.teamAScore}:{entry.meta.teamBScore}</button> : null; })}</div>{match.veto && <BpView veto={match.veto} />}</details>)}</div>;
}
