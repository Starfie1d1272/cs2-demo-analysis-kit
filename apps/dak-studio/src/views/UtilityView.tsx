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

const fmt = (value: number | null, digits = 2, suffix = "") => value == null ? "—" : `${value.toFixed(digits)}${suffix}`;
const damagePerRound = (row: UtilityValueRow) => (row.heDamagePerRound ?? 0) + (row.fireDamagePerRound ?? 0);

const VALUE_COLUMNS: DataTableColumn<UtilityValueRow>[] = [
  { key: "name", label: "对象", format: (r) => r.name },
  { key: "rounds", label: "回合", numeric: true, sortable: true, sortValue: (r) => r.rounds, format: (r) => r.rounds },
  {
    key: "damagePerRound",
    label: <>雷火伤害/回合<MetricInfo note="HE 手雷 + 火造成的敌方有效生命伤害 / 回合数；只算敌方，不算队友。" /></>,
    numeric: true,
    sortable: true,
    sortValue: damagePerRound,
    format: (r) => fmt(damagePerRound(r), 2)
  },
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
  { key: "heDamagePerThrow", label: "HE/颗", numeric: true, sortable: true, sortValue: (r) => r.heDamagePerThrow, format: (r) => fmt(r.heDamagePerThrow, 2) },
  { key: "heDamagePerRound", label: "HE/回合", numeric: true, sortable: true, sortValue: (r) => r.heDamagePerRound, format: (r) => fmt(r.heDamagePerRound, 2) },
  { key: "fireDamagePerThrow", label: "火/颗", numeric: true, sortable: true, sortValue: (r) => r.fireDamagePerThrow, format: (r) => fmt(r.fireDamagePerThrow, 2) },
  { key: "fireDamagePerRound", label: "火/回合", numeric: true, sortable: true, sortValue: (r) => r.fireDamagePerRound, format: (r) => fmt(r.fireDamagePerRound, 2) },
  { key: "smokesPerRound", label: "烟/回合", numeric: true, sortable: true, sortValue: (r) => r.smokesPerRound, format: (r) => fmt(r.smokesPerRound, 3) },
];

export function UtilityView({ allEntries, entries, scope, onOpenMatch, onGoLibrary, identityOptions }: UtilityViewProps) {
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
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && !summary && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的道具数据…</div>}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
      {summary && (
        <>
          <UtilityTable title="选手道具价值" rows={summary.players} empty="当前范围内没有选手道具数据。" pageSize={15} />
          <UtilityTable title="队伍道具价值" rows={summary.teams} empty="当前范围内没有队伍道具数据。" pageSize={10} />
          <BestFlashList flashes={summary.bestFlashes.slice(0, 12)} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} />
          <DamageEvidenceList rows={summary.bestDamageRounds} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} />
        </>
      )}
    </div>
  );
}

function UtilityTable({ title, rows, empty, pageSize }: { title: string; rows: UtilityValueRow[]; empty: string; pageSize: number }) {
  if (rows.length === 0) {
    return <EmptyState variant="insufficient" title={title} hint={empty} />;
  }
  return (
    <div className="stu-card">
      <h3>{title}</h3>
      <DataTable
        classes={STUDIO_TABLE_CLASSES}
        rows={rows}
        rowKey={(r) => r.id}
        initialSortKey="damagePerRound"
        pageSize={pageSize}
        paginationInfo={(total) => `${total} 项`}
        columns={VALUE_COLUMNS}
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
