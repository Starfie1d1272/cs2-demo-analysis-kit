import { useCapabilityBlocked } from "../components/CapabilityBar";
import { canExportSnapshot } from "../lib/analysis-export";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../lib/queries/query-cache";
import { AnalysisExportButtons } from "../components/AnalysisExportButtons";
import { buildUtilityAnalysisResult } from "../lib/analysis-export-utility";
import type { AnalysisExportSource } from "../lib/analysis-export";
import { flushSync } from "react-dom";
import { STUDIO_TABLE_CLASSES } from "../components/table-styles";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  findingFromUtilityDamage,
  findingFromUtilityFlash,
  type UtilityDamageEvidence,
  type UtilityValueRow,
  type UtilityValueSummary,
} from "@cs2dak/analytics";
import { DataTable, EmptyState, MetricInfo, type DataTableColumn } from "@cs2dak/react";
import { getSeasonSummary } from "../lib/queries/season-queries";
import { getUtilityValueSummary } from "../lib/queries/utility-queries";
import { type IdentityOptions } from "../lib/identity";
import { formatMatchLabel, matchIdForEntry, type StudioDemoEntry } from "../lib/demo-entry";
import { EvidenceActions } from "../components/EvidenceActions";
import type { OpenEvidence } from "../lib/evidence-continuation";
import { projectUtilityPlayer } from "../lib/analysis-view-projections";

export interface UtilityViewProps {
  exportSource?: AnalysisExportSource | null;
  state: import("../lib/studio-page-state").UtilityPageState;
  onStateChange: (state: import("../lib/studio-page-state").UtilityPageState) => void;
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  selectedTeams: string[];
  playerFocus: { playerKey: string; steamIds: readonly string[] } | null;
  onGoLineups: () => void;
  onOpenEvidence: OpenEvidence;
  onPageReady?: (keys: string[]) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
}

type BestFlash = UtilityValueSummary["bestFlashes"][number];

const fmt = (value: number | null, digits = 2, suffix = "") => value == null ? "—" : `${value.toFixed(digits)}${suffix}`;

const HE_COLUMNS: DataTableColumn<UtilityValueRow>[] = [
  { key: "name", label: "对象", format: (r) => r.name },
  { key: "rounds", label: "回合", numeric: true, sortable: true, sortValue: (r) => r.rounds, format: (r) => r.rounds },
  { key: "heThrows", label: "HE 数", numeric: true, sortable: true, sortValue: (r) => r.heThrows, format: (r) => r.heThrows },
  {
    key: "heDamagePerThrow",
    label: <>HE 伤害/颗<MetricInfo note="HE 手雷造成的敌方有效生命伤害 / HE 投掷数；用于看谁的雷更疼、更准。" /></>,
    numeric: true,
    sortable: true,
    sortValue: (r) => r.heDamagePerThrow,
    format: (r) => fmt(r.heDamagePerThrow, 2)
  },
  { key: "heDamagePerRound", label: "HE 伤害/回合", numeric: true, sortable: true, sortValue: (r) => r.heDamagePerRound, format: (r) => fmt(r.heDamagePerRound, 2) },
  { key: "heDamage", label: "HE 总伤害", numeric: true, sortable: true, sortValue: (r) => r.heDamage, format: (r) => r.heDamage },
];

const FIRE_COLUMNS: DataTableColumn<UtilityValueRow>[] = [
  { key: "name", label: "对象", format: (r) => r.name },
  { key: "rounds", label: "回合", numeric: true, sortable: true, sortValue: (r) => r.rounds, format: (r) => r.rounds },
  { key: "fireThrows", label: "火数", numeric: true, sortable: true, sortValue: (r) => r.fireThrows, format: (r) => r.fireThrows },
  {
    key: "fireDamagePerThrow",
    label: <>火焰伤害/颗<MetricInfo note="燃烧弹/燃烧瓶造成的敌方有效生命伤害 / 火投掷数；用于看谁的火更疼、更准。" /></>,
    numeric: true,
    sortable: true,
    sortValue: (r) => r.fireDamagePerThrow,
    format: (r) => fmt(r.fireDamagePerThrow, 2)
  },
  { key: "fireDamagePerRound", label: "火焰伤害/回合", numeric: true, sortable: true, sortValue: (r) => r.fireDamagePerRound, format: (r) => fmt(r.fireDamagePerRound, 2) },
  { key: "fireDamage", label: "火焰总伤害", numeric: true, sortable: true, sortValue: (r) => r.fireDamage, format: (r) => r.fireDamage },
];

