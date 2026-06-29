import { useEffect, useMemo, useState } from "react";
import type { UtilityDamageEvidence, UtilityValueRow, UtilityValueSummary } from "@cs2dak/presentation";
import type { CohortScopeState } from "../components/CohortScope";
import { DataTable, EmptyState, EvidenceLink, MetricInfo, STUDIO_TABLE_CLASSES, type DataTableColumn } from "@cs2dak/react";
import { getSeasonSummary, getUtilityValueSummary, type IdentityOptions } from "../lib/season";
import { formatMatchLabel, matchIdForEntry, type StudioDemoEntry } from "../lib/library";

export interface UtilityViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
}

type BestFlash = UtilityValueSummary["bestFlashes"][number];
type DamageMode = "perThrow" | "perRound";

const fmt = (value: number | null, digits = 2, suffix = "") => value == null ? "—" : `${value.toFixed(digits)}${suffix}`;

function orderColumns(columns: DataTableColumn<UtilityValueRow>[], order: string[]) {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  return order.map((key) => byKey.get(key)).filter((column): column is DataTableColumn<UtilityValueRow> => column != null);
}

const HE_COLUMNS: DataTableColumn<UtilityValueRow>[] = [
  { key: "name", label: "对象", format: (r) => r.name },
  { key: "rounds", label: "回合", numeric: true, sortable: true, sortValue: (r) => r.rounds, format: (r) => r.rounds },
  { key: "heThrows", label: "HE 数", numeric: true, sortable: true, sortValue: (r) => r.heThrows, format: (r) => r.heThrows },
  {
    key: "heDamagePerThrow",
    label: <>HE/颗<MetricInfo note="HE 手雷造成的敌方有效生命伤害 / HE 投掷数；用于看谁的雷更疼、更准。" /></>,
    numeric: true,
    sortable: true,
    sortValue: (r) => r.heDamagePerThrow,
    format: (r) => fmt(r.heDamagePerThrow, 2)
  },
  { key: "heDamagePerRound", label: "HE/回合", numeric: true, sortable: true, sortValue: (r) => r.heDamagePerRound, format: (r) => fmt(r.heDamagePerRound, 2) },
  { key: "heDamage", label: "HE 总伤害", numeric: true, sortable: true, sortValue: (r) => r.heDamage, format: (r) => r.heDamage },
];

const FIRE_COLUMNS: DataTableColumn<UtilityValueRow>[] = [
  { key: "name", label: "对象", format: (r) => r.name },
  { key: "rounds", label: "回合", numeric: true, sortable: true, sortValue: (r) => r.rounds, format: (r) => r.rounds },
  { key: "fireThrows", label: "火数", numeric: true, sortable: true, sortValue: (r) => r.fireThrows, format: (r) => r.fireThrows },
  {
    key: "fireDamagePerThrow",
    label: <>火/颗<MetricInfo note="燃烧弹/燃烧瓶造成的敌方有效生命伤害 / 火投掷数；用于看谁的火更疼、更准。" /></>,
    numeric: true,
    sortable: true,
    sortValue: (r) => r.fireDamagePerThrow,
    format: (r) => fmt(r.fireDamagePerThrow, 2)
  },
  { key: "fireDamagePerRound", label: "火/回合", numeric: true, sortable: true, sortValue: (r) => r.fireDamagePerRound, format: (r) => fmt(r.fireDamagePerRound, 2) },
  { key: "fireDamage", label: "火总伤害", numeric: true, sortable: true, sortValue: (r) => r.fireDamage, format: (r) => r.fireDamage },
];

const FLASH_COLUMNS: DataTableColumn<UtilityValueRow>[] = [
  { key: "name", label: "对象", format: (r) => r.name },
  { key: "rounds", label: "回合", numeric: true, sortable: true, sortValue: (r) => r.rounds, format: (r) => r.rounds },
  { key: "flashesThrown", label: "闪光数", numeric: true, sortable: true, sortValue: (r) => r.flashesThrown, format: (r) => r.flashesThrown },
  {
    key: "enemyBlindSecondsPerRound",
    label: <>敌白/回合<MetricInfo note="闪光造成的敌方致盲秒数 / 回合数；不把队友短暂被白作为主指标。" /></>,
    numeric: true,
    sortable: true,
    sortValue: (r) => r.enemyBlindSecondsPerRound,
    format: (r) => fmt(r.enemyBlindSecondsPerRound, 2, "s")
  },
  {
    key: "enemyBlindSecondsPerFlash",
    label: <>敌白/闪<MetricInfo note="闪光造成的敌方致盲秒数 / 闪光投掷数。" /></>,
    numeric: true,
    sortable: true,
    sortValue: (r) => r.enemyBlindSecondsPerFlash,
    format: (r) => fmt(r.enemyBlindSecondsPerFlash, 2, "s")
  },
  { key: "flashAssistsPerRound", label: "闪助/回合", numeric: true, sortable: true, sortValue: (r) => r.flashAssistsPerRound, format: (r) => fmt(r.flashAssistsPerRound, 3) },
];

