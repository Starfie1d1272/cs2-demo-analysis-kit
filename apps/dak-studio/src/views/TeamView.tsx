import { getTeamComparison } from "../lib/queries/team-queries";
import { TeamComparisonPanel } from "@cs2dak/react";
import type { TeamComparisonModel } from "@cs2dak/presentation";
import type { TeamPageState } from "../lib/studio-page-state";
import { STUDIO_TABLE_CLASSES } from "../components/table-styles";
import { useEffect, useMemo, useState } from "react";
import { DataTable, EmptyState, type DataTableColumn } from "@cs2dak/react";
import type { TeamOverviewModel } from "@cs2dak/presentation";
import { getTeamOverview } from "../lib/queries/team-queries";
import { type IdentityOptions } from "../lib/identity";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/demo-entry";

type TeamViewAction = "duel" | "economy" | "utility" | "opening" | "control" | "patterns" | "roles";

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
  state,
  onStateChange,
  onPageReady,
  onGoLibrary,
  identityOptions,
}: {
  entries: StudioDemoEntry[];
  selectedTeam: string | null;
  onSelectTeam: (teamName: string) => void;
  onOpenMatch: (entryId: string) => void;
  onOpenCapability: (view: TeamViewAction) => void;
  state: TeamPageState;
  onStateChange: (state: TeamPageState) => void;
  onPageReady?: (keys: string[]) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
}) {
  const mapTable = state.tables.maps ?? { sort: { key: "matches", direction: "desc" as const }, page: 0 };
  const rosterTable = state.tables.roster ?? { sort: { key: "rr", direction: "desc" as const }, page: 0 };
  const setMapTable = (value: typeof mapTable) => onStateChange({ ...state, tables: { ...state.tables, maps: value } });
  const setRosterTable = (value: typeof rosterTable) => onStateChange({ ...state, tables: { ...state.tables, roster: value } });
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
  const activeTeam = selectedTeam && teams.some((team) => team.name === selectedTeam) ? selectedTeam : null;
  const [comparison, setComparison] = useState<TeamComparisonModel | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [comparisonRetry, setComparisonRetry] = useState(0);
  const [overview, setOverview] = useState<TeamOverviewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!activeTeam || !state.compareTeamName) { setComparison(null); setComparisonError(null); return; }
    let cancelled = false;
    setComparison(null); setComparisonError(null);
    void getTeamComparison(entries, identityOptions, [activeTeam, state.compareTeamName])
      .then(model => { if (!cancelled) setComparison(model); })
      .catch(reason => { if (!cancelled) setComparisonError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [entries, activeTeam, state.compareTeamName, identityOptions?.version, comparisonRetry]);

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

  useEffect(() => {
    if (!onPageReady || (activeTeam && !overview && !error)) return;
    onPageReady(Array.from(document.querySelectorAll<HTMLElement>("[id]"), node => node.id));
  }, [onPageReady, activeTeam, overview, error]);

  if (entries.length === 0) {
    return <div className="stu-view"><EmptyState mark title="还没有队伍数据" hint="先在资料库导入比赛，才能按本地队伍身份组织总览。" action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>} /></div>;
  }


  return (
    <div className="stu-view stu-reading-view">
      <header className="stu-view-header">
        <div><h1>队伍</h1><p>用当前语料查看一支队伍的基础盘面，并在同一上下文继续专项分析。</p></div>
        <label className="stu-team-picker">切换队伍
          <select value={activeTeam ?? ""} onChange={(event) => event.target.value && onSelectTeam(event.target.value)}>
            <option value="">请选择队伍</option>
            {teams.map((team) => <option key={team.name} value={team.name}>{team.name} · {team.matches} 场</option>)}
          </select>
        </label>
      </header>
      {!activeTeam && <EmptyState variant="insufficient" title={selectedTeam ? "当前队伍在此范围为 0 场" : "请选择队伍"} hint="请调整范围，或从上方选择当前语料中的队伍。" />}
      {error && <EmptyState variant="error" title="队伍总览不可用" hint={error} />}
      {!error && activeTeam && !overview && <div className="stu-loading">聚合队伍事实…</div>}
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
          <section className="stu-card" id="analysis-comparison"><h3>队伍对比 · 当前范围 {entries.length} 场</h3>
            <label>对比队伍 <select value={state.compareTeamName ?? ""} onChange={event => onStateChange({ ...state, compareTeamName: event.target.value || null })}><option value="">不比较</option>{teams.filter(team => team.name !== activeTeam).map(team => <option key={team.name} value={team.name}>{team.name} · {team.matches} 场</option>)}</select></label>
            {comparisonError && <div role="alert"><span>队伍对比加载失败：{comparisonError}</span> <button type="button" className="stu-button-sm" onClick={() => setComparisonRetry(value => value + 1)}>重试对比</button></div>}
            {state.compareTeamName && !comparison && !comparisonError && <div className="stu-loading">加载队伍对比…</div>}
            {comparison && <TeamComparisonPanel model={comparison} onSelectPair={(a, b) => { if (a !== activeTeam) onSelectTeam(a); else onStateChange({ ...state, compareTeamName: b }); }} onOpenMatch={matchId => { const entry = entries.find(item => matchIdForEntry(item) === matchId); if (entry) onOpenMatch(entry.id); }} />}
          </section>
          <div className="stu-home-grid">
            <section className="stu-card"><h3>地图盘面</h3><DataTable classes={STUDIO_TABLE_CLASSES} rows={overview.maps} rowKey={(row) => row.mapName} state={mapTable} onStateChange={setMapTable} columns={MAP_COLUMNS} /></section>
            <section className="stu-card"><h3>阵容</h3><DataTable classes={STUDIO_TABLE_CLASSES} rows={overview.roster} rowKey={(row) => row.steamId64} state={rosterTable} onStateChange={setRosterTable} columns={ROSTER_COLUMNS} /></section>
          </div>
          <section className="stu-card"><h3>位置与职责</h3><button type="button" className="stu-button-sm" onClick={() => onOpenCapability("roles")}>查看位置与职责</button></section>
          <div className="stu-home-grid">
            <section className="stu-card"><h3>经济样本</h3>{overview.economyWinRate.length === 0 ? <p className="stu-muted">当前范围没有可用经济事实。</p> : <div className="stu-chip-row">{overview.economyWinRate.map((row) => <span key={row.economyType} className="stu-chip">{row.economyType} · {row.wins}/{row.rounds}</span>)}</div>}</section>
            <section className="stu-card"><h3>最近比赛</h3><div className="stu-chip-row">{overview.matches.slice(-5).reverse().map((match) => <button key={match.matchId} type="button" className="stu-chip" onClick={() => { const entry = entries.find((item) => matchIdForEntry(item) === match.matchId); if (entry) onOpenMatch(entry.id); }}>{match.mapName} · {match.opponent} · {match.roundsWon}:{match.roundsLost}</button>)}</div></section>
          </div>
          <section className="stu-card"><h3>继续分析</h3><p className="stu-muted">以下入口保持当前队伍与语料；各能力只展示其实际可用的样本与限制。</p><div className="stu-header-actions">{(["duel", "economy", "utility", "opening", "control", "patterns"] as const).map((view) => <button key={view} type="button" className="stu-button-sm" onClick={() => onOpenCapability(view)}>{({ duel: "对枪", economy: "经济与转化", utility: "道具价值", opening: "开局动线", control: "控图", patterns: "战术模式与对手侦察" })[view]}</button>)}</div></section>
        </>
      )}
    </div>
  );
}
