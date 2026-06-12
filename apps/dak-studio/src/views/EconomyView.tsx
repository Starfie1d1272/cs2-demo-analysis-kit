import { useEffect, useMemo, useState } from "react";
import { formatPercent, type TournamentInsights } from "@cs2dak/presentation";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { EmptyState } from "../components/primitives";
import { getTournamentInsights, type IdentityOptions } from "../lib/season";
import type { StudioDemoEntry } from "../lib/library";

export interface EconomyViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
  teamRenames?: Record<string, string>;
}

export function EconomyView({ allEntries, entries, scope, onScopeChange, onGoLibrary, identityOptions, teamRenames = {} }: EconomyViewProps) {
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
          title="还没有经济数据"
          hint="先导入 demo，再查看经济矩阵、手枪转化和 eco 翻盘。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
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
      <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} teamRenames={teamRenames} />
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && !insights && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的经济数据…</div>}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
      {insights && (
        <EconomyDashboard insights={insights} />
      )}
    </div>
  );
}

function EconomyDashboard({ insights }: { insights: TournamentInsights }) {
  const bestPistol = [...insights.teamPistols].sort((a, b) => (b.winRatePercent ?? -1) - (a.winRatePercent ?? -1))[0] ?? null;
  const bestConversion = [...insights.teamPistols].sort((a, b) => (b.conversionPercent ?? -1) - (a.conversionPercent ?? -1))[0] ?? null;
  const bestBreak = [...insights.teamPistols].sort((a, b) => (b.breakRatePercent ?? -1) - (a.breakRatePercent ?? -1))[0] ?? null;
  const bestSmallBuy = [...insights.teamEconomySummaries].sort((a, b) => (b.smallBuyUpset.winRatePercent ?? -1) - (a.smallBuyUpset.winRatePercent ?? -1))[0] ?? null;
  const best5v4 = bestManState(insights, "advantage", 5, 4);
  const best4v5 = bestManState(insights, "disadvantage", 5, 4);

  return (
    <div className="stu-econ-dashboard">
      <section className="stu-econ-hero">
        <MetricCard label="回合样本" value={String(insights.roundCount)} detail={`${insights.matchCount} 场 demo`} />
        <MetricCard label="T 胜率" value={`${insights.tWinRatePercent.toFixed(1)}%`} detail={`CT ${insights.ctWinRatePercent.toFixed(1)}%`} tone={toneForPercent(insights.tWinRatePercent)} />
        <MetricCard label="手枪转化" value={formatPercent(insights.pistolConversionPercent)} detail="赢手枪后的下一回合" tone={toneForPercent(insights.pistolConversionPercent)} />
        <MetricCard label="小枪破局" value={bestSmallBuy ? formatPercent(bestSmallBuy.smallBuyUpset.winRatePercent) : "—"} detail={bestSmallBuy ? `${bestSmallBuy.teamName} · ${bestSmallBuy.smallBuyUpset.wins}/${bestSmallBuy.smallBuyUpset.opportunities}` : "无样本"} tone={toneForPercent(bestSmallBuy?.smallBuyUpset.winRatePercent ?? null)} title="Eco / 半起面对长枪局的胜率" />
      </section>

      <section className="stu-econ-grid">
        <article className="stu-card stu-econ-card">
          <h3>人数优势转换</h3>
          <div className="stu-econ-state-grid">
            {insights.manAdvantageConversions.map((row) => (
              <div className="stu-econ-state" key={row.advantageLabel}>
                <div>
                  <span>{row.advantageLabel}</span>
                  <b>{formatPercent(row.advantageConversionPercent)}</b>
                  <small>{row.advantageWins}/{row.opportunities} 转化</small>
                </div>
                <div>
                  <span>{row.disadvantageLabel}</span>
                  <b>{formatPercent(row.disadvantageConversionPercent)}</b>
                  <small>{row.disadvantageWins}/{row.opportunities} 翻盘</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="stu-card stu-econ-card">
          <h3>队伍亮点</h3>
          <div className="stu-econ-callouts">
            <Callout label="手枪最稳" value={bestPistol?.teamName ?? "—"} detail={bestPistol ? `${formatPercent(bestPistol.winRatePercent)} · ${bestPistol.pistolWins}/${bestPistol.pistolRounds}` : "无样本"} />
            <Callout label="转化最好" value={bestConversion?.teamName ?? "—"} detail={bestConversion ? `${formatPercent(bestConversion.conversionPercent)} · ${bestConversion.conversionWins}/${bestConversion.conversionRounds}` : "无样本"} />
            <Callout label="反转换最好" value={bestBreak?.teamName ?? "—"} detail={bestBreak ? `${formatPercent(bestBreak.breakRatePercent)} · ${bestBreak.breakWins}/${bestBreak.breakRounds}` : "无样本"} />
            <Callout label="5v4 最稳" value={best5v4?.teamName ?? "—"} detail={best5v4 ? `${formatPercent(best5v4.value)} · ${best5v4.wins}/${best5v4.total}` : "无样本"} />
            <Callout label="4v5 最能翻" value={best4v5?.teamName ?? "—"} detail={best4v5 ? `${formatPercent(best4v5.value)} · ${best4v5.wins}/${best4v5.total}` : "无样本"} />
            <Callout label="小枪破局" value={bestSmallBuy?.teamName ?? "—"} detail={bestSmallBuy ? `${formatPercent(bestSmallBuy.smallBuyUpset.winRatePercent)} · ${bestSmallBuy.smallBuyUpset.wins}/${bestSmallBuy.smallBuyUpset.opportunities}` : "无样本"} title="Eco / 半起面对长枪局的胜率" />
          </div>
        </article>

        <article className="stu-card stu-econ-card stu-card-wide">
          <h3>队伍明细矩阵</h3>
          <TeamDetailMatrix teams={insights.teamEconomySummaries} />
        </article>

        <article className="stu-card stu-econ-card">
          <h3>经济对位胜率</h3>
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
        </article>

        <article className="stu-card stu-econ-card">
          <h3>小枪破局排行</h3>
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
        </article>
      </section>
    </div>
  );
}

function MetricCard({ label, value, detail, tone = "neutral", title }: { label: string; value: string; detail: string; tone?: HeatTone; title?: string }) {
  return (
    <div className={`stu-econ-metric stu-heat-${tone}`} title={title}>
      <span>{label}</span>
      <b>{value}</b>
      <small>{detail}</small>
    </div>
  );
}

function Callout({ label, value, detail, title }: { label: string; value: string; detail: string; title?: string }) {
  return (
    <div className="stu-econ-callout" title={title}>
      <span>{label}</span>
      <b>{value}</b>
      <small>{detail}</small>
    </div>
  );
}

type HeatTone = "high" | "mid" | "low" | "neutral";

function bestManState(
  insights: TournamentInsights,
  mode: "advantage" | "disadvantage",
  advantageAlive: number,
  disadvantageAlive: number
): { teamName: string; value: number | null; wins: number; total: number } | null {
  const candidates = insights.teamEconomySummaries
    .map((team) => {
      const state = team.manAdvantage.states.find(
        (row) => row.advantageAlive === advantageAlive && row.disadvantageAlive === disadvantageAlive
      );
      if (!state) return null;
      return mode === "advantage"
        ? {
            teamName: team.teamName,
            value: state.advantageConversionPercent,
            wins: state.advantageWins,
            total: state.advantageOpportunities
          }
        : {
            teamName: team.teamName,
            value: state.disadvantageConversionPercent,
            wins: state.disadvantageWins,
            total: state.disadvantageOpportunities
          };
    })
    .filter((row): row is { teamName: string; value: number | null; wins: number; total: number } => row != null && row.total > 0);
  return candidates.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.total - a.total)[0] ?? null;
}

function percentWithSample(value: number | null, wins: number, total: number): string {
  return `${formatPercent(value)} (${wins}/${total})`;
}

type TeamEconomySummary = TournamentInsights["teamEconomySummaries"][number];

interface MatrixCell {
  percent: number | null;
  wins: number;
  total: number;
}

interface MatrixColumn {
  key: string;
  label: string;
  title?: string;
  get: (team: TeamEconomySummary) => MatrixCell;
}

function manState(team: TeamEconomySummary, adv: number, dis: number) {
  return team.manAdvantage.states.find((s) => s.advantageAlive === adv && s.disadvantageAlive === dis) ?? null;
}

const MATRIX_COLUMNS: MatrixColumn[] = [
  { key: "rw", label: "RW%", title: "回合胜率", get: (t) => ({ percent: t.roundWinPercent, wins: t.roundWins, total: t.rounds }) },
  { key: "pistol", label: "Pistol", title: "手枪局胜率", get: (t) => ({ percent: t.pistol.winRatePercent, wins: t.pistol.wins, total: t.pistol.rounds }) },
  { key: "conv", label: "R2 Conv", title: "赢手枪局后拿下第二局", get: (t) => ({ percent: t.round2.conversionPercent, wins: t.round2.conversionWins, total: t.round2.conversionRounds }) },
  { key: "break", label: "R2 Break", title: "输手枪局后扳回第二局", get: (t) => ({ percent: t.round2.breakRatePercent, wins: t.round2.breakWins, total: t.round2.breakRounds }) },
  { key: "5v4", label: "5v4", title: "5v4 人数优势转化", get: (t) => { const s = manState(t, 5, 4); return { percent: s?.advantageConversionPercent ?? null, wins: s?.advantageWins ?? 0, total: s?.advantageOpportunities ?? 0 }; } },
  { key: "4v5", label: "4v5", title: "4v5 劣势翻盘", get: (t) => { const s = manState(t, 5, 4); return { percent: s?.disadvantageConversionPercent ?? null, wins: s?.disadvantageWins ?? 0, total: s?.disadvantageOpportunities ?? 0 }; } },
  { key: "5v3", label: "5v3", title: "5v3 人数优势转化", get: (t) => { const s = manState(t, 5, 3); return { percent: s?.advantageConversionPercent ?? null, wins: s?.advantageWins ?? 0, total: s?.advantageOpportunities ?? 0 }; } },
  { key: "3v5", label: "3v5", title: "3v5 劣势翻盘", get: (t) => { const s = manState(t, 5, 3); return { percent: s?.disadvantageConversionPercent ?? null, wins: s?.disadvantageWins ?? 0, total: s?.disadvantageOpportunities ?? 0 }; } },
  { key: "upset", label: "小枪破局", title: "Eco / 半起面对长枪局的胜率", get: (t) => ({ percent: t.smallBuyUpset.winRatePercent, wins: t.smallBuyUpset.wins, total: t.smallBuyUpset.opportunities }) }
];

/** 队伍明细矩阵：点击列头排序（降序），胜率按高低热力着色。 */
function TeamDetailMatrix({ teams }: { teams: TeamEconomySummary[] }) {
  const [sortKey, setSortKey] = useState<string>("rw");
  const sorted = useMemo(() => {
    const col = MATRIX_COLUMNS.find((c) => c.key === sortKey) ?? MATRIX_COLUMNS[0];
    return [...teams].sort((a, b) => {
      const va = col.get(a).percent;
      const vb = col.get(b).percent;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return vb - va;
    });
  }, [teams, sortKey]);

  return (
    <div className="stu-table-scroll">
      <table className="stu-mini-table stu-econ-detail-table">
        <thead>
          <tr>
            <th>队伍</th>
            <th className="stu-num">Maps</th>
            <th className="stu-num">Won - Lost</th>
            {MATRIX_COLUMNS.map((col) => (
              <th key={col.key} className="stu-num" title={col.title}>
                <button
                  type="button"
                  className={col.key === sortKey ? "stu-sort-header stu-sort-header-active" : "stu-sort-header"}
                  onClick={() => setSortKey(col.key)}
                >
                  {col.label}
                  {col.key === sortKey ? " ↓" : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((team) => (
            <tr key={team.teamName}>
              <td>{team.teamName}</td>
              <td className="stu-num">{team.maps}</td>
              <td className="stu-num">{team.roundWins} - {team.rounds - team.roundWins}</td>
              {MATRIX_COLUMNS.map((col) => {
                const cell = col.get(team);
                return (
                  <td key={col.key} className={`stu-num stu-heat-cell stu-heat-${toneForPercent(cell.percent)}`} title={`${cell.wins}/${cell.total}`}>
                    {formatPercent(cell.percent)}
                    <small className="stu-dim"> {cell.wins}/{cell.total}</small>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toneForPercent(value: number | null): HeatTone {
  if (value == null) return "neutral";
  if (value >= 65) return "high";
  if (value >= 45) return "mid";
  return "low";
}
