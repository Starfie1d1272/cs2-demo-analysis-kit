import { useEffect, useMemo, useState } from "react";
import type { CohortScopeState } from "../components/CohortScope";
import { DataTable, STUDIO_TABLE_CLASSES, EmptyState, EvidenceLink, MetricInfo, type DataTableColumn } from "@cs2dak/react";
import { getPlayerFlashSummaries, getSeasonSummary, type IdentityOptions } from "../lib/season";
import { formatMatchLabel, matchDateFromFileName, matchIdForEntry, type StudioDemoEntry } from "../lib/library";

export interface UtilityViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
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
  { key: "netSecondsPerFlash", label: <>闪光净收益/颗<MetricInfo note="（致盲敌方秒数 − 致盲队友秒数）/ 投掷数；越高越好" /></>, numeric: true, sortable: true, sortValue: (r) => r.netSecondsPerFlash, format: (r) => r.netSecondsPerFlash == null ? "—" : `${r.netSecondsPerFlash.toFixed(2)}s` },
];

type BestFlash = {
  matchId: string;
  roundNumber: number;
  tick?: number;
  playerName: string;
  victimCount: number;
  enemySeconds: number;
  teamSeconds: number;
  netSeconds: number;
};

export function UtilityView({ allEntries, entries, scope, onOpenMatch, onGoLibrary, identityOptions }: UtilityViewProps) {
  const [rows, setRows] = useState<FlashRow[] | null>(null);
  const [bestFlashes, setBestFlashes] = useState<BestFlash[]>([]);
  const [bestMode, setBestMode] = useState<"net" | "enemy">("net");
  const [incidents, setIncidents] = useState<{
    matchId: string;
    roundNumber: number;
    tick?: number;
    playerName: string;
    victimCount: number;
    totalSeconds: number;
  }[]>([]);
  const [showWorst, setShowWorst] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);

  const sortedBest = useMemo(() => {
    const sorted = [...bestFlashes].sort((a, b) =>
      bestMode === "net" ? b.netSeconds - a.netSeconds : b.enemySeconds - a.enemySeconds
    );
    return sorted.slice(0, 12);
  }, [bestFlashes, bestMode]);

  useEffect(() => {
    if (entries.length === 0) {
      setRows(null);
      setBestFlashes([]);
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
        const nextBest = flashes.flatMap((flash) =>
          (flash.bestEnemyFlashes ?? []).map((incident) => ({
            ...incident,
            playerName: flash.name
          }))
        );
        setRows(nextRows);
        setBestFlashes(nextBest);
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
          title="还没有闪光数据"
          hint="先导入 demo，再查看跨场 Flash Value 与最佳闪光。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>闪光价值</h1>
          <p>跨场闪光收益、最佳闪光与负收益队闪证据，点击证据可回到对应回合/tick。</p>
        </div>
      </header>
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && !rows && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的道具数据…</div>}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
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
      {bestFlashes.length > 0 && (
        <div className="stu-card">
          <div className="stu-card-head">
            <h3>最佳闪光 Top</h3>
            <div className="stu-chip-row" role="tablist" aria-label="最佳闪光排序">
              <button
                type="button"
                role="tab"
                aria-selected={bestMode === "net"}
                className={bestMode === "net" ? "stu-chip stu-chip-active" : "stu-chip"}
                onClick={() => setBestMode("net")}
              >
                净收益最高
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bestMode === "enemy"}
                className={bestMode === "enemy" ? "stu-chip stu-chip-active" : "stu-chip"}
                onClick={() => setBestMode("enemy")}
              >
                致盲最久
              </button>
            </div>
          </div>
          <p className="stu-muted">
            {bestMode === "net"
              ? "单颗闪净收益（致盲敌方秒数 − 同颗误盲队友秒数）最高的闪光。"
              : "不计误盲队友，单颗闪致盲敌方时间最久的闪光。"}
          </p>
          <div className="stu-evidence-list">
            {sortedBest.map((flash, index) => {
              const entry = entryByMatchId.get(flash.matchId);
              const metric = bestMode === "net"
                ? `净 ${flash.netSeconds.toFixed(1)}s（致盲 ${flash.enemySeconds.toFixed(1)}s${flash.teamSeconds > 0 ? ` · 误盲队友 ${flash.teamSeconds.toFixed(1)}s` : ""}）`
                : `致盲 ${flash.enemySeconds.toFixed(1)}s`;
              return (
                <EvidenceLink
                  key={`${flash.matchId}-${flash.roundNumber}-${index}`}
                  disabled={!entry}
                  onOpen={() => entry && onOpenMatch(entry.id, { roundNumber: flash.roundNumber, tick: flash.tick })}
                >
                  {flash.playerName} · {entry ? formatMatchLabel(entry) : flash.matchId} · R{flash.roundNumber} · {flash.victimCount} 人 · {metric}
                </EvidenceLink>
              );
            })}
          </div>
        </div>
      )}
      {incidents.length > 0 && (
        <div className="stu-card">
          <div className="stu-card-head">
            <h3>负收益队闪 Top</h3>
            <button
              type="button"
              className="stu-button stu-button-ghost"
              aria-expanded={showWorst}
              onClick={() => setShowWorst((v) => !v)}
            >
              {showWorst ? "收起" : `展开（${incidents.length}）`}
            </button>
          </div>
          {showWorst && (
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
          )}
        </div>
      )}
    </div>
  );
}
