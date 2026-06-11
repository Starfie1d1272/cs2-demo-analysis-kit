import { useEffect, useState } from "react";
import { formatPercent, type TournamentInsights } from "@cs2dak/presentation";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { getSeasonSummary } from "../lib/season";
import type { StudioDemoEntry } from "../lib/library";

export interface EconomyViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  onGoLibrary: () => void;
}

export function EconomyView({ allEntries, entries, scope, onScopeChange, onGoLibrary }: EconomyViewProps) {
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
    getSeasonSummary(entries)
      .then((summary) => {
        if (!cancelled) setInsights(summary.insights);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <div className="stu-empty">
          <h2>还没有经济数据</h2>
          <p>先导入 demo，再查看经济矩阵、手枪转化和 eco 翻盘。</p>
          <button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>经济与节奏</h1>
          <p>跨场经济类型胜率矩阵、手枪局转化和 eco/semi 对 full 的破局。</p>
        </div>
      </header>
      <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} />
      {error && <div className="stu-empty"><h2>聚合失败</h2><p>{error}</p></div>}
      {!error && !insights && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的经济数据…</div>}
      {!error && entries.length === 0 && <div className="stu-empty"><h2>聚合范围为空</h2><p>请调整聚合范围。</p></div>}
      {insights && (
        <>
          <div className="stu-card">
            <h3>经济对位胜率（按高低经济，非手枪局）</h3>
            <table className="stu-mini-table">
              <thead><tr><th>低经济方</th><th>高经济方</th><th className="stu-num">样本</th><th className="stu-num" title="同档对局对称，不出胜率">低经济方胜率</th></tr></thead>
              <tbody>
                {insights.economyMatrix.map((row) => (
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
            <h3>手枪局与第二局</h3>
            <table className="stu-mini-table">
              <thead><tr><th>队伍</th><th className="stu-num">手枪胜率</th><th className="stu-num">转化</th><th className="stu-num" title="对手赢手枪局后，该队赢了下一回合的比率">反转换</th></tr></thead>
              <tbody>
                {insights.teamPistols.map((row) => (
                  <tr key={row.teamName}>
                    <td>{row.teamName}</td>
                    <td className="stu-num">{formatPercent(row.winRatePercent)}</td>
                    <td className="stu-num">{row.conversionPercent == null ? "—" : `${row.conversionPercent.toFixed(1)}%`}</td>
                    <td className="stu-num">{formatPercent(row.breakRatePercent)} ({row.breakWins}/{row.breakRounds})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stu-card">
            <h3>Eco / Semi 翻盘排行</h3>
            <table className="stu-mini-table">
              <thead><tr><th>队伍</th><th className="stu-num">胜场</th><th className="stu-num">机会</th><th className="stu-num">胜率</th></tr></thead>
              <tbody>
                {insights.ecoUpsets.map((row) => (
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
