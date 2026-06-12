import { useEffect, useState } from "react";
import { formatPercent, type TournamentInsights } from "@cs2dak/presentation";
import { getTournamentInsights, type IdentityOptions } from "../lib/season";
import type { StudioDemoEntry } from "../lib/library";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { EmptyState, MetricInfo } from "../components/primitives";

export interface TournamentDashboardViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
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
  onGoLibrary,
  identityOptions,
  teamRenames = {}
}: TournamentDashboardViewProps) {
  const [insights, setInsights] = useState<TournamentInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entries.length === 0) {
      setInsights(null);
      return;
    }
    let cancelled = false;
    setInsights(null);
    setError(null);
    getTournamentInsights(entries, identityOptions)
      .then((result) => {
        if (!cancelled) setInsights(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries, identityOptions?.version]);  // eslint-disable-line react-hooks/exhaustive-deps

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
          <div className="stu-card">
            <h3>队伍手枪局</h3>
            <table className="stu-mini-table">
              <thead>
                <tr>
                  <th>队伍</th>
                  <th className="stu-num">手枪胜率</th>
                  <th className="stu-num">第二局转化</th>
                  <th className="stu-num">反转换<MetricInfo note="对手赢手枪局后，该队赢了下一回合（次局）的比率" /></th>
                </tr>
              </thead>
              <tbody>
                {insights.teamPistols.map((row) => (
                  <tr key={row.teamName}>
                    <td>{row.teamName}</td>
                    <td className="stu-num">
                      {formatPercent(row.winRatePercent)} ({row.pistolWins}/{row.pistolRounds})
                    </td>
                    <td className="stu-num">
                      {formatPercent(row.conversionPercent)} ({row.conversionWins}/{row.conversionRounds})
                    </td>
                    <td className="stu-num" title="对手赢手枪局后，该队赢了下一回合的次数 / 机会数">
                      {formatPercent(row.breakRatePercent)} ({row.breakWins}/{row.breakRounds})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stu-card">
            <h3>经济对位胜率（按高低经济，非手枪局）</h3>
            <table className="stu-mini-table">
              <thead>
                <tr>
                  <th>低经济方</th>
                  <th>高经济方</th>
                  <th className="stu-num">样本</th>
                  <th className="stu-num">低经济方胜率<MetricInfo note="同档对局对称，不出胜率" /></th>
                </tr>
              </thead>
              <tbody>
                {insights.economyMatrix.slice(0, 12).map((row) => (
                  <tr key={`${row.lowEconomy}-${row.highEconomy}`} className={row.rounds < 5 ? "stu-row-muted" : undefined}>
                    <td>{row.lowEconomy}</td>
                    <td>{row.highEconomy}</td>
                    <td className="stu-num">{row.rounds}</td>
                    <td className="stu-num">{formatPercent(row.lowWinRatePercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stu-card">
            <h3>Eco / Semi 翻盘</h3>
            <table className="stu-mini-table">
              <thead>
                <tr>
                  <th>队伍</th>
                  <th className="stu-num">翻盘</th>
                  <th className="stu-num">机会</th>
                  <th className="stu-num">胜率</th>
                </tr>
              </thead>
              <tbody>
                {insights.ecoUpsets.slice(0, 8).map((row) => (
                  <tr key={row.teamName}>
                    <td>{row.teamName}</td>
                    <td className="stu-num">{row.wins}</td>
                    <td className="stu-num">{row.opportunities}</td>
                    <td className="stu-num">{formatPercent(row.winRatePercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