const FLASH_COLUMNS: DataTableColumn<UtilityValueRow>[] = [
  { key: "name", label: "对象", format: (r) => r.name },
  { key: "rounds", label: "回合", numeric: true, sortable: true, sortValue: (r) => r.rounds, format: (r) => r.rounds },
  { key: "flashesThrown", label: "闪光数", numeric: true, sortable: true, sortValue: (r) => r.flashesThrown, format: (r) => r.flashesThrown },
  {
    key: "enemyBlindSecondsPerRound",
    label: <>闪光时间/回合<MetricInfo note="闪光造成的敌方致盲秒数 / 回合数；不把队友短暂被白作为主指标。" /></>,
    numeric: true,
    sortable: true,
    sortValue: (r) => r.enemyBlindSecondsPerRound,
    format: (r) => fmt(r.enemyBlindSecondsPerRound, 2, "s")
  },
  {
    key: "enemyBlindSecondsPerFlash",
    label: <>闪光时间/颗<MetricInfo note="闪光造成的敌方致盲秒数 / 闪光投掷数。" /></>,
    numeric: true,
    sortable: true,
    sortValue: (r) => r.enemyBlindSecondsPerFlash,
    format: (r) => fmt(r.enemyBlindSecondsPerFlash, 2, "s")
  },
  { key: "flashAssistsPerRound", label: "闪光助攻/回合", numeric: true, sortable: true, sortValue: (r) => r.flashAssistsPerRound, format: (r) => fmt(r.flashAssistsPerRound, 3) },
];

const SMOKE_COLUMNS: DataTableColumn<UtilityValueRow>[] = [
  { key: "name", label: "对象", format: (r) => r.name },
  { key: "rounds", label: "回合", numeric: true, sortable: true, sortValue: (r) => r.rounds, format: (r) => r.rounds },
  { key: "smokesThrown", label: "烟数", numeric: true, sortable: true, sortValue: (r) => r.smokesThrown, format: (r) => r.smokesThrown },
  { key: "smokesPerRound", label: "烟/回合", numeric: true, sortable: true, sortValue: (r) => r.smokesPerRound, format: (r) => fmt(r.smokesPerRound, 3) },
];

