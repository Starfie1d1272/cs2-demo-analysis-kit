import { useEffect, useState } from "react";
import { formatPercent, type TournamentInsights } from "@cs2dak/presentation";
import type { CohortScopeState } from "../components/CohortScope";
import { DataTable, STUDIO_TABLE_CLASSES, EmptyState, type DataTableColumn, type HeatTone } from "@cs2dak/react";
import { getTournamentInsights, type IdentityOptions } from "../lib/season";
import type { StudioDemoEntry } from "../lib/library";

export interface EconomyViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
}

export function EconomyView({ allEntries, entries, scope, onGoLibrary, identityOptions }: EconomyViewProps) {
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

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有转化数据"
          hint="先导入 demo，再查看手枪转化、人数优势转换和小枪翻盘。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>经济与转化</h1>
          <p>查看手枪转化、5v4/5v3 转化、劣势翻盘和小枪破局。当前结果为描述性聚合，尚不自动生成 Finding。</p>
        </div>
      </header>
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && !insights && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的转化数据…</div>}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
      {insights && (
        <EconomyDashboard insights={insights} />
      )}
    </div>
  );
}

type TeamEconomySummary = TournamentInsights["teamEconomySummaries"][number];
type EconMatrixRow = TournamentInsights["economyMatrix"][number];
type EcoUpsetRow = TournamentInsights["ecoUpsets"][number];

const ECON_MATRIX_COLUMNS: DataTableColumn<EconMatrixRow>[] = [
  { key: "low", label: "低经济方", format: (r) => r.lowEconomy },
  { key: "high", label: "高经济方", format: (r) => r.highEconomy },
  { key: "rounds", label: "样本", numeric: true, format: (r) => r.rounds },
  { key: "rate", label: "低经济方胜率", numeric: true, title: "同档对局对称，不出胜率", format: (r) => formatPercent(r.lowWinRatePercent) },
];

const ECO_UPSET_COLUMNS: DataTableColumn<EcoUpsetRow>[] = [
  { key: "team", label: "队伍", format: (r) => r.teamName },
  { key: "wins", label: "胜场", numeric: true, format: (r) => r.wins },
  { key: "opps", label: "机会", numeric: true, format: (r) => r.opportunities },
  { key: "rate", label: "胜率", numeric: true, format: (r) => formatPercent(r.winRatePercent) },
];

function renderPercentCell(percent: number | null, wins: number, total: number) {
  return <>{formatPercent(percent)}<small className="stu-dim"> {wins}/{total}</small></>;
}

const TEAM_DETAIL_COLUMNS: DataTableColumn<TeamEconomySummary>[] = [
  { key: "team", label: "队伍", format: (t) => t.teamName },
  { key: "maps", label: "Maps", numeric: true, sortable: true, sortValue: (t) => t.maps, format: (t) => t.maps },
  { key: "record", label: "Won - Lost", numeric: true, format: (t) => `${t.roundWins} - ${t.rounds - t.roundWins}` },
  { key: "rw", label: "RW%", title: "回合胜率", numeric: true, sortable: true, sortValue: (t) => t.roundWinPercent, heat: (t) => toneForPercent(t.roundWinPercent), render: (t) => renderPercentCell(t.roundWinPercent, t.roundWins, t.rounds) },
  { key: "pistol", label: "Pistol", title: "手枪局胜率", numeric: true, sortable: true, sortValue: (t) => t.pistol.winRatePercent, heat: (t) => toneForPercent(t.pistol.winRatePercent), render: (t) => renderPercentCell(t.pistol.winRatePercent, t.pistol.wins, t.pistol.rounds) },
  { key: "conv", label: "R2 Conv", title: "R2 Conv", numeric: true, sortable: true, sortValue: (t) => t.round2.conversionPercent, heat: (t) => toneForPercent(t.round2.conversionPercent), render: (t) => renderPercentCell(t.round2.conversionPercent, t.round2.conversionWins, t.round2.conversionRounds) },
  { key: "break", label: "R2 Break", title: "R2 Break", numeric: true, sortable: true, sortValue: (t) => t.round2.breakRatePercent, heat: (t) => toneForPercent(t.round2.breakRatePercent), render: (t) => renderPercentCell(t.round2.breakRatePercent, t.round2.breakWins, t.round2.breakRounds) },
  ...(([[5, 4], [5, 3]] as const)).flatMap(([adv, dis]) => {
    const manFn = (t: TeamEconomySummary) => t.manAdvantage.states.find((s) => s.advantageAlive === adv && s.disadvantageAlive === dis) ?? null;
    return [
      { key: `${adv}v${dis}`, label: `${adv}v${dis}`, title: `${adv}v${dis} 人数优势转化`, numeric: true as const, sortable: true, sortValue: (t: TeamEconomySummary) => manFn(t)?.advantageConversionPercent ?? null, heat: (t: TeamEconomySummary) => toneForPercent(manFn(t)?.advantageConversionPercent ?? null), render: (t: TeamEconomySummary) => { const s = manFn(t); return renderPercentCell(s?.advantageConversionPercent ?? null, s?.advantageWins ?? 0, s?.advantageOpportunities ?? 0); } },
      { key: `${dis}v${adv}`, label: `${dis}v${adv}`, title: `${dis}v${adv} 劣势翻盘`, numeric: true as const, sortable: true, sortValue: (t: TeamEconomySummary) => manFn(t)?.disadvantageConversionPercent ?? null, heat: (t: TeamEconomySummary) => toneForPercent(manFn(t)?.disadvantageConversionPercent ?? null), render: (t: TeamEconomySummary) => { const s = manFn(t); return renderPercentCell(s?.disadvantageConversionPercent ?? null, s?.disadvantageWins ?? 0, s?.disadvantageOpportunities ?? 0); } },
    ];
  }),
  { key: "upset", label: "小枪翻盘", title: "Eco / 半起面对长枪局的胜率", numeric: true, sortable: true, sortValue: (t) => t.smallBuyUpset.winRatePercent, heat: (t) => toneForPercent(t.smallBuyUpset.winRatePercent), render: (t) => renderPercentCell(t.smallBuyUpset.winRatePercent, t.smallBuyUpset.wins, t.smallBuyUpset.opportunities) },
];

