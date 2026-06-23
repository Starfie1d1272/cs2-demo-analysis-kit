import { useEffect, useMemo, useState } from "react";
import { formatPercent, type TeamComparisonModel, type TournamentInsights } from "@cs2dak/presentation";
import { DataTable, STUDIO_TABLE_CLASSES, TeamComparisonPanel, type DataTableColumn } from "@cs2dak/react";
import { getTeamComparison, getTournamentInsights, type IdentityOptions } from "../lib/season";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { EmptyState, MetricInfo } from "@cs2dak/react";

export interface TournamentDashboardViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
  teamRenames?: Record<string, string>;
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
  allEntries,
  entries,
  scope,
  onScopeChange,
  onOpenMatch,
  onGoLibrary,
  identityOptions,
  teamRenames = {}
}: TournamentDashboardViewProps) {
  const [insights, setInsights] = useState<TournamentInsights | null>(null);
  const [teamComparison, setTeamComparison] = useState<TeamComparisonModel | null>(null);
  const [comparePair, setComparePair] = useState<[string, string] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entries.length === 0) {
      setInsights(null);
      return;
    }
    let cancelled = false;
    setInsights(null);
    setError(null);
    getTournamentInsights(entries, identityOptions, scope.teams)
      .then((result) => {
        if (!cancelled) setInsights(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries, identityOptions?.version, scope.teams]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 队伍对比独立加载：A/B 两队跨全部己方比赛聚合，无需互相交手。comparePair 缺省时
  // 由构建器取场次最多的两队；选队后只换 pair 重查（availableTeams 不变）。
  useEffect(() => {
    if (entries.length === 0) {
      setTeamComparison(null);
      return;
    }
    let cancelled = false;
    getTeamComparison(entries, identityOptions, comparePair ?? undefined)
      .then((result) => {
        if (!cancelled) setTeamComparison(result);
      })
      .catch(() => {
        if (!cancelled) setTeamComparison(null);
      });
    return () => {
      cancelled = true;
    };
  }, [entries, identityOptions?.version, comparePair]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有赛事数据"
          hint="赛事总览由资料库内 demo 聚合而成，先导入比赛。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  const scopePanel = <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} teamRenames={teamRenames} />;
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>赛事总览</h1>
          <p>当前聚合范围内的地图使用与攻防节奏。最佳选手榜见「排行榜」子页。</p>
        </div>
      </header>
      {scopePanel}
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && !insights && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo…</div>}
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
            <h3>队伍对比</h3>
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
            ) : (
              <p className="stu-dim">至少需要两个队伍的 demo 才能生成对比。</p>
            )}
          </div>
          <div className="stu-card">
            <h3>地图盘面</h3>
            <DataTable
              classes={STUDIO_TABLE_CLASSES}
              rows={insights.maps}
              rowKey={(row) => row.mapName}
              initialSortKey="matches"
              columns={MAP_COLUMNS}
            />
          </div>
          <div className="stu-card">
            <h3>武器击杀榜</h3>
            <DataTable
              classes={STUDIO_TABLE_CLASSES}
              rows={insights.weaponKills}
              rowKey={(row) => row.weapon}
              initialSortKey="kills"
              columns={WEAPON_COLUMNS}
            />
          </div>
          <p className="stu-muted">队伍手枪局、经济对位胜率与 Eco/Semi 翻盘等经济维度，统一在「经济与节奏」页查看（避免重复）。</p>
        </>
      )}
    </div>
  );
}