export function UtilityView({ exportSource, state, onStateChange, playerFocus, onGoLineups, allEntries, entries, selectedTeams, onOpenEvidence, onWatchDemo, onGoLibrary, identityOptions, onPageReady }: UtilityViewProps) {
  const blocked = useCapabilityBlocked();
  const [snapshot, setSnapshot] = useState<{ key: string; generation: number; value: UtilityValueSummary | null } | null>(null);
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const requestKey = JSON.stringify([entries.map(entry => entry.id), selectedTeams, identityOptions?.version]);
  const summary = snapshot?.key === requestKey ? snapshot.value : null;
  const [error, setError] = useState<string | null>(null);
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);

  useEffect(() => {
    if (!onPageReady || (!summary && !error && entries.length > 0)) return;
    onPageReady(Array.from(document.querySelectorAll<HTMLElement>("[id]"), node => node.id));
  }, [onPageReady, summary, error, entries.length]);

  useEffect(() => {
    if (entries.length === 0) {
      return;
    }
    if (analysis.status !== "ready") return;
    let cancelled = false;
    setError(null);
    getSeasonSummary(entries, identityOptions, selectedTeams)
      .then((season) => getUtilityValueSummary(
        entries,
        season.profiles.map((profile) => ({
          playerKey: profile.playerKey,
          name: profile.name,
          steamIds: profile.steamIds,
        })),
        identityOptions,
        selectedTeams,
      ))
      .then((next) => {
        if (!cancelled) { assertAnalysisGeneration(analysis.generation); setSnapshot({ key: requestKey, generation: analysis.generation, value: next }); }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [entries, identityOptions?.version, selectedTeams, requestKey, analysis]);

  const visibleSummary = useMemo(() => summary && playerFocus ? projectUtilityPlayer(summary, playerFocus.steamIds.length ? playerFocus.playerKey : "") : summary, [summary, playerFocus]);
  const openEvidence: OpenEvidence = request => { flushSync(() => onStateChange({ ...state, selectedEvidenceKey: request.sourceKey ?? null })); onOpenEvidence(request); };

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有道具数据"
          hint="先导入 demo，再查看闪光、HE、火和烟的跨场价值。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>道具价值</h1>
          {visibleSummary && exportSource && (!playerFocus || playerFocus.steamIds.length > 0) && !error && canExportSnapshot(snapshot, analysis) && <AnalysisExportButtons capture={() => buildUtilityAnalysisResult(exportSource, visibleSummary, state, { he: HE_COLUMNS, fire: FIRE_COLUMNS, flash: FLASH_COLUMNS, smoke: SMOKE_COLUMNS })} />}
          <p>按回合和投掷数归一：闪光看敌方致盲时间，HE/火看敌方伤害，烟只看每回合投入；不把关联数据表述为对胜负的因果贡献。</p>
          <button type="button" className="stu-button-sm" onClick={onGoLineups}>查看道具点位</button>
          {playerFocus && <p>选手行与具备身份的候选按焦点筛选；队伍榜显示比赛范围内的队伍上下文。{playerFocus.steamIds.length === 0 && "无法解析该选手的身份。"}</p>}
        </div>
      </header>
      {summary && (error || analysis.status !== "ready" || snapshot?.generation !== analysis.generation) && <p className="stu-muted" role="status">{error || analysis.status === "error" ? "更新失败，显示旧版本结果。" : "正在更新，显示旧版本结果。"}</p>}
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && !summary && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的道具数据…</div>}
      {!error && entries.length === 0 && <div className="stu-compact-empty"><EmptyState variant="insufficient" title={blocked === "error" ? "分析数据暂不可用" : blocked ? "当前范围暂无可用比赛" : "聚合范围为空"} hint={blocked === "error" ? "请重试或查看上方状态。" : blocked ? "请查看上方原因和操作。" : "请调整聚合范围。"} /></div>}
      {visibleSummary && (
        <div className="stu-utility-stack">
          <UtilitySection
            title="HE 伤害"
            player={<UtilityTable tableState={state.tables.hePlayers} onTableStateChange={table => onStateChange({ ...state, tables: { ...state.tables, hePlayers: table } })} title="选手榜" rows={visibleSummary.players.filter((row) => row.heThrows > 0)} columns={HE_COLUMNS} initialSortKey="heDamagePerThrow" empty="当前范围内没有 HE 手雷伤害数据。" pageSize={10} />}
            team={<UtilityTable tableState={state.tables.heTeams} onTableStateChange={table => onStateChange({ ...state, tables: { ...state.tables, heTeams: table } })} title="队伍榜" rows={visibleSummary.teams.filter((row) => row.heThrows > 0)} columns={HE_COLUMNS} initialSortKey="heDamagePerThrow" empty="当前范围内没有队伍 HE 手雷伤害数据。" pageSize={10} />}
          />
          <UtilitySection
            title="火焰伤害"
            player={<UtilityTable tableState={state.tables.firePlayers} onTableStateChange={table => onStateChange({ ...state, tables: { ...state.tables, firePlayers: table } })} title="选手榜" rows={visibleSummary.players.filter((row) => row.fireThrows > 0)} columns={FIRE_COLUMNS} initialSortKey="fireDamagePerThrow" empty="当前范围内没有火伤害数据。" pageSize={10} />}
            team={<UtilityTable tableState={state.tables.fireTeams} onTableStateChange={table => onStateChange({ ...state, tables: { ...state.tables, fireTeams: table } })} title="队伍榜" rows={visibleSummary.teams.filter((row) => row.fireThrows > 0)} columns={FIRE_COLUMNS} initialSortKey="fireDamagePerThrow" empty="当前范围内没有队伍火伤害数据。" pageSize={10} />}
          />
          <UtilitySection
            title="闪光"
            player={<UtilityTable tableState={state.tables.flashPlayers} onTableStateChange={table => onStateChange({ ...state, tables: { ...state.tables, flashPlayers: table } })} title="选手榜" rows={visibleSummary.players.filter((row) => row.flashesThrown > 0)} columns={FLASH_COLUMNS} initialSortKey="enemyBlindSecondsPerRound" empty="当前范围内没有闪光数据。" pageSize={10} />}
            team={<UtilityTable tableState={state.tables.flashTeams} onTableStateChange={table => onStateChange({ ...state, tables: { ...state.tables, flashTeams: table } })} title="队伍榜" rows={visibleSummary.teams.filter((row) => row.flashesThrown > 0)} columns={FLASH_COLUMNS} initialSortKey="enemyBlindSecondsPerRound" empty="当前范围内没有队伍闪光数据。" pageSize={10} />}
          />
          <UtilitySection
            title="烟雾"
            player={<UtilityTable tableState={state.tables.smokePlayers} onTableStateChange={table => onStateChange({ ...state, tables: { ...state.tables, smokePlayers: table } })} title="选手榜" rows={visibleSummary.players.filter((row) => row.smokesThrown > 0)} columns={SMOKE_COLUMNS} initialSortKey="smokesPerRound" empty="当前范围内没有烟雾数据。" pageSize={10} />}
            team={<UtilityTable tableState={state.tables.smokeTeams} onTableStateChange={table => onStateChange({ ...state, tables: { ...state.tables, smokeTeams: table } })} title="队伍榜" rows={visibleSummary.teams.filter((row) => row.smokesThrown > 0)} columns={SMOKE_COLUMNS} initialSortKey="smokesPerRound" empty="当前范围内没有队伍烟雾数据。" pageSize={10} />}
          />
          <BestFlashList flashes={visibleSummary.bestFlashes.slice(0, 12)} entryByMatchId={entryByMatchId} onOpenEvidence={openEvidence} onWatchDemo={onWatchDemo} />
          <DamageEvidenceList rows={visibleSummary.bestDamageRounds} entryByMatchId={entryByMatchId} onOpenEvidence={openEvidence} onWatchDemo={onWatchDemo} />
        </div>
      )}
    </div>
  );
}

