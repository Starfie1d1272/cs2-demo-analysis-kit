import { useEffect, useMemo, useState } from "react";
import { DataTable, EmptyState, STUDIO_TABLE_CLASSES, type DataTableColumn } from "@cs2dak/react";
import type { TeamOverviewModel } from "@cs2dak/presentation";
import { getTeamOverview, type IdentityOptions } from "../lib/season";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/library";

type TeamViewAction = "duel" | "economy" | "utility" | "control" | "trails" | "coach";

const MAP_COLUMNS: DataTableColumn<TeamOverviewModel["maps"][number]>[] = [
  { key: "mapName", label: "地图", format: (row) => row.mapName },
  { key: "matches", label: "场次", numeric: true, sortable: true, sortValue: (row) => row.matches, format: (row) => row.matches },
  { key: "record", label: "战绩", format: (row) => `${row.wins}胜 ${row.losses}负` },
  { key: "rounds", label: "回合", format: (row) => `${row.roundsWon}:${row.roundsLost}` },
];

const ROSTER_COLUMNS: DataTableColumn<TeamOverviewModel["roster"][number]>[] = [
  { key: "name", label: "选手", format: (row) => row.name },
  { key: "rr", label: "RR", numeric: true, sortable: true, sortValue: (row) => row.rr, format: (row) => row.rr?.toFixed(3) ?? "—" },
  { key: "adr", label: "ADR", numeric: true, sortable: true, sortValue: (row) => row.adr, format: (row) => row.adr?.toFixed(1) ?? "—" },
  { key: "kast", label: "KAST", numeric: true, sortable: true, sortValue: (row) => row.kast, format: (row) => row.kast == null ? "—" : `${row.kast.toFixed(1)}%` },
];

export function TeamView({
  entries,
  selectedTeam,
  onSelectTeam,
  onOpenMatch,
  onOpenCapability,
  onGoLibrary,
  identityOptions,
}: {
  entries: StudioDemoEntry[];
  selectedTeam: string | null;
  onSelectTeam: (teamName: string) => void;
  onOpenMatch: (entryId: string) => void;
  onOpenCapability: (view: TeamViewAction) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
}) {
  const teams = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      for (const rawName of [entry.meta.teamAName, entry.meta.teamBName]) {
        const name = identityOptions?.teamRenames?.[rawName] ?? rawName;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([name, matches]) => ({ name, matches }))
      .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
  }, [entries, identityOptions?.version]);
  const activeTeam = selectedTeam && teams.some((team) => team.name === selectedTeam) ? selectedTeam : teams[0]?.name ?? null;
  const [overview, setOverview] = useState<TeamOverviewModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTeam || entries.length === 0) {
      setOverview(null);
      return;
    }
    let cancelled = false;
    setOverview(null);
    setError(null);
    void getTeamOverview(entries, activeTeam, identityOptions)
      .then((next) => { if (!cancelled) setOverview(next); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [entries, activeTeam, identityOptions?.version]);

  if (entries.length === 0) {
    return <div className="stu-view"><EmptyState mark title="还没有队伍数据" hint="先在资料库导入比赛，才能按本地队伍身份组织总览。" action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>} /></div>;
  }

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div><h1>队伍</h1><p>用当前语料查看一支队伍的基础盘面，并在同一上下文继续专项分析。</p></div>
        <label className="stu-field">队伍
          <select value={activeTeam ?? ""} onChange={(event) => onSelectTeam(event.target.value)}>
            {teams.map((team) => <option key={team.name} value={team.name}>{team.name} · {team.matches} 场</option>)}
          </select>
        </label>
      </header>
      {error && <EmptyState variant="error" title="队伍总览不可用" hint={error} />}
      {!error && !overview && <div className="stu-loading">聚合队伍事实…</div>}
      {overview && (
        <>
          <section className="stu-card">
            <div className="stu-section-head"><h2>{overview.teamName}</h2><span className="stu-muted">描述性汇总，不自动判断强弱项或制定对策。</span></div>
            <div className="stu-metric-grid">
              <div className="stu-metric"><span>比赛</span><b>{overview.matchCount}</b></div>
              <div className="stu-metric"><span>战绩</span><b>{overview.wins}胜 {overview.losses}负</b></div>
              <div className="stu-metric"><span>回合</span><b>{overview.roundsWon}:{overview.roundsLost}</b></div>
              <div className="stu-metric"><span>阵容样本</span><b>{overview.roster.length} 人</b></div>
            </div>
          </section>
          <div className="stu-home-grid">
            <section className="stu-card"><h3>地图盘面</h3><DataTable classes={STUDIO_TABLE_CLASSES} rows={overview.maps} rowKey={(row) => row.mapName} initialSortKey="matches" columns={MAP_COLUMNS} /></section>
            <section className="stu-card"><h3>阵容</h3><DataTable classes={STUDIO_TABLE_CLASSES} rows={overview.roster} rowKey={(row) => row.steamId64} initialSortKey="rr" columns={ROSTER_COLUMNS} /></section>
          </div>
          <div className="stu-home-grid">
            <section className="stu-card"><h3>经济样本</h3>{overview.economyWinRate.length === 0 ? <p className="stu-muted">当前范围没有可用经济事实。</p> : <div className="stu-chip-row">{overview.economyWinRate.map((row) => <span key={row.economyType} className="stu-chip">{row.economyType} · {row.wins}/{row.rounds}</span>)}</div>}</section>
            <section className="stu-card"><h3>最近比赛</h3><div className="stu-chip-row">{overview.matches.slice(-5).reverse().map((match) => <button key={match.matchId} type="button" className="stu-chip" onClick={() => { const entry = entries.find((item) => matchIdForEntry(item) === match.matchId); if (entry) onOpenMatch(entry.id); }}>{match.mapName} · {match.opponent} · {match.roundsWon}:{match.roundsLost}</button>)}</div></section>
          </div>
          <section className="stu-card"><h3>继续分析</h3><p className="stu-muted">以下入口保持当前队伍与语料；各能力只展示其实际可用的样本与限制。</p><div className="stu-header-actions">{(["duel", "economy", "utility", "control", "trails", "coach"] as const).map((view) => <button key={view} type="button" className="stu-button-sm" onClick={() => onOpenCapability(view)}>{({ duel: "对枪", economy: "经济与转化", utility: "道具价值", control: "控图", trails: "开局动线", coach: "Coach" })[view]}</button>)}</div></section>
        </>
      )}
    </div>
  );
}
