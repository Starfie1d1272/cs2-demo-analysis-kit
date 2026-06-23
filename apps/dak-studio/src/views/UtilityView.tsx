import { useEffect, useMemo, useState } from "react";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { EmptyState, EvidenceLink, MetricInfo } from "../components/primitives";
import { getPlayerFlashSummaries, getSeasonSummary, type IdentityOptions } from "../lib/season";
import { formatMatchLabel, matchDateFromFileName, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { Pagination } from "../components/Pagination";
import { LineupView } from "./LineupView";

export interface UtilityViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
  teamRenames?: Record<string, string>;
}

export function UtilityView({ allEntries, entries, scope, onScopeChange, onOpenMatch, onGoLibrary, identityOptions, teamRenames = {} }: UtilityViewProps) {
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
  const [sortKey, setSortKey] = useState<"netSecondsPerFlash" | "flashesThrown" | "enemyBlindSeconds" | "teamBlindSeconds">("netSecondsPerFlash");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(0);
  const FLASH_PAGE_SIZE = 15;

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
    setPage(0);
  }

  // ── 排序 + 分页 ──────────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      const dir = sortDesc ? 1 : -1;
      const va = a[sortKey] ?? -999;
      const vb = b[sortKey] ?? -999;
      return (vb - va) * dir;
    });
  }, [rows, sortKey, sortDesc]);

  const flashTotalPages = Math.max(1, Math.ceil(sortedRows.length / FLASH_PAGE_SIZE));
  const flashSafePage = Math.min(page, flashTotalPages - 1);
  const pageRows = sortedRows.slice(flashSafePage * FLASH_PAGE_SIZE, (flashSafePage + 1) * FLASH_PAGE_SIZE);

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
    getSeasonSummary(entries, identityOptions, scope.teams)
      .then(async (summary) => {
        if (cancelled) return;
        const flashes = await getPlayerFlashSummaries(
          entries,
          summary.profiles.map((profile) => ({
            playerKey: profile.playerKey,
            name: profile.name,
            steamIds: profile.steamIds
          })),
          identityOptions,
          scope.teams,
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
  }, [entries, identityOptions?.version, scope.teams]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有道具数据"
          hint="先导入 demo，再查看跨场 Flash Value 与负收益道具。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>道具实验室</h1>
          <p>跨场闪光价值与负收益队闪证据，点击证据可回到对应回合/tick。</p>
        </div>
      </header>
      <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} teamRenames={teamRenames} />
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && !rows && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的道具数据…</div>}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
      {entries.length > 0 && (
        <section>
          <h2 className="stu-section-title">道具点位库</h2>
          <LineupView entries={entries} onOpenMatch={onOpenMatch} />
        </section>
      )}
      {rows && (
        <div className="stu-card">
          <h3>闪光价值排行</h3>
          <Pagination
            page={flashSafePage}
            totalPages={flashTotalPages}
            onChange={setPage}
            info={`${sortedRows.length} 人 · ${flashSafePage + 1}/${flashTotalPages} 页`}
          />
          <table className="stu-mini-table">
            <thead>
              <tr>
                <th>选手</th>
                <th className="stu-num stu-col-sortable" onClick={() => handleSort("flashesThrown")}>
                  闪光{sortKey === "flashesThrown" ? (sortDesc ? " ↓" : " ↑") : ""}
                </th>
                <th className="stu-num stu-col-sortable" onClick={() => handleSort("enemyBlindSeconds")}>
                  致盲敌方{sortKey === "enemyBlindSeconds" ? (sortDesc ? " ↓" : " ↑") : ""}
                </th>
                <th className="stu-num stu-col-sortable" onClick={() => handleSort("teamBlindSeconds")}>
                  致盲队友{sortKey === "teamBlindSeconds" ? (sortDesc ? " ↓" : " ↑") : ""}
                </th>
                <th className="stu-num stu-col-sortable" onClick={() => handleSort("netSecondsPerFlash")}>
                  净价值/颗<MetricInfo note="（致盲敌方秒数 − 致盲队友秒数）/ 投掷数；越高越好" />{sortKey === "netSecondsPerFlash" ? (sortDesc ? " ↓" : " ↑") : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
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
                <EvidenceLink
                  key={`${incident.matchId}-${incident.roundNumber}-${index}`}
                  disabled={!entry}
                  onOpen={() => entry && onOpenMatch(entry.id, { roundNumber: incident.roundNumber, tick: incident.tick })}
                >
                  {incident.playerName} · {entry ? formatMatchLabel(entry) : incident.matchId} · R{incident.roundNumber} · {incident.victimCount} 人 {incident.totalSeconds.toFixed(1)}s
                </EvidenceLink>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