function UtilitySection({ title, player, team }: { title: string; player: ReactNode; team: ReactNode }) {
  return (
    <section className="stu-card stu-utility-section">
      <h3>{title}</h3>
      <div className="stu-utility-grid">
        {player}
        {team}
      </div>
    </section>
  );
}

function UtilityTable({ title, rows, columns, initialSortKey, empty, pageSize, tableState, onTableStateChange }: {
  tableState?: import("@cs2dak/presentation").TableState;
  onTableStateChange: (state: import("@cs2dak/presentation").TableState) => void;
  title: string;
  rows: UtilityValueRow[];
  columns: DataTableColumn<UtilityValueRow>[];
  initialSortKey: string;
  empty: string;
  pageSize: number;
}) {
  const effectiveState = tableState ?? { sort: { key: initialSortKey, direction: "desc" as const }, page: 0 };
  if (rows.length === 0) {
    return <EmptyState variant="insufficient" title={title} hint={empty} />;
  }
  return (
    <div className="stu-utility-table">
      <h4>{title}</h4>
      <div className="stu-table-scroll">
        <DataTable
          classes={STUDIO_TABLE_CLASSES}
          rows={rows}
          rowKey={(r) => r.id}
          state={effectiveState} onStateChange={onTableStateChange}
          pageSize={pageSize}
          paginationInfo={(total) => `${total} 项`}
          showRank
          columns={columns}
        />
      </div>
    </div>
  );
}

