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
      {stage.type === "single_elim" || stage.type === "double_elim" ? <EliminationStage stage={stage} series={series} entries={entries} onOpenMatch={onOpenMatch} double={stage.type === "double_elim"} /> : null}
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

function EliminationStage(props: StageProps & { double: boolean; stage: EventStage }) {
  if (props.stage.bracketNodes?.length) return <BracketStage {...props} />;
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

function BracketStage(props: StageProps & { stage: EventStage }) {
  const nodes = props.stage.bracketNodes ?? [];
  const rounds = [...new Set(nodes.map((node) => node.round))].sort((a, b) => a - b);
  const nodeLabel = new Map(nodes.map((node) => [node.id, node.label]));
  return <>
    <BracketConnections stage={props.stage} series={props.series} />
    <div className="stu-bracket" aria-label={`${props.stage.name} 节点详情`}>
    {rounds.map((round) => <div key={round} className="stu-bracket-round">
      <h3>第 {round} 轮</h3>
      {nodes.filter((node) => node.round === round).map((node) => {
        const matches = props.series.filter((row) => row.bracketNodeId === node.id);
        return <article key={node.id} className="stu-bracket-node">
          <h4>{node.label}</h4>
          {matches.length ? <SeriesList {...props} series={matches} /> : <p className="stu-muted">暂无比赛资源</p>}
          {(node.nextWinNodeId || node.nextLossNodeId) && <div className="stu-bracket-links">
            {node.nextWinNodeId && <span>胜者 → {nodeLabel.get(node.nextWinNodeId) ?? node.nextWinNodeId}</span>}
            {node.nextLossNodeId && <span>败者 → {nodeLabel.get(node.nextLossNodeId) ?? node.nextLossNodeId}</span>}
          </div>}
        </article>;
      })}
    </div>)}
    {props.series.some((row) => row.bracketNodeId && !nodeLabel.has(row.bracketNodeId)) && <p className="stu-muted">部分系列引用了模板中不存在的 bracket 节点，请重新生成赛事包。</p>}
    </div>
  </>;
}

export function BracketConnections({ stage, series }: { stage: EventStage; series: StudioSeriesRecord[] }) {
  const nodes = stage.bracketNodes ?? [];
  const rounds = [...new Set(nodes.map((node) => node.round))].sort((a, b) => a - b);
  const roundIndex = new Map(rounds.map((round, index) => [round, index]));
  const maxPerRound = Math.max(1, ...rounds.map((round) => nodes.filter((node) => node.round === round).length));
  const laneLabels = { single: "淘汰赛", winner: "胜者组", loser: "败者组", grand: "总决赛" } as const;
  const lanes = (["winner", "loser", "grand", "single"] as const).filter((lane) => nodes.some((node) => node.lane === lane));
  const laneMode = lanes.length > 1;
  const laneHeight = Math.max(150, maxPerRound * 52);
  const width = Math.max(520, rounds.length * 260 + (laneMode ? 86 : 0));
  const height = laneMode ? lanes.length * laneHeight : Math.max(180, maxPerRound * 82);
  const positions = new Map<string, { x: number; y: number }>();
  for (const [laneIndex, lane] of lanes.entries()) {
    for (const round of rounds) {
      const rows = nodes.filter((node) => node.round === round && node.lane === lane);
      rows.forEach((node, index) => positions.set(node.id, {
        x: (roundIndex.get(round) ?? 0) * 260 + (laneMode ? 86 : 12),
        y: laneMode ? laneIndex * laneHeight + ((index + 0.5) * laneHeight) / rows.length : ((index + 0.5) * height) / rows.length,
      }));
    }
  }
  const scoreFor = (nodeId: string) => {
    const match = series.find((row) => row.bracketNodeId === nodeId);
    if (!match) return "待导入";
    return match.status === "finished" ? `${match.teamAName} ${match.scoreA ?? 0}:${match.scoreB ?? 0} ${match.teamBName}` : `${match.teamAName} vs ${match.teamBName}`;
  };
  return <div className="stu-bracket-diagram" role="img" aria-label={`${stage.name} 胜败晋级关系`}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {laneMode && lanes.map((lane, index) => <g key={lane}>
        {index > 0 && <line className="stu-bracket-lane-separator" x1="0" x2={width} y1={index * laneHeight} y2={index * laneHeight} />}
        <text className="stu-bracket-lane-label" x="12" y={index * laneHeight + 24}>{laneLabels[lane]}</text>
      </g>)}
      {nodes.flatMap((node) => {
        const from = positions.get(node.id)!;
        return ([{ target: node.nextWinNodeId, loss: false }, { target: node.nextLossNodeId, loss: true }] as const).flatMap(({ target, loss }) => {
          const to = target ? positions.get(target) : null;
          if (!to) return [];
          const startX = from.x + 210;
          const endX = to.x;
          const midX = (startX + endX) / 2;
          return <path key={`${node.id}-${target}-${loss ? "loss" : "win"}`} className={loss ? "stu-bracket-edge stu-bracket-edge-loss" : "stu-bracket-edge"} d={`M ${startX} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${endX} ${to.y}`}><title>{`${node.label} ${loss ? "败者" : "胜者"}进入 ${nodes.find((item) => item.id === target)?.label ?? target}`}</title></path>;
        });
      })}
      {nodes.map((node) => {
        const position = positions.get(node.id)!;
        return <g key={node.id} transform={`translate(${position.x} ${position.y - 25})`}>
          <rect className="stu-bracket-box" width="210" height="50" rx="4" />
          <text className="stu-bracket-box-title" x="10" y="19">{node.label}</text>
          <text className="stu-bracket-box-match" x="10" y="38">{scoreFor(node.id)}</text>
        </g>;
      })}
    </svg>
  </div>;
}

interface StageProps { series: StudioSeriesRecord[]; entries: StudioDemoEntry[]; onOpenMatch: (entryId: string) => void }

function SeriesList({ series, entries, onOpenMatch, showRecord = false }: StageProps & { showRecord?: boolean }) {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  return <div>{series.map((match) => <details key={match.id} className="stu-card"><summary><b>{match.teamAName}</b> {match.status === "finished" ? `${match.scoreA ?? 0}:${match.scoreB ?? 0}` : "vs"} <b>{match.teamBName}</b> · {match.format.toUpperCase()}{showRecord && (match.teamARecordBefore || match.teamBRecordBefore) ? ` · ${match.teamARecordBefore ?? "-"} / ${match.teamBRecordBefore ?? "-"}` : ""}</summary><p className="stu-muted">{match.completedAt ? `完成于 ${new Date(match.completedAt).toLocaleString("zh-CN")}` : match.scheduledAt ? `计划于 ${new Date(match.scheduledAt).toLocaleString("zh-CN")}` : match.status === "finished" ? "完成时间未知" : "未排期"} · {match.mapAssignments?.filter((map) => map.entryId).length ?? match.entryIds.length}/{match.mapAssignments?.length ?? match.entryIds.length} 图已有资源</p><div className="stu-chip-row">{match.entryIds.map((id) => { const entry = entryById.get(id); return entry ? <button key={id} className="stu-chip" onClick={() => onOpenMatch(id)}>{entry.meta.mapName} {entry.meta.teamAScore}:{entry.meta.teamBScore}</button> : null; })}</div>{match.veto && <BpView veto={match.veto} />}</details>)}</div>;
}