function EconomyDashboard({ insights }: { insights: TournamentInsights }) {
  const bestPistol = [...insights.teamPistols].sort((a, b) => (b.winRatePercent ?? -1) - (a.winRatePercent ?? -1))[0] ?? null;
  const bestConversion = [...insights.teamPistols].sort((a, b) => (b.conversionPercent ?? -1) - (a.conversionPercent ?? -1))[0] ?? null;
  const bestBreak = [...insights.teamPistols].sort((a, b) => (b.breakRatePercent ?? -1) - (a.breakRatePercent ?? -1))[0] ?? null;
  const bestRoundWin = [...insights.teamEconomySummaries].sort((a, b) => (b.roundWinPercent ?? -1) - (a.roundWinPercent ?? -1))[0] ?? null;
  const bestSmallBuy = [...insights.teamEconomySummaries].sort((a, b) => (b.smallBuyUpset.winRatePercent ?? -1) - (a.smallBuyUpset.winRatePercent ?? -1))[0] ?? null;
  const best5v4 = bestManState(insights, "advantage", 5, 4);
  const best5v3 = bestManState(insights, "advantage", 5, 3);
  const best4v5 = bestManState(insights, "disadvantage", 5, 4);
  const best3v5 = bestManState(insights, "disadvantage", 5, 3);
  const pistolConversion = aggregatePistolConversion(insights);
  const pistolBreak = aggregatePistolBreak(insights);

  return (
    <div className="stu-econ-dashboard">
      <section className="stu-econ-hero">
        <MetricCard label="回合样本" value={String(insights.roundCount)} detail={`${insights.matchCount} 场 demo`} />
        <MetricCard label="手枪转化" value={formatPercent(insights.pistolConversionPercent)} detail="赢手枪后的下一回合" tone={toneForPercent(insights.pistolConversionPercent)} />
        <MetricCard label="5v4 转化" value={best5v4 ? formatPercent(best5v4.value) : "—"} detail={best5v4 ? `${best5v4.teamName} · ${best5v4.wins}/${best5v4.total}` : "无样本"} tone={toneForPercent(best5v4?.value ?? null)} />
        <MetricCard label="5v3 转化" value={best5v3 ? formatPercent(best5v3.value) : "—"} detail={best5v3 ? `${best5v3.teamName} · ${best5v3.wins}/${best5v3.total}` : "无样本"} tone={toneForPercent(best5v3?.value ?? null)} />
        <MetricCard label="4v5 翻盘" value={best4v5 ? formatPercent(best4v5.value) : "—"} detail={best4v5 ? `${best4v5.teamName} · ${best4v5.wins}/${best4v5.total}` : "无样本"} tone={toneForPercent(best4v5?.value ?? null)} />
        <MetricCard label="小枪翻盘" value={bestSmallBuy ? formatPercent(bestSmallBuy.smallBuyUpset.winRatePercent) : "—"} detail={bestSmallBuy ? `${bestSmallBuy.teamName} · ${bestSmallBuy.smallBuyUpset.wins}/${bestSmallBuy.smallBuyUpset.opportunities}` : "无样本"} tone={toneForPercent(bestSmallBuy?.smallBuyUpset.winRatePercent ?? null)} title="Eco / 半起面对长枪局的胜率" />
      </section>

      <section className="stu-econ-grid">
        <article className="stu-card stu-econ-card">
          <h3>优势转换与翻盘</h3>
          <div className="stu-econ-state-grid">
            <div className="stu-econ-state">
              <div>
                <span>R2 Conv</span>
                <b>{formatPercent(insights.pistolConversionPercent)}</b>
                <small>{pistolConversion.wins}/{pistolConversion.total} 手枪转化</small>
              </div>
              <div>
                <span>R2 Break</span>
                <b>{formatPercent(pistolBreak.percent)}</b>
                <small>{pistolBreak.wins}/{pistolBreak.total} 反转换</small>
              </div>
            </div>
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
          <h3>当前样本对照</h3>
          <div className="stu-econ-callouts">
            <Callout label="最高回合胜率" value={bestRoundWin?.teamName ?? "—"} detail={bestRoundWin ? `${formatPercent(bestRoundWin.roundWinPercent)} · ${bestRoundWin.roundWins}/${bestRoundWin.rounds}` : "无样本"} />
            <Callout label="最高手枪局胜率" value={bestPistol?.teamName ?? "—"} detail={bestPistol ? `${formatPercent(bestPistol.winRatePercent)} · ${bestPistol.pistolWins}/${bestPistol.pistolRounds}` : "无样本"} />
            <Callout label="最高 R2 转化率" value={bestConversion?.teamName ?? "—"} detail={bestConversion ? `${formatPercent(bestConversion.conversionPercent)} · ${bestConversion.conversionWins}/${bestConversion.conversionRounds}` : "无样本"} />
            <Callout label="最高 R2 反转换率" value={bestBreak?.teamName ?? "—"} detail={bestBreak ? `${formatPercent(bestBreak.breakRatePercent)} · ${bestBreak.breakWins}/${bestBreak.breakRounds}` : "无样本"} />
            <Callout label="最高 5v4 转化率" value={best5v4?.teamName ?? "—"} detail={best5v4 ? `${formatPercent(best5v4.value)} · ${best5v4.wins}/${best5v4.total}` : "无样本"} />
            <Callout label="最高 5v3 转化率" value={best5v3?.teamName ?? "—"} detail={best5v3 ? `${formatPercent(best5v3.value)} · ${best5v3.wins}/${best5v3.total}` : "无样本"} />
            <Callout label="最高 4v5 翻盘率" value={best4v5?.teamName ?? "—"} detail={best4v5 ? `${formatPercent(best4v5.value)} · ${best4v5.wins}/${best4v5.total}` : "无样本"} />
            <Callout label="最高 3v5 翻盘率" value={best3v5?.teamName ?? "—"} detail={best3v5 ? `${formatPercent(best3v5.value)} · ${best3v5.wins}/${best3v5.total}` : "无样本"} />
            <Callout label="最高小枪翻盘率" value={bestSmallBuy?.teamName ?? "—"} detail={bestSmallBuy ? `${formatPercent(bestSmallBuy.smallBuyUpset.winRatePercent)} · ${bestSmallBuy.smallBuyUpset.wins}/${bestSmallBuy.smallBuyUpset.opportunities}` : "无样本"} title="Eco / 半起面对长枪局的胜率" />
          </div>
        </article>

        <article className="stu-card stu-econ-card stu-card-wide">
          <h3>队伍明细矩阵</h3>
          <div className="stu-table-scroll">
            <DataTable
              classes={STUDIO_TABLE_CLASSES}
              rows={insights.teamEconomySummaries}
              rowKey={(t) => t.teamName}
              initialSortKey="rw"
              columns={TEAM_DETAIL_COLUMNS}
            />
          </div>
        </article>

        <article className="stu-card stu-econ-card">
          <h3>经济对位胜率</h3>
          <DataTable
            classes={STUDIO_TABLE_CLASSES}
            rows={insights.economyMatrix}
            rowKey={(r) => `${r.lowEconomy}-${r.highEconomy}`}
            rowClassName={(r) => r.rounds < 5 ? "stu-row-muted" : undefined}
            columns={ECON_MATRIX_COLUMNS}
          />
        </article>

        <article className="stu-card stu-econ-card">
          <h3>小枪翻盘排行</h3>
          <DataTable
            classes={STUDIO_TABLE_CLASSES}
            rows={insights.ecoUpsets}
            rowKey={(r) => r.teamName}
            columns={ECO_UPSET_COLUMNS}
          />
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

function aggregatePistolConversion(insights: TournamentInsights): { wins: number; total: number; percent: number | null } {
  const total = insights.teamPistols.reduce((sum, row) => sum + row.conversionRounds, 0);
  const wins = insights.teamPistols.reduce((sum, row) => sum + row.conversionWins, 0);
  return { wins, total, percent: total > 0 ? (wins / total) * 100 : null };
}

function aggregatePistolBreak(insights: TournamentInsights): { wins: number; total: number; percent: number | null } {
  const total = insights.teamPistols.reduce((sum, row) => sum + row.breakRounds, 0);
  const wins = insights.teamPistols.reduce((sum, row) => sum + row.breakWins, 0);
  return { wins, total, percent: total > 0 ? wins / total * 100 : null };
}

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

function toneForPercent(value: number | null): HeatTone {
  if (value == null) return "neutral";
  if (value >= 65) return "high";
  if (value >= 45) return "mid";
  return "low";
}