function BestFlashList({ flashes, entryByMatchId, onOpenEvidence, onWatchDemo }: {
  flashes: BestFlash[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenEvidence: UtilityViewProps["onOpenEvidence"];
  onWatchDemo?: UtilityViewProps["onWatchDemo"];
}) {
  if (flashes.length === 0) return null;
  const queue = flashes.flatMap((flash, index) => {
    const entry = entryByMatchId.get(flash.matchId);
    const key = `utility:flash:${flash.matchId}:${flash.roundNumber}:${flash.tick ?? ""}:${index}`;
    return entry ? [{ key, entryId: entry.id, evidence: { matchId: flash.matchId, roundNumber: flash.roundNumber, tick: flash.tick, reason: flash.reason, role: "example" as const } }] : [];
  });
  return (
    <div className="stu-card">
      <h3>闪光候选</h3>
      <p className="stu-muted">展示部分最佳候选，按单颗闪造成的敌方致盲时间排序；队友短暂被白作为参考，不进入主榜。</p>
      <div className="stu-evidence-list">
        {flashes.map((flash, index) => {
          const entry = entryByMatchId.get(flash.matchId);
          const teamFlashNote = flash.teamSeconds >= 1 ? ` · 队友致盲参考 ${flash.teamSeconds.toFixed(1)}s` : "";
          return (
            <EvidenceActions
              key={`${flash.matchId}-${flash.roundNumber}-${index}`}
              entry={entry}
              target={{ roundNumber: flash.roundNumber, tick: flash.tick }}

              onOpenEvidence={request => onOpenEvidence({ ...request, queue, selectedKey: request.sourceKey })}
              onWatchDemo={onWatchDemo}
              reason={flash.reason}
              sourceKey={`utility:flash:${flash.matchId}:${flash.roundNumber}:${flash.tick ?? ""}:${index}`}
              finding={findingFromUtilityFlash(flash)}
            >
              {flash.playerName} · {entry ? formatMatchLabel(entry) : flash.matchId} · R{flash.roundNumber} · {flash.victimCount} 人 · 闪光时间 {flash.enemySeconds.toFixed(1)}s{teamFlashNote}
            </EvidenceActions>
          );
        })}
      </div>
    </div>
  );
}

function DamageEvidenceList({ rows, entryByMatchId, onOpenEvidence, onWatchDemo }: {
  rows: UtilityDamageEvidence[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenEvidence: UtilityViewProps["onOpenEvidence"];
  onWatchDemo?: UtilityViewProps["onWatchDemo"];
}) {
  if (rows.length === 0) return null;
  const queue = rows.flatMap((row, index) => {
    const entry = entryByMatchId.get(row.matchId);
    const key = `utility:damage:${row.matchId}:${row.roundNumber}:${index}`;
    return entry ? [{ key, entryId: entry.id, evidence: { matchId: row.matchId, roundNumber: row.roundNumber, tick: row.tick, reason: row.reason, role: "example" as const } }] : [];
  });
  return (
    <div className="stu-card">
      <h3>伤害回合候选</h3>
      <p className="stu-muted">展示部分最佳伤害回合候选。</p>
      <div className="stu-evidence-list">
        {rows.map((row, index) => {
          const entry = entryByMatchId.get(row.matchId);
          return (
            <EvidenceActions
              key={`${row.kind}-${row.matchId}-${row.roundNumber}-${index}`}
              entry={entry}
              target={{ roundNumber: row.roundNumber, tick: row.tick }}

              onOpenEvidence={request => onOpenEvidence({ ...request, queue, selectedKey: request.sourceKey })}
              onWatchDemo={onWatchDemo}
              reason={row.reason}
              sourceKey={`utility:damage:${row.matchId}:${row.roundNumber}:${index}`}
              finding={findingFromUtilityDamage(row)}
            >
              {row.playerName} · {row.kind === "he" ? "HE 手雷" : "火焰"} · {entry ? formatMatchLabel(entry) : row.matchId} · R{row.roundNumber} · {row.victimCount} 人 · {row.damage} 伤害
            </EvidenceActions>
          );
        })}
      </div>
    </div>
  );
}
