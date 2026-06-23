import { useEffect, useMemo, useState } from "react";
import { formatPercent, type TeamComparisonModel, type TournamentInsights } from "@cs2dak/presentation";
import { TeamComparisonPanel } from "@cs2dak/react";
import { getTeamComparison, getTournamentInsights, type IdentityOptions } from "../lib/season";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { EmptyState, MetricInfo } from "../components/primitives";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entries.length === 0) {
      setInsights(null);
      setTeamComparison(null);
      return;
    }
    let cancelled = false;
    setInsights(null);
    setTeamComparison(null);
    setError(null);
    getTournamentInsights(entries, identityOptions, scope.teams)
      .then((result) => {
        if (!cancelled) setInsights(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    getTeamComparison(entries, identityOptions, scope.teams)
      .then((result) => {
        if (!cancelled) setTeamComparison(result);
      })
      .catch(() => {
        if (!cancelled) setTeamComparison(null);
      });
    return () => {
      cancelled = true;
    };
  }, [entries, identityOptions?.version, scope.teams]);  // eslint-disable-line react-hooks/exhaustive-deps

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
            {teamComparison ? (
              <TeamComparisonPanel
                model={teamComparison}
                onOpenEvidence={(matchId, roundNumber, tick) => {
                  const entry = entryByMatchId.get(matchId);
                  if (entry) onOpenMatch(entry.id, { roundNumber, tick });
                }}
              />
            ) : (
              <p className="stu-dim">至少需要两个队伍的 demo 才能生成对比。</p>
            )}
          </div>
          <div className="stu-card">
            <h3>地图盘面</h3>
            <table className="stu-mini-table">
              <thead>
                <tr>
                  <th>地图</th>
                  <th className="stu-num">场次</th>
                  <th className="stu-num">T 胜率</th>
                  <th className="stu-num">CT 胜率</th>
                  <th className="stu-num">手枪局 T 胜率</th>
                </tr>
              </thead>
              <tbody>
                {insights.maps.map((row) => (
                  <tr key={row.mapName}>
                    <td>{row.mapName}</td>
                    <td className="stu-num">{row.matches}</td>
                    <td className="stu-num">{row.tWinRatePercent.toFixed(1)}%</td>
                    <td className="stu-num">{row.ctWinRatePercent.toFixed(1)}%</td>
                    <td className="stu-num">{formatPercent(row.pistolTWinRatePercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stu-card">
            <h3>武器击杀榜</h3>
            <table className="stu-mini-table">
              <thead>
                <tr>
                  <th>武器</th>
                  <th className="stu-num">击杀</th>
                  <th className="stu-num">HS%</th>
                  <th>最高选手</th>
                </tr>
              </thead>
              <tbody>
                {insights.weaponKills.map((row) => (
                  <tr key={row.weapon}>
                    <td>{row.label}</td>
                    <td className="stu-num">{row.kills}</td>
                    <td className="stu-num">{formatPercent(row.headshotPercent)}</td>
                    <td>{row.topPlayerName ? `${row.topPlayerName} · ${row.topPlayerKills}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="stu-muted">队伍手枪局、经济对位胜率与 Eco/Semi 翻盘等经济维度，统一在「经济与节奏」页查看（避免重复）。</p>
        </>
      )}
    </div>
  );
}
