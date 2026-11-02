import { AnalysisExportButtons } from "../components/AnalysisExportButtons";
import { canExportSnapshot, withCapabilityConditions, unionExportEntries, withAnalysisExportEntries as applyExportEntries } from "../lib/analysis-export";
import { CapabilityBar, useCapability } from "../components/CapabilityBar";
import type { CapabilityRepairAction } from "../lib/capability-availability";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../lib/queries/query-cache";
import { buildTournamentAnalysisResult } from "../lib/analysis-export-tournament";
import type { AnalysisExportSource } from "../lib/analysis-export";
import type { AnalysisPageState } from "../lib/studio-page-state";
import { usePageReady } from "../lib/use-page-ready";
import { STUDIO_TABLE_CLASSES } from "../components/table-styles";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { formatPercent, type TeamComparisonModel } from "@cs2dak/presentation";
import { type TournamentInsights } from "@cs2dak/analytics";
import { DataTable, TeamComparisonPanel, type DataTableColumn } from "@cs2dak/react";
import { getTeamComparison } from "../lib/queries/team-queries";
import { getTournamentInsights } from "../lib/queries/season-queries";
import { type IdentityOptions } from "../lib/identity";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/demo-entry";
import { EmptyState, MetricInfo } from "@cs2dak/react";
import { LeaderboardView } from "./LeaderboardView";

export interface TournamentDashboardViewProps {
  onCapabilityRepair: (action: CapabilityRepairAction) => void;
  exportSource?: AnalysisExportSource | null;
  exportPage?: "analysis" | "event-analysis";
  state: AnalysisPageState;
  onStateChange: (state: AnalysisPageState) => void;
  onPageReady?: (keys: string[]) => void;
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  selectedTeam?: string | null;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  onGoEconomy?: () => void;
  onOpenTeam?: (teamName: string) => void;
  onGoDirectory?: () => void;
  onOpenPlayer?: (playerKey: string) => void;
  identityOptions?: IdentityOptions;
}

type MapRow = TournamentInsights["maps"][number];
type WeaponRow = TournamentInsights["weaponKills"][number];

const MAP_COLUMNS: DataTableColumn<MapRow>[] = [
  { key: "mapName", label: "地图", format: (r) => r.mapName },
  { key: "matches", label: "场次", numeric: true, sortable: true, sortValue: (r) => r.matches, format: (r) => r.matches },
  { key: "tWin", label: "T 胜率", numeric: true, sortable: true, sortValue: (r) => r.tWinRatePercent, format: (r) => `${r.tWinRatePercent.toFixed(1)}%` },
  { key: "ctWin", label: "CT 胜率", numeric: true, sortable: true, sortValue: (r) => r.ctWinRatePercent, format: (r) => `${r.ctWinRatePercent.toFixed(1)}%` },
  { key: "pistolT", label: "手枪局 T 胜率", numeric: true, sortable: true, sortValue: (r) => r.pistolTWinRatePercent, format: (r) => formatPercent(r.pistolTWinRatePercent) }
];

const WEAPON_COLUMNS: DataTableColumn<WeaponRow>[] = [
  { key: "label", label: "武器", format: (r) => r.label },
  { key: "kills", label: "击杀", numeric: true, sortable: true, sortValue: (r) => r.kills, format: (r) => r.kills },
  { key: "hs", label: "HS%", numeric: true, sortable: true, sortValue: (r) => r.headshotPercent, format: (r) => formatPercent(r.headshotPercent) },
  { key: "top", label: "最高选手", format: (r) => (r.topPlayerName ? `${r.topPlayerName} · ${r.topPlayerKills}` : "—") }
];