const SMOKE_COLUMNS: DataTableColumn<UtilityValueRow>[] = [
  { key: "name", label: "对象", format: (r) => r.name },
  { key: "rounds", label: "回合", numeric: true, sortable: true, sortValue: (r) => r.rounds, format: (r) => r.rounds },
  { key: "smokesThrown", label: "烟数", numeric: true, sortable: true, sortValue: (r) => r.smokesThrown, format: (r) => r.smokesThrown },
  { key: "smokesPerRound", label: "烟/回合", numeric: true, sortable: true, sortValue: (r) => r.smokesPerRound, format: (r) => fmt(r.smokesPerRound, 3) },
];

export function UtilityView({ allEntries, entries, scope, onOpenMatch, onGoLibrary, identityOptions }: UtilityViewProps) {
  const [summary, setSummary] = useState<UtilityValueSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [damageMode, setDamageMode] = useState<DamageMode>("perThrow");
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);
  const heColumns = useMemo(() => orderColumns(HE_COLUMNS, damageMode === "perRound"
    ? ["name", "rounds", "heThrows", "heDamagePerRound", "heDamagePerThrow", "heDamage"]
    : ["name", "rounds", "heThrows", "heDamagePerThrow", "heDamagePerRound", "heDamage"]
  ), [damageMode]);
  const fireColumns = useMemo(() => orderColumns(FIRE_COLUMNS, damageMode === "perRound"
    ? ["name", "rounds", "fireThrows", "fireDamagePerRound", "fireDamagePerThrow", "fireDamage"]
    : ["name", "rounds", "fireThrows", "fireDamagePerThrow", "fireDamagePerRound", "fireDamage"]
  ), [damageMode]);
  const heSortKey = damageMode === "perRound" ? "heDamagePerRound" : "heDamagePerThrow";
  const fireSortKey = damageMode === "perRound" ? "fireDamagePerRound" : "fireDamagePerThrow";
  const damageModeLabel = damageMode === "perRound" ? "每回合贡献" : "每颗效率";

  useEffect(() => {
    if (entries.length === 0) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setSummary(null);
    setError(null);
    getSeasonSummary(entries, identityOptions, scope.teams)
      .then((season) => getUtilityValueSummary(
        entries,
        season.profiles.map((profile) => ({
          playerKey: profile.playerKey,
          name: profile.name,
          steamIds: profile.steamIds,
        })),
        identityOptions,
        scope.teams,
      ))
      .then((next) => {
        if (!cancelled) setSummary(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [entries, identityOptions?.version, scope.teams]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <p>按回合和投掷数归一：闪光看敌方致盲，HE/火看敌方伤害，烟只看每回合投入。</p>
        </div>
      </header>
      <div className="stu-utility-toolbar">
        <span className="stu-muted">HE / 火榜单排序口径</span>
        <div className="stu-speed-toggle" role="radiogroup" aria-label="HE 和火伤害榜单排序口径">
          <button
            type="button"
            role="radio"
            aria-checked={damageMode === "perThrow"}
            className={damageMode === "perThrow" ? "stu-chip stu-chip-active" : "stu-chip"}
            onClick={() => setDamageMode("perThrow")}
          >
            每颗
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={damageMode === "perRound"}
            className={damageMode === "perRound" ? "stu-chip stu-chip-active" : "stu-chip"}
            onClick={() => setDamageMode("perRound")}
          >
            每回合
          </button>
        </div>
        <span className="stu-muted">当前 HE / 火榜按{damageModeLabel}排序。</span>
      </div>
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && !summary && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的道具数据…</div>}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
      {summary && (
        <>
          <UtilityTable title="选手 HE 手雷榜" rows={summary.players.filter((row) => row.heThrows > 0)} columns={heColumns} initialSortKey={heSortKey} empty="当前范围内没有 HE 手雷伤害数据。" pageSize={10} />
          <UtilityTable title="队伍 HE 手雷榜" rows={summary.teams.filter((row) => row.heThrows > 0)} columns={heColumns} initialSortKey={heSortKey} empty="当前范围内没有队伍 HE 手雷伤害数据。" pageSize={10} />
          <UtilityTable title="选手燃烧弹榜" rows={summary.players.filter((row) => row.fireThrows > 0)} columns={fireColumns} initialSortKey={fireSortKey} empty="当前范围内没有火伤害数据。" pageSize={10} />
          <UtilityTable title="队伍燃烧弹榜" rows={summary.teams.filter((row) => row.fireThrows > 0)} columns={fireColumns} initialSortKey={fireSortKey} empty="当前范围内没有队伍火伤害数据。" pageSize={10} />
          <UtilityTable title="选手闪光榜" rows={summary.players.filter((row) => row.flashesThrown > 0)} columns={FLASH_COLUMNS} initialSortKey="enemyBlindSecondsPerRound" empty="当前范围内没有闪光数据。" pageSize={10} />
          <UtilityTable title="队伍闪光榜" rows={summary.teams.filter((row) => row.flashesThrown > 0)} columns={FLASH_COLUMNS} initialSortKey="enemyBlindSecondsPerRound" empty="当前范围内没有队伍闪光数据。" pageSize={10} />
          <UtilityTable title="选手烟雾使用榜" rows={summary.players.filter((row) => row.smokesThrown > 0)} columns={SMOKE_COLUMNS} initialSortKey="smokesPerRound" empty="当前范围内没有烟雾数据。" pageSize={10} />
          <UtilityTable title="队伍烟雾使用榜" rows={summary.teams.filter((row) => row.smokesThrown > 0)} columns={SMOKE_COLUMNS} initialSortKey="smokesPerRound" empty="当前范围内没有队伍烟雾数据。" pageSize={10} />
          <BestFlashList flashes={summary.bestFlashes.slice(0, 12)} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} />
          <DamageEvidenceList rows={summary.bestDamageRounds} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} />
        </>
      )}
    </div>
  );
}

