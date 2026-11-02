import { canExportSnapshot, withCapabilityConditions, unionExportEntries, withAnalysisExportEntries as applyExportEntries } from "../lib/analysis-export";
import { CapabilityBar, useCapability } from "../components/CapabilityBar";
import type { CapabilityRepairAction } from "../lib/capability-availability";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../lib/queries/query-cache";
import { AnalysisExportButtons } from "../components/AnalysisExportButtons";
import { buildTeamAnalysisResult } from "../lib/analysis-export-team";
import type { AnalysisExportSource } from "../lib/analysis-export";
import { getTeamComparison } from "../lib/queries/team-queries";
import { TeamComparisonPanel } from "@cs2dak/react";
import type { TeamComparisonModel } from "@cs2dak/presentation";
import type { TeamPageState } from "../lib/studio-page-state";
import { STUDIO_TABLE_CLASSES } from "../components/table-styles";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DataTable, EmptyState, type DataTableColumn } from "@cs2dak/react";
import type { TeamOverviewModel } from "@cs2dak/presentation";
import { getTeamOverview } from "../lib/queries/team-queries";
import { type IdentityOptions } from "../lib/identity";
import { displayTeamName } from "../lib/team-identity";
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
  onCapabilityRepair,
  exportSource,
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
  onCapabilityRepair: (action: CapabilityRepairAction) => void;
  exportSource?: AnalysisExportSource | null;
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
      for (const name of new Set([entry.meta.teamAName, entry.meta.teamBName].map(rawName => displayTeamName(rawName, identityOptions?.teamRenames)))) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([name, matches]) => ({ name, matches }))
      .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
  }, [entries, identityOptions?.version]);
  const activeTeam = selectedTeam && teams.some((team) => team.name === selectedTeam) ? selectedTeam : null;
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const teamEntries = useMemo(() => activeTeam ? entries.filter(entry => [entry.meta.teamAName, entry.meta.teamBName].some(name => displayTeamName(name, identityOptions?.teamRenames) === activeTeam)) : [], [entries, activeTeam, identityOptions?.teamRenames]);
  const overviewCapability = useCapability(teamEntries, "team-comparison");
  const comparisonCapability = useCapability(entries, "team-comparison");
  const overviewEntries = overviewCapability.eligible;
  const comparisonEntries = comparisonCapability.eligible;
  const overviewKey = JSON.stringify([entries.map(entry => entry.id), activeTeam, identityOptions?.version]);
  const comparisonKey = JSON.stringify([entries.map(entry => entry.id), activeTeam, state.compareTeamName, identityOptions?.version]);
  const [overviewSnapshot, setOverviewSnapshot] = useState<{ key: string; generation: number; sample: string; value: TeamOverviewModel | null } | null>(null);
  const [comparisonSnapshot, setComparisonSnapshot] = useState<{ key: string; generation: number; sample: string; value: TeamComparisonModel } | null>(null);
  const overview = overviewSnapshot?.key === overviewKey ? overviewSnapshot.value : null;
  const comparison = comparisonSnapshot?.key === comparisonKey ? comparisonSnapshot.value : null;
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [comparisonRetry, setComparisonRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!activeTeam || !state.compareTeamName || !comparisonEntries?.length || analysis.status !== "ready") return;
    let cancelled = false;
    setComparisonError(null);
    void getTeamComparison(comparisonEntries, identityOptions, [activeTeam, state.compareTeamName])
      .then(value => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setComparisonSnapshot({ key: comparisonKey, generation: analysis.generation, sample: JSON.stringify(comparisonEntries.map(entry => entry.id)), value }); } })
      .catch(reason => { if (!cancelled) setComparisonError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [comparisonEntries, activeTeam, state.compareTeamName, identityOptions?.version, comparisonRetry, comparisonKey, analysis]);
  useEffect(() => {
    if (!activeTeam || !overviewEntries?.length || analysis.status !== "ready") return;
    let cancelled = false;
    setError(null);
    void getTeamOverview(overviewEntries, activeTeam, identityOptions)
      .then(value => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setOverviewSnapshot({ key: overviewKey, generation: analysis.generation, sample: JSON.stringify(overviewEntries.map(entry => entry.id)), value }); } })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [overviewEntries, activeTeam, identityOptions?.version, overviewKey, analysis]);
  useEffect(() => {
    if (!onPageReady || (activeTeam && !overview && !error && !overviewCapability.error && !overviewCapability.stale && overviewEntries?.length !== 0)) return;
    onPageReady(Array.from(document.querySelectorAll<HTMLElement>("[id]"), node => node.id));
  }, [onPageReady, activeTeam, overview, error, overviewCapability.error, overviewEntries]);

  const overviewCurrent = !!overview && !error && !overviewCapability.error &&
    !overviewCapability.stale && canExportSnapshot(overviewSnapshot, analysis, overviewEntries);
  const comparisonCurrent = !!state.compareTeamName && !!comparison && !comparisonError &&
    !comparisonCapability.error && !comparisonCapability.stale &&
    canExportSnapshot(comparisonSnapshot, analysis, comparisonEntries);

  if (entries.length === 0) {
    return <div className="stu-view"><EmptyState mark title="还没有队伍数据" hint="先在资料库导入比赛，才能按本地队伍身份组织总览。" action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>} /></div>;
  }


  return (
    <div className="stu-view stu-reading-view">
      <header className="stu-view-header">
        <div><h1>队伍</h1>{overviewCurrent && overview && exportSource && <AnalysisExportButtons
          label={state.compareTeamName && !comparisonCurrent ? "导出本次结果（不含队伍对比）" : undefined}
          capture={() => buildTeamAnalysisResult(
            withCapabilityConditions(
              applyExportEntries(exportSource, unionExportEntries(overviewEntries, comparisonCurrent ? comparisonEntries : null)),
              overviewCapability.availability, comparisonCurrent ? comparisonCapability.availability : null,
            ),
            overview, comparisonCurrent ? comparison : null, state, { maps: MAP_COLUMNS, roster: ROSTER_COLUMNS },
            state.compareTeamName && !comparisonCurrent ? ["队伍对比未导出：无当前可用结果或正在更新。"] : [],
          )}
        />}<p>按显示名称观察组汇总；同场双方同名时分别计入双方贡献，比赛场次去重，胜负与回合按双方累计。RR 为出场信号聚合后的账号评分，计分板使用单场指标评分，口径不同。</p></div>
        <label className="stu-team-picker">切换队伍
          <select value={activeTeam ?? ""} onChange={(event) => event.target.value && onSelectTeam(event.target.value)}>
            <option value="">请选择队伍</option>
            {teams.map((team) => <option key={team.name} value={team.name}>{team.name} · {team.matches} 场</option>)}
          </select>
        </label>
      </header>
      {!activeTeam && <EmptyState variant="insufficient" title={selectedTeam ? "当前队伍在此范围为 0 场" : "请选择队伍"} hint="请调整范围，或从上方选择当前语料中的队伍。" />}
      {activeTeam && overviewCapability.availability && <CapabilityBar availability={overviewCapability.availability} onRepair={onCapabilityRepair} />}
      {overviewCapability.error && <p role="alert">队伍数据读取失败：{overviewCapability.error} <button type="button" className="stu-button-sm" onClick={overviewCapability.retry}>重试</button></p>}
      {activeTeam && (
                  <section className="stu-card" id="analysis-comparison"><h3>队伍对比</h3>
            {comparisonCapability.availability && <CapabilityBar availability={comparisonCapability.availability} onRepair={onCapabilityRepair} />}
            {comparisonCapability.error && <p role="alert">对比能力读取失败：{comparisonCapability.error} <button type="button" className="stu-button-sm" onClick={comparisonCapability.retry}>重试</button></p>}
            {comparison && (comparisonError || comparisonCapability.error || analysis.status !== "ready" || comparisonSnapshot?.generation !== analysis.generation || comparisonSnapshot.sample !== JSON.stringify(comparisonEntries?.map(entry => entry.id))) && <p role="status">{comparisonError || comparisonCapability.error || analysis.status === "error" ? "更新失败，显示旧版本结果。" : analysis.status === "ready" && comparisonEntries?.length === 0 ? "当前无可用样本，以下保留上次结果。" : "正在更新，显示旧版本结果。"}</p>}
            <label>对比队伍 <select value={state.compareTeamName ?? ""} onChange={event => onStateChange({ ...state, compareTeamName: event.target.value || null })}><option value="">不比较</option>{teams.filter(team => team.name !== activeTeam).map(team => <option key={team.name} value={team.name}>{team.name} · {team.matches} 场</option>)}</select></label>
            {state.compareTeamName && comparisonEntries?.length === 0 && !comparison && <p>当前没有可用对比样本。</p>}
            {comparisonError && <div role="alert"><span>队伍对比加载失败：{comparisonError}</span> <button type="button" className="stu-button-sm" onClick={() => setComparisonRetry(value => value + 1)}>重试对比</button></div>}
            {state.compareTeamName && !comparison && !comparisonError && !comparisonCapability.error && !comparisonCapability.stale && comparisonEntries?.length !== 0 && <div className="stu-loading">加载队伍对比…</div>}
            {comparison && <TeamComparisonPanel model={comparison} onSelectPair={(a, b) => { if (a !== activeTeam) onSelectTeam(a); else onStateChange({ ...state, compareTeamName: b }); }} onOpenMatch={matchId => { const entry = entries.find(item => matchIdForEntry(item) === matchId); if (entry) onOpenMatch(entry.id); }} />}
          </section>
      )}
      {overview && (error || overviewCapability.error || analysis.status !== "ready" || overviewSnapshot?.generation !== analysis.generation || overviewSnapshot.sample !== JSON.stringify(overviewEntries?.map(entry => entry.id))) && <p role="status">{error || overviewCapability.error || analysis.status === "error" ? "更新失败，显示旧版本结果。" : analysis.status === "ready" && overviewEntries?.length === 0 ? "当前无可用样本，以下保留上次结果。" : "正在更新，显示旧版本结果。"}</p>}
      {error && <EmptyState variant="error" title="队伍总览不可用" hint={error} />}
      {activeTeam && overviewEntries?.length === 0 && !overview && <EmptyState variant="insufficient" title="没有可用队伍数据" hint="请查看上方限制和修复入口。" />}
      {!error && !overviewCapability.error && !overviewCapability.stale && overviewEntries?.length !== 0 && activeTeam && !overview && <div className="stu-loading">聚合队伍事实…</div>}
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
            <section className="stu-card"><h3>地图盘面</h3><DataTable classes={STUDIO_TABLE_CLASSES} rows={overview.maps} rowKey={(row) => row.mapName} state={mapTable} onStateChange={setMapTable} columns={MAP_COLUMNS} /></section>
            <section className="stu-card"><h3>阵容</h3><DataTable classes={STUDIO_TABLE_CLASSES} rows={overview.roster} rowKey={(row) => row.steamId64} state={rosterTable} onStateChange={setRosterTable} columns={ROSTER_COLUMNS} /></section>
          </div>
          <section className="stu-card"><h3>位置与职责</h3><button type="button" className="stu-button-sm" onClick={() => onOpenCapability("roles")}>查看位置与职责</button></section>
          <div className="stu-home-grid">
            <section className="stu-card"><h3>经济样本</h3>{overview.economyWinRate.length === 0 ? <p className="stu-muted">当前范围没有可用经济事实。</p> : <div className="stu-chip-row">{overview.economyWinRate.map((row) => <span key={row.economyType} className="stu-chip">{row.economyType} · {row.wins}/{row.rounds}</span>)}</div>}</section>
            <section className="stu-card"><h3>最近比赛</h3><div className="stu-chip-row">{overview.matches.slice(-5).reverse().map((match, index) => <button key={`${match.matchId}:${index}`} type="button" className="stu-chip" onClick={() => { const entry = entries.find((item) => matchIdForEntry(item) === match.matchId); if (entry) onOpenMatch(entry.id); }}>{match.mapName} · {match.opponent} · {match.roundsWon}:{match.roundsLost}</button>)}</div></section>
          </div>
          <section className="stu-card"><h3>继续分析</h3><p className="stu-muted">以下入口保持当前队伍与语料；各能力只展示其实际可用的样本与限制。</p><div className="stu-header-actions">{(["duel", "economy", "utility", "opening", "control", "patterns"] as const).map((view) => <button key={view} type="button" className="stu-button-sm" onClick={() => onOpenCapability(view)}>{({ duel: "对枪", economy: "经济与转化", utility: "道具价值", opening: "开局动线", control: "控图", patterns: "战术模式与对手侦察" })[view]}</button>)}</div></section>
        </>
      )}
    </div>
  );
}
