import { useMemo, type ReactNode } from "react";
import type { SeriesSummary } from "@cs2dak/contract";
import type { StudioDemoEntry } from "../lib/library";
import { mapDisplayName, sortEntriesByVeto, type StudioSeriesRecord } from "../lib/series";
import { BpView } from "./BpView";

export interface SeriesWorkspaceProps {
  series: StudioSeriesRecord;
  entries: StudioDemoEntry[];
  activeId: string;
  summaryMode: boolean;
  summary: SeriesSummary | null;
  onSelectMap: (entryId: string) => void;
  onShowSummary: () => void;
  children: ReactNode;
}

/** 某地图（de_ 形式）由哪队 pick / 是否决胜图。 */
function pickBadge(series: StudioSeriesRecord, mapName: string): string | null {
  const veto = series.veto;
  if (!veto) return null;
  if (veto.maps.decider === mapName) return "决胜图";
  const picked = veto.maps.picked.find((row) => row.mapName === mapName);
  if (!picked) return null;
  const who = picked.teamKey === "teamA" ? series.teamAName : picked.teamKey === "teamB" ? series.teamBName : null;
  return who ? `${who} PICK` : "PICK";
}

/** 系列比分：按队名统计各图胜负。 */
function seriesScore(entries: StudioDemoEntry[]): { teamA: string; teamB: string; winsA: number; winsB: number } | null {
  const first = entries[0];
  if (!first) return null;
  const teamA = first.meta.teamAName;
  const teamB = first.meta.teamBName;
  let winsA = 0;
  let winsB = 0;
  for (const entry of entries) {
    const a = entry.meta.teamAScore ?? 0;
    const b = entry.meta.teamBScore ?? 0;
    // 各图 teamA/teamB 命名一致（同一系列同两队），按本图归属累计
    const aName = entry.meta.teamAName;
    if (a === b) continue;
    const winnerName = a > b ? aName : entry.meta.teamBName;
    if (winnerName === teamA) winsA += 1;
    else if (winnerName === teamB) winsB += 1;
  }
  return { teamA, teamB, winsA, winsB };
}

export function SeriesWorkspace({
  series,
  entries,
  activeId,
  summaryMode,
  summary,
  onSelectMap,
  onShowSummary,
  children
}: SeriesWorkspaceProps) {
  const score = seriesScore(entries);
  const sortedEntries = useMemo(
    () => series.veto ? sortEntriesByVeto(entries, series.veto) : entries,
    [entries, series.veto]
  );
  return (
    <div className="stu-series">
      <header className="stu-series-head">
        <div className="stu-series-teams">
          <strong>{series.teamAName}</strong>
          {score && <span className="stu-series-score">{score.winsA} : {score.winsB}</span>}
          <strong>{series.teamBName}</strong>
        </div>
        <span className="stu-series-format">{series.format.toUpperCase()}</span>
      </header>

      {series.veto && (
        <details className="stu-series-bp" open>
          <summary>BP 流程</summary>
          <BpView veto={series.veto} />
        </details>
      )}

      <nav className="stu-series-tabs" aria-label="系列赛地图">
        <button
          type="button"
          className={summaryMode ? "stu-series-tab stu-series-tab-active" : "stu-series-tab"}
          onClick={onShowSummary}
        >
          系列汇总
        </button>
        {sortedEntries.map((entry, index) => {
          const badge = pickBadge(series, entry.meta.mapName);
          const active = !summaryMode && entry.id === activeId;
          return (
            <button
              key={entry.id}
              type="button"
              className={active ? "stu-series-tab stu-series-tab-active" : "stu-series-tab"}
              onClick={() => onSelectMap(entry.id)}
            >
              <span className="stu-series-tab-map">M{index + 1} · {mapDisplayName(entry.meta.mapName)}</span>
              <span className="stu-series-tab-score">{entry.meta.teamAScore ?? "—"}:{entry.meta.teamBScore ?? "—"}</span>
              {badge && <span className="stu-series-tab-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>

      {summaryMode ? <SeriesSummaryPanel summary={summary} /> : children}
    </div>
  );
}

function SeriesSummaryPanel({ summary }: { summary: SeriesSummary | null }) {
  if (!summary) return <div className="stu-loading">聚合系列赛各图数据…</div>;
  return (
    <div className="stu-series-summary">
      <div className="stu-card">
        <h3>各图比分</h3>
        <div className="stu-series-maps">
          {summary.maps.map((map) => (
            <div key={map.matchId} className="stu-series-map-row">
              <b>{mapDisplayName(map.mapName)}</b>
              <span>{map.scoreline}</span>
              <small>{map.winnerName ? `${map.winnerName} 胜` : "平"}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="stu-card">
        <h3>跨图记分板（RR 回合加权）</h3>
        <table className="stu-mini-table">
          <thead>
            <tr><th>选手</th><th>队伍</th><th className="stu-num">图</th><th className="stu-num">K</th><th className="stu-num">D</th><th className="stu-num">A</th><th className="stu-num">ADR</th><th className="stu-num">KAST</th><th className="stu-num">RR</th></tr>
          </thead>
          <tbody>
            {summary.scoreboard.map((row) => (
              <tr key={row.playerKey}>
                <td>{row.name}</td>
                <td className="stu-muted">{row.teamName}</td>
                <td className="stu-num">{row.mapCount}</td>
                <td className="stu-num">{row.kills}</td>
                <td className="stu-num">{row.deaths}</td>
                <td className="stu-num">{row.assists}</td>
                <td className="stu-num">{row.adr.toFixed(1)}</td>
                <td className="stu-num">{row.kast.toFixed(1)}</td>
                <td className="stu-num">{row.rivalhubRR.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
