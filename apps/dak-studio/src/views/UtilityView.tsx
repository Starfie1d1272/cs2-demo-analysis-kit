import { useEffect, useMemo, useState, type ReactNode } from "react";
import { findingFromUtilityDamage, findingFromUtilityFlash, type UtilityDamageEvidence, type UtilityValueRow, type UtilityValueSummary } from "@cs2dak/presentation";
import { DataTable, EmptyState, MetricInfo, STUDIO_TABLE_CLASSES, type DataTableColumn } from "@cs2dak/react";
import { getSeasonSummary, getUtilityValueSummary, type IdentityOptions } from "../lib/season";
import { formatMatchLabel, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { EvidenceActions } from "../components/EvidenceActions";
import type { OpenEvidence } from "../lib/evidence-continuation";

export interface UtilityViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  selectedTeam?: string | null;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onOpenEvidence: OpenEvidence;
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

export function UtilityView({ allEntries, entries, selectedTeam = null, onOpenMatch, onOpenEvidence, onWatchDemo, onGoLibrary, identityOptions }: UtilityViewProps) {
  const [summary, setSummary] = useState<UtilityValueSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);

  useEffect(() => {
    if (entries.length === 0) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setSummary(null);
    setError(null);
    getSeasonSummary(entries, identityOptions, selectedTeam ? [selectedTeam] : [])
      .then((season) => getUtilityValueSummary(
        entries,
        season.profiles.map((profile) => ({
          playerKey: profile.playerKey,
          name: profile.name,
          steamIds: profile.steamIds,
        })),
        identityOptions,
        selectedTeam ? [selectedTeam] : [],
      ))
      .then((next) => {
        if (!cancelled) setSummary(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [entries, identityOptions?.version, selectedTeam]);

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
          <p>按回合和投掷数归一：闪光看敌方致盲时间，HE/火看敌方伤害，烟只看每回合投入；不把关联数据表述为对胜负的因果贡献。</p>
        </div>
      </header>
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && !summary && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的道具数据…</div>}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
      {summary && (
        <div className="stu-utility-stack">
          <UtilitySection
            title="HE 伤害"
            player={<UtilityTable title="选手榜" rows={summary.players.filter((row) => row.heThrows > 0)} columns={HE_COLUMNS} initialSortKey="heDamagePerThrow" empty="当前范围内没有 HE 手雷伤害数据。" pageSize={10} />}
            team={<UtilityTable title="队伍榜" rows={summary.teams.filter((row) => row.heThrows > 0)} columns={HE_COLUMNS} initialSortKey="heDamagePerThrow" empty="当前范围内没有队伍 HE 手雷伤害数据。" pageSize={10} />}
          />
          <UtilitySection
            title="火焰伤害"
            player={<UtilityTable title="选手榜" rows={summary.players.filter((row) => row.fireThrows > 0)} columns={FIRE_COLUMNS} initialSortKey="fireDamagePerThrow" empty="当前范围内没有火伤害数据。" pageSize={10} />}
            team={<UtilityTable title="队伍榜" rows={summary.teams.filter((row) => row.fireThrows > 0)} columns={FIRE_COLUMNS} initialSortKey="fireDamagePerThrow" empty="当前范围内没有队伍火伤害数据。" pageSize={10} />}
          />
          <UtilitySection
            title="闪光"
            player={<UtilityTable title="选手榜" rows={summary.players.filter((row) => row.flashesThrown > 0)} columns={FLASH_COLUMNS} initialSortKey="enemyBlindSecondsPerRound" empty="当前范围内没有闪光数据。" pageSize={10} />}
            team={<UtilityTable title="队伍榜" rows={summary.teams.filter((row) => row.flashesThrown > 0)} columns={FLASH_COLUMNS} initialSortKey="enemyBlindSecondsPerRound" empty="当前范围内没有队伍闪光数据。" pageSize={10} />}
          />
          <UtilitySection
            title="烟雾"
            player={<UtilityTable title="选手榜" rows={summary.players.filter((row) => row.smokesThrown > 0)} columns={SMOKE_COLUMNS} initialSortKey="smokesPerRound" empty="当前范围内没有烟雾数据。" pageSize={10} />}
            team={<UtilityTable title="队伍榜" rows={summary.teams.filter((row) => row.smokesThrown > 0)} columns={SMOKE_COLUMNS} initialSortKey="smokesPerRound" empty="当前范围内没有队伍烟雾数据。" pageSize={10} />}
          />
          <BestFlashList flashes={summary.bestFlashes.slice(0, 12)} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} onOpenEvidence={onOpenEvidence} onWatchDemo={onWatchDemo} />
          <DamageEvidenceList rows={summary.bestDamageRounds} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} onOpenEvidence={onOpenEvidence} onWatchDemo={onWatchDemo} />
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
    <div className="stu-utility-table">
      <h4>{title}</h4>
      <div className="stu-table-scroll">
        <DataTable
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
    </div>
  );
}

function BestFlashList({ flashes, entryByMatchId, onOpenMatch, onOpenEvidence, onWatchDemo }: {
  flashes: BestFlash[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: UtilityViewProps["onOpenMatch"];
  onOpenEvidence: UtilityViewProps["onOpenEvidence"];
  onWatchDemo?: UtilityViewProps["onWatchDemo"];
}) {
  if (flashes.length === 0) return null;
  return (
    <div className="stu-card">
      <h3>最佳闪光 Top</h3>
      <p className="stu-muted">按单颗闪造成的敌方致盲时间排序；队友短暂被白只作为参考，不进入主榜。</p>
      <div className="stu-evidence-list">
        {flashes.map((flash, index) => {
          const entry = entryByMatchId.get(flash.matchId);
          const teamFlashNote = flash.teamSeconds >= 1 ? ` · 队友致盲参考 ${flash.teamSeconds.toFixed(1)}s` : "";
          return (
            <EvidenceActions
              key={`${flash.matchId}-${flash.roundNumber}-${index}`}
              entry={entry}
              target={{ roundNumber: flash.roundNumber, tick: flash.tick }}
              onOpenMatch={onOpenMatch}
              onOpenEvidence={onOpenEvidence}
              onWatchDemo={onWatchDemo}
              reason={flash.reason}
              sourceKey={`utility:flash:${flash.matchId}:${flash.roundNumber}:${index}`}
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

function DamageEvidenceList({ rows, entryByMatchId, onOpenMatch, onOpenEvidence, onWatchDemo }: {
  rows: UtilityDamageEvidence[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: UtilityViewProps["onOpenMatch"];
  onOpenEvidence: UtilityViewProps["onOpenEvidence"];
  onWatchDemo?: UtilityViewProps["onWatchDemo"];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="stu-card">
      <h3>最高伤害道具回合</h3>
      <div className="stu-evidence-list">
        {rows.map((row, index) => {
          const entry = entryByMatchId.get(row.matchId);
          return (
            <EvidenceActions
              key={`${row.kind}-${row.matchId}-${row.roundNumber}-${index}`}
              entry={entry}
              target={{ roundNumber: row.roundNumber, tick: row.tick }}
              onOpenMatch={onOpenMatch}
              onOpenEvidence={onOpenEvidence}
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
