import { useEffect, useMemo, useState } from "react";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { getPlayerFlashSummaries, getSeasonSummary, type IdentityOptions } from "../lib/season";
import { formatMatchLabel, matchDateFromFileName, matchIdForEntry, type StudioDemoEntry } from "../lib/library";

export interface UtilityViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
}

export function UtilityView({ allEntries, entries, scope, onScopeChange, onOpenMatch, onGoLibrary, identityOptions }: UtilityViewProps) {
  const [rows, setRows] = useState<{
    playerKey: string;
    name: string;
    flashesThrown: number;
    enemyBlindSeconds: number;
    teamBlindSeconds: number;
    netSecondsPerFlash: number | null;
  }[] | null>(null);
  const [incidents, setIncidents] = useState<{
    matchId: string;
    roundNumber: number;
    tick?: number;
    playerName: string;
    victimCount: number;
    totalSeconds: number;
  }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);

  useEffect(() => {
    if (entries.length === 0) {
      setRows(null);
      setIncidents([]);
      return;
    }
    let cancelled = false;
    setRows(null);
    setError(null);
    getSeasonSummary(entries, identityOptions)
      .then(async (summary) => {
        if (cancelled) return;
        const flashes = await getPlayerFlashSummaries(
          entries,
          summary.profiles.map((profile) => ({
            playerKey: profile.playerKey,
            name: profile.name,
            steamIds: profile.steamIds
          }))
        );
        if (cancelled) return;
        const nextRows = flashes.map((flash) => {
          return {
            playerKey: flash.playerKey,
            name: flash.name,
            flashesThrown: flash.flashesThrown,
            enemyBlindSeconds: flash.enemyBlindSeconds,
            teamBlindSeconds: flash.teamBlindSeconds,
            netSecondsPerFlash: flash.netSecondsPerFlash
          };
        }).sort((a, b) => (b.netSecondsPerFlash ?? -999) - (a.netSecondsPerFlash ?? -999));
        const nextIncidents = flashes.flatMap((flash) => {
          return flash.worstTeamFlashes.map((incident) => ({
            ...incident,
            playerName: flash.name
          }));
        }).sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 12);
        setRows(nextRows);
        setIncidents(nextIncidents);
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
        <div className="stu-empty">
          <h2>还没有道具数据</h2>
          <p>先导入 demo，再查看跨场 Flash Value 与负收益道具。</p>
          <button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>道具实验室</h1>
          <p>跨场 Flash Value 与负收益队闪证据，点击证据可回到对应回合/tick。</p>
        </div>
      </header>
      <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} />
      {error && <div className="stu-empty"><h2>聚合失败</h2><p>{error}</p></div>}
      {!error && !rows && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的道具数据…</div>}
      {!error && entries.length === 0 && <div className="stu-empty"><h2>聚合范围为空</h2><p>请调整聚合范围。</p></div>}
      {rows && (
        <div className="stu-card">
          <h3>Flash Value 排行</h3>
          <table className="stu-mini-table">
            <thead><tr><th>选手</th><th className="stu-num">闪光</th><th className="stu-num">致盲敌方</th><th className="stu-num">致盲队友</th><th className="stu-num">净值/颗</th></tr></thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.playerKey}>
                  <td>{row.name}</td>
                  <td className="stu-num">{row.flashesThrown}</td>
                  <td className="stu-num">{row.enemyBlindSeconds.toFixed(1)}s</td>
                  <td className="stu-num">{row.teamBlindSeconds.toFixed(1)}s</td>
                  <td className="stu-num">{row.netSecondsPerFlash == null ? "—" : `${row.netSecondsPerFlash.toFixed(2)}s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {incidents.length > 0 && (
        <div className="stu-card">
          <h3>负收益队闪 Top</h3>
          <div className="stu-evidence-list">
            {incidents.map((incident, index) => {
              const entry = entryByMatchId.get(incident.matchId);
              return (
                <button
                  key={`${incident.matchId}-${incident.roundNumber}-${index}`}
                  type="button"
                  className="stu-evidence"
                  disabled={!entry}
                  onClick={() => entry && onOpenMatch(entry.id, { roundNumber: incident.roundNumber, tick: incident.tick })}
                >
                  {incident.playerName} · {entry ? formatMatchLabel(entry) : incident.matchId} · R{incident.roundNumber} · {incident.victimCount} 人 {incident.totalSeconds.toFixed(1)}s
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