/** v0.3 赛事总览：地图使用率、T/CT 胜率、手枪局与转化（cohort 同源聚合）。 */
export function TournamentDashboardView({
  onCapabilityRepair,
  exportSource, exportPage = "event-analysis",
  allEntries,
  entries,
  state,
  onStateChange,
  selectedTeam = null,
  onOpenMatch,
  onGoLibrary,
  onGoEconomy,
  onOpenTeam,
  onGoDirectory,
  onOpenPlayer,
  identityOptions,
  onPageReady
}: TournamentDashboardViewProps) {
  const mapTable = state.tables.maps ?? { sort: { key: "matches", direction: "desc" as const }, page: 0 };
  const weaponTable = state.tables.weapons ?? { sort: { key: "kills", direction: "desc" as const }, page: 0 };
  const setMapTable = (value: typeof mapTable) => onStateChange({ ...state, tables: { ...state.tables, maps: value } });
  const setWeaponTable = (value: typeof weaponTable) => onStateChange({ ...state, tables: { ...state.tables, weapons: value } });
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const insightCapability = useCapability(entries, "economy");
  const comparisonCapability = useCapability(entries, "team-comparison");
  const insightEntries = insightCapability.eligible;
  const comparisonEntries = comparisonCapability.eligible;
  const insightKey = JSON.stringify([entries.map(entry => entry.id), selectedTeam, identityOptions?.version]);
  const comparePair = state.comparePair;
  const setComparePair = (comparePair: [string, string] | null) => onStateChange({ ...state, comparePair });
  const comparisonKey = JSON.stringify([entries.map(entry => entry.id), comparePair, identityOptions?.version]);
  const [insightSnapshot, setInsightSnapshot] = useState<{ key: string; generation: number; sample: string; value: TournamentInsights | null } | null>(null);
  const [comparisonSnapshot, setComparisonSnapshot] = useState<{ key: string; generation: number; sample: string; value: TeamComparisonModel } | null>(null);
  const insights = insightSnapshot?.key === insightKey ? insightSnapshot.value : null;
  const teamComparison = comparisonSnapshot?.key === comparisonKey ? comparisonSnapshot.value : null;
  const [comparisonReady, setComparisonReady] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);
  usePageReady(entries.length === 0 || ((insights !== null || error !== null || insightCapability.error !== null || insightEntries?.length === 0) && (comparisonReady || comparisonCapability.error !== null || comparisonEntries?.length === 0)), onPageReady);
  useEffect(() => {
    if (!insightEntries?.length || analysis.status !== "ready") return;
    let cancelled = false;
    setError(null);
    getTournamentInsights(insightEntries, identityOptions, selectedTeam ? [selectedTeam] : [])
      .then(value => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setInsightSnapshot({ key: insightKey, generation: analysis.generation, sample: JSON.stringify(insightEntries.map(entry => entry.id)), value }); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [insightEntries, identityOptions?.version, selectedTeam, insightKey, analysis]);
  useEffect(() => {
    if (!comparisonEntries?.length || analysis.status !== "ready") return;
    let cancelled = false;
    setComparisonReady(false); setComparisonError(null);
    getTeamComparison(comparisonEntries, identityOptions, comparePair ?? undefined)
      .then(value => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setComparisonSnapshot({ key: comparisonKey, generation: analysis.generation, sample: JSON.stringify(comparisonEntries.map(entry => entry.id)), value }); } })
      .catch(reason => { if (!cancelled) setComparisonError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (!cancelled) setComparisonReady(true); });
    return () => { cancelled = true; };
  }, [comparisonEntries, identityOptions?.version, comparisonKey, analysis]);

  const insightCurrent = !!insights && !error && !insightCapability.error &&
    !insightCapability.stale && canExportSnapshot(insightSnapshot, analysis, insightEntries);
  const comparisonCurrent = !!teamComparison && teamComparison.teams.length === 2 &&
    comparisonReady && !comparisonError && !comparisonCapability.error &&
    !comparisonCapability.stale && canExportSnapshot(comparisonSnapshot, analysis, comparisonEntries);
  const captureOverview = (
    leaderEntries: StudioDemoEntry[],
    leaderboard?: import("../lib/analysis-export").AnalysisResultSection,
    leaderAvailability?: import("../lib/capability-availability").CapabilityAvailability | null,
  ) => {
    if (!exportSource) throw new Error("导出来源不可用");
    const omitted = [
      !insightCurrent ? "赛事总览、地图及武器未导出：无当前可用结果或正在更新。" : null,
      !comparisonCurrent ? "队伍比较未导出：无当前可用结果或正在更新。" : null,
      !leaderboard ? "排行榜未包含在此文件；可在排行榜准备完成后导出含排行榜的结果。" : null,
    ].filter((value): value is string => value !== null);
    const source = withCapabilityConditions(
      applyExportEntries(exportSource, unionExportEntries(
        insightCurrent ? insightEntries : null,
        comparisonCurrent ? comparisonEntries : null,
        leaderEntries,
      )),
      insightCurrent ? insightCapability.availability : null,
      comparisonCurrent ? comparisonCapability.availability : null,
      leaderAvailability ?? null,
    );
    return buildTournamentAnalysisResult(source, insightCurrent ? insights : null,
      comparisonCurrent ? teamComparison : null, state,
      { maps: MAP_COLUMNS, weapons: WEAPON_COLUMNS }, exportPage, leaderboard, omitted);
  };

  if (allEntries.length === 0) {
    return (
      <div className="stu-view stu-compact-empty">
        <EmptyState
          title="还没有比赛"
          hint="导入比赛后，即可查看队伍、选手和赛事分析。"
          action={<button type="button" className="stu-button-sm" onClick={onGoLibrary}>前往比赛库</button>}
        />
      </div>
    );
  }

  return (
    <div className="stu-view stu-reading-view">
      <header className="stu-view-header">
        <div>
          <h1>赛事总览</h1>
          {exportSource && (insightCurrent || comparisonCurrent) && <AnalysisExportButtons note="此文件不包含排行榜。" capture={() => captureOverview([])} />}
          <p>查看赛事的地图、队伍与经济表现。</p>
        </div>
        {onGoDirectory && <button type="button" className="stu-button-sm" onClick={onGoDirectory}>返回赛事目录</button>}
      </header>
      {insightCapability.availability && <CapabilityBar availability={insightCapability.availability} onRepair={onCapabilityRepair} />}
      {insightCapability.error && <p role="alert">赛事数据读取失败：{insightCapability.error} <button type="button" className="stu-button-sm" onClick={insightCapability.retry}>重试</button></p>}
      {insightEntries?.length === 0 && !insights && <EmptyState variant="insufficient" title="没有可用赛事数据" hint="请查看上方限制和修复入口。" />}
          <div className="stu-card">
            <h3>队伍对比</h3>
            {comparisonCapability.availability && <CapabilityBar availability={comparisonCapability.availability} onRepair={onCapabilityRepair} />}
            {comparisonCapability.error && <p role="alert">对比能力读取失败：{comparisonCapability.error} <button type="button" className="stu-button-sm" onClick={comparisonCapability.retry}>重试</button></p>}
            {teamComparison && (comparisonError || comparisonCapability.error || analysis.status !== "ready" || comparisonSnapshot?.generation !== analysis.generation || comparisonSnapshot.sample !== JSON.stringify(comparisonEntries?.map(entry => entry.id))) && <p role="status">{comparisonError || comparisonCapability.error || analysis.status === "error" ? "更新失败，显示旧版本结果。" : analysis.status === "ready" && comparisonEntries?.length === 0 ? "当前无可用样本，以下保留上次结果。" : "正在更新，显示旧版本结果。"}</p>}
            <p className="stu-muted">选两支队伍对比当前状态——无需互相交手，适合赛前侦察。</p>
            {teamComparison ? (
              <TeamComparisonPanel
                model={teamComparison}
                onSelectPair={(a, b) => setComparePair([a, b])}
                onOpenMatch={(matchId) => {
                  const entry = entryByMatchId.get(matchId);
                  if (entry) onOpenMatch(entry.id, { roundNumber: 1 });
                }}
              />
            ) : comparisonCapability.error ? null : comparisonEntries?.length === 0 ? <p>当前没有可用对比样本。</p> : comparisonError ? (
              <p className="stu-error" role="alert">队伍对比加载失败：{comparisonError}</p>
            ) : (
              <p className="stu-dim">至少需要两个队伍的 demo 才能生成对比。</p>
            )}
            {teamComparison && onOpenTeam && (
              <div className="stu-chip-row">
                {teamComparison.availableTeams.map((team) => <button key={team.name} type="button" className="stu-chip" onClick={() => onOpenTeam(team.name)}>{team.name} · {team.matches} 场</button>)}
              </div>
            )}
          </div>

      {insights && (error || insightCapability.error || analysis.status !== "ready" || insightSnapshot?.generation !== analysis.generation || insightSnapshot.sample !== JSON.stringify(insightEntries?.map(entry => entry.id))) && <p role="status">{error || insightCapability.error || analysis.status === "error" ? "更新失败，显示旧版本结果。" : analysis.status === "ready" && insightEntries?.length === 0 ? "当前无可用样本，以下保留上次结果。" : "正在更新，显示旧版本结果。"}</p>}
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && !insightCapability.error && !insightCapability.stale && !insights && insightEntries?.length !== 0 && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo…</div>}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
      {insights && (
        <>
          <div className="stu-metric-grid stu-card">
            <div className="stu-metric"><span>比赛场次</span><b>{insights.matchCount}</b></div>
            <div className="stu-metric"><span>总回合</span><b>{insights.roundCount}</b></div>
            <div className="stu-metric"><span>T 胜率</span><b>{insights.tWinRatePercent.toFixed(1)}%</b></div>
            <div className="stu-metric"><span>CT 胜率</span><b>{insights.ctWinRatePercent.toFixed(1)}%</b></div>
            <div className="stu-metric">
              <span>手枪局转化<MetricInfo note="赢下手枪局后把下一回合也拿下的比率" /></span>
              <b>{formatPercent(insights.pistolConversionPercent)}</b>
            </div>
          </div>
          <div className="stu-card">
            <h3>地图盘面</h3>
            <DataTable
              classes={STUDIO_TABLE_CLASSES}
              rows={insights.maps}
              rowKey={(row) => row.mapName}
              state={mapTable} onStateChange={setMapTable}
              columns={MAP_COLUMNS}
            />
          </div>
          <div className="stu-card">
            <h3>武器击杀榜</h3>
            <DataTable
              classes={STUDIO_TABLE_CLASSES}
              rows={insights.weaponKills}
              rowKey={(row) => row.weapon}
              state={weaponTable} onStateChange={setWeaponTable}
              columns={WEAPON_COLUMNS}
            />
          </div>
          <p className="stu-muted">队伍手枪局、经济对位胜率与 Eco/Semi 翻盘等经济维度，统一在
            {onGoEconomy ? <button type="button" className="dak-evidence" onClick={onGoEconomy}>经济与节奏</button> : "「经济与节奏」"}页查看（避免重复）。
          </p>
        </>
      )}
      {onOpenPlayer && <LeaderboardView
        exportSource={exportSource} exportPage={exportPage}
        captureOverview={exportSource ? captureOverview : undefined}
        onCapabilityRepair={onCapabilityRepair} state={state} onStateChange={onStateChange}
        embedded allEntries={allEntries} entries={entries} selectedTeam={selectedTeam}
        identityOptions={identityOptions} onPlayerClick={onOpenPlayer} onGoLibrary={onGoLibrary}
      />}
    </div>
  );
}
