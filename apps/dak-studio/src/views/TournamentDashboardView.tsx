import { useEffect, useMemo, useState } from "react";
import {
  buildTournamentInsights,
  type SeasonInsightsDemo,
  type TournamentInsights
} from "@cs2dak/presentation";
import { getSeasonData } from "../lib/season";
import type { StudioDemoEntry } from "../lib/library";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";

export interface TournamentDashboardViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  onGoLibrary: () => void;
}

/** v0.3 赛事总览：地图使用率、T/CT 胜率、手枪局与转化（cohort 同源聚合）。 */
export function TournamentDashboardView({
  allEntries,
  entries,
  scope,
  onScopeChange,
  onGoLibrary
}: TournamentDashboardViewProps) {
  const [demos, setDemos] = useState<SeasonInsightsDemo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entries.length === 0) {
      setDemos(null);
      return;
    }
    let cancelled = false;
    setDemos(null);
    setError(null);
    getSeasonData(entries)
      .then((data) => {
        if (!cancelled) setDemos(data.demos);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  const insights = useMemo<TournamentInsights | null>(
    () => (demos && demos.length > 0 ? buildTournamentInsights(demos) : null),
    [demos]
  );

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <div className="stu-empty">
          <div className="stu-empty-mark">⌖</div>
          <h2>还没有赛事数据</h2>
          <p>赛事总览由资料库内 demo 聚合而成，先导入比赛。</p>
          <button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>
        </div>
      </div>
    );
  }

  const scopePanel = <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} />;

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>赛事总览</h1>
          <p>当前聚合范围内的地图使用与攻防节奏。最佳选手榜见「排行榜」子页。</p>
        </div>
      </header>
      {scopePanel}
      {error && <div className="stu-empty"><h2>聚合失败</h2><p>{error}</p></div>}
      {!error && !insights && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo…</div>}
      {!error && entries.length === 0 && <div className="stu-empty"><h2>聚合范围为空</h2><p>请调整聚合范围。</p></div>}
      {insights && (
        <>
          <div className="stu-metric-grid stu-card">
            <div className="stu-metric"><span>比赛场次</span><b>{insights.matchCount}</b></div>
            <div className="stu-metric"><span>总回合</span><b>{insights.roundCount}</b></div>
            <div className="stu-metric"><span>T 胜率</span><b>{insights.tWinRatePercent.toFixed(1)}%</b></div>
            <div className="stu-metric"><span>CT 胜率</span><b>{insights.ctWinRatePercent.toFixed(1)}%</b></div>
            <div className="stu-metric" title="赢下手枪局后把下一回合也拿下的比率">
              <span>手枪局转化</span>
              <b>{insights.pistolConversionPercent == null ? "—" : `${insights.pistolConversionPercent.toFixed(1)}%`}</b>
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
                    <td className="stu-num">{row.pistolTWinRatePercent == null ? "—" : `${row.pistolTWinRatePercent.toFixed(1)}%`}</td>
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
