import { useEffect, useMemo, useState } from "react";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { DataTable, STUDIO_TABLE_CLASSES, EmptyState, EvidenceLink, MetricInfo, type DataTableColumn } from "@cs2dak/react";
import { getPlayerFlashSummaries, getSeasonSummary, type IdentityOptions } from "../lib/season";
import { formatMatchLabel, matchDateFromFileName, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
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

type FlashRow = {
  playerKey: string;
  name: string;
  flashesThrown: number;
  enemyBlindSeconds: number;
  teamBlindSeconds: number;
  netSecondsPerFlash: number | null;
};

const FLASH_COLUMNS: DataTableColumn<FlashRow>[] = [
  { key: "name", label: "选手", format: (r) => r.name },
  { key: "flashesThrown", label: "闪光", numeric: true, sortable: true, sortValue: (r) => r.flashesThrown, format: (r) => r.flashesThrown },
  { key: "enemyBlindSeconds", label: "致盲敌方", numeric: true, sortable: true, sortValue: (r) => r.enemyBlindSeconds, format: (r) => `${r.enemyBlindSeconds.toFixed(1)}s` },
  { key: "teamBlindSeconds", label: "致盲队友", numeric: true, sortable: true, sortValue: (r) => r.teamBlindSeconds, format: (r) => `${r.teamBlindSeconds.toFixed(1)}s` },
  { key: "netSecondsPerFlash", label: <>净价值/颗<MetricInfo note="（致盲敌方秒数 − 致盲队友秒数）/ 投掷数；越高越好" /></>, numeric: true, sortable: true, sortValue: (r) => r.netSecondsPerFlash, format: (r) => r.netSecondsPerFlash == null ? "—" : `${r.netSecondsPerFlash.toFixed(2)}s` },
];

export function UtilityView({ allEntries, entries, scope, onScopeChange, onOpenMatch, onGoLibrary, identityOptions, teamRenames = {} }: UtilityViewProps) {
  const [rows, setRows] = useState<FlashRow[] | null>(null);
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
          <DataTable
            classes={STUDIO_TABLE_CLASSES}
            rows={rows}
            rowKey={(r) => r.playerKey}
            initialSortKey="netSecondsPerFlash"
            pageSize={15}
            paginationInfo={(total) => `${total} 人`}
            columns={FLASH_COLUMNS}
          />
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