function UtilityTable({ title, rows, columns, initialSortKey, empty, pageSize }: {
  title: string;
  rows: UtilityValueRow[];
  columns: DataTableColumn<UtilityValueRow>[];
  initialSortKey: string;
  empty: string;
  pageSize: number;
}) {
  if (rows.length === 0) {
    return <EmptyState variant="insufficient" title={title} hint={empty} />;
  }
  return (
    <div className="stu-card">
      <h3>{title}</h3>
      <DataTable
        key={`${title}-${initialSortKey}`}
        classes={STUDIO_TABLE_CLASSES}
        rows={rows}
        rowKey={(r) => r.id}
        initialSortKey={initialSortKey}
        pageSize={pageSize}
        paginationInfo={(total) => `${total} 项`}
        showRank
        columns={columns}
      />
    </div>
  );
}

function BestFlashList({ flashes, entryByMatchId, onOpenMatch }: {
  flashes: BestFlash[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: UtilityViewProps["onOpenMatch"];
}) {
  if (flashes.length === 0) return null;
  return (
    <div className="stu-card">
      <h3>最佳闪光 Top</h3>
      <p className="stu-muted">按单颗闪造成的敌方致盲秒数排序；队友短暂被白只作为参考，不进入主榜。</p>
      <div className="stu-evidence-list">
        {flashes.map((flash, index) => {
          const entry = entryByMatchId.get(flash.matchId);
          const teamFlashNote = flash.teamSeconds >= 1 ? ` · 队友白参考 ${flash.teamSeconds.toFixed(1)}s` : "";
          return (
            <EvidenceLink
              key={`${flash.matchId}-${flash.roundNumber}-${index}`}
              disabled={!entry}
              onOpen={() => entry && onOpenMatch(entry.id, { roundNumber: flash.roundNumber, tick: flash.tick })}
            >
              {flash.playerName} · {entry ? formatMatchLabel(entry) : flash.matchId} · R{flash.roundNumber} · {flash.victimCount} 人 · 敌白 {flash.enemySeconds.toFixed(1)}s{teamFlashNote}
            </EvidenceLink>
          );
        })}
      </div>
    </div>
  );
}

function DamageEvidenceList({ rows, entryByMatchId, onOpenMatch }: {
  rows: UtilityDamageEvidence[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: UtilityViewProps["onOpenMatch"];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="stu-card">
      <h3>最高伤害道具回合</h3>
      <div className="stu-evidence-list">
        {rows.map((row, index) => {
          const entry = entryByMatchId.get(row.matchId);
          return (
            <EvidenceLink
              key={`${row.kind}-${row.matchId}-${row.roundNumber}-${index}`}
              disabled={!entry}
              onOpen={() => entry && onOpenMatch(entry.id, { roundNumber: row.roundNumber, tick: row.tick })}
            >
              {row.playerName} · {row.kind === "he" ? "HE 手雷" : "火"} · {entry ? formatMatchLabel(entry) : row.matchId} · R{row.roundNumber} · {row.victimCount} 人 · {row.damage} 伤害
            </EvidenceLink>
          );
        })}
      </div>
    </div>
  );
}
