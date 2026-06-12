import { useEffect, useMemo, useState } from "react";
import type { DuelFinderRow, DuelInsightsModel, PlayerMechanicsRow } from "@cs2dak/contract";
import { buildDuelInsights, displayWeaponName, duelClassificationLabel } from "@cs2dak/presentation";
import { getMapCalibration, worldToRadar } from "@cs2dak/maps";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { EmptyState, MetricInfo } from "../components/primitives";
import { displayTeamName } from "../lib/identity";
import { getDemoPackage, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { loadTriLookup } from "../lib/tri";

type DuelTab = "records" | "opening" | "mechanics";
type EvidenceFilter = "contested_duel" | "suppressed_kill" | "caught_off_guard" | "full_hp" | "low_hp" | "all";

export interface DuelViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  teamRenames?: Record<string, string>;
}

const TABS: Array<{ key: DuelTab; label: string }> = [
  { key: "records", label: "对枪记录" },
  { key: "opening", label: "首杀分析" },
  { key: "mechanics", label: "枪法机制" }
];

const CLASS_TONE: Record<string, string> = {
  contested_duel: "对枪胜出",
  suppressed_kill: "先手压制击杀",
  caught_off_guard: "侧背身击杀"
};

const EVIDENCE_FILTERS: Array<{ key: EvidenceFilter; label: string; description: string }> = [
  { key: "contested_duel", label: "对枪胜出", description: "受害者在 ±1.5s 内还手，属于真实对枪样本" },
  { key: "suppressed_kill", label: "先手压制", description: "受害者面向击杀者但未开枪" },
  { key: "caught_off_guard", label: "侧背身", description: "受害者未面向、转点或跑动中被击杀" },
  { key: "full_hp", label: "完整 HP", description: "victimHealthBefore ≥ 80，可进入 full HP TTK 分布" },
  { key: "low_hp", label: "低 HP", description: "victimHealthBefore < 80，保留证据但不污染 full HP TTK" },
  { key: "all", label: "全部", description: "保留完整证据队列" }
];

export function DuelView({
  allEntries,
  entries,
  scope,
  onScopeChange,
  onOpenMatch,
  onGoLibrary,
  teamRenames = {}
}: DuelViewProps) {
  const [tab, setTab] = useState<DuelTab>("records");
  const [model, setModel] = useState<DuelInsightsModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);

  useEffect(() => {
    if (entries.length === 0) {
      setModel(null);
      return;
    }
    let cancelled = false;
    setModel(null);
    setError(null);
    Promise.all([
      Promise.all(entries.map(async (entry) => ({ matchId: matchIdForEntry(entry), pkg: await getDemoPackage(entry.id) }))),
      loadTriLookup(entries.map((entry) => entry.meta.mapName))
    ])
      .then(([demos, visibilityFor]) => {
        if (!cancelled) setModel(buildDuelInsights(demos, { visibilityFor }));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有对枪数据"
          hint="先导入带逐枪数据的 v3 ZIP，再查看对枪和机制指标。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  const summary = model ? summarizeDuels(model) : null;

  return (
    <div className="stu-view stu-duel-view">
      <header className="stu-view-header">
        <div>
          <h1>对枪实验室</h1>
          <p>先看选手和武器画像，再钻到具体回合证据。指标只来自当前聚合范围。</p>
        </div>
      </header>
      <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} teamRenames={teamRenames} />

      {summary && (
        <section className="stu-duel-hero">
          <div>
            <span>对枪记录</span>
            <strong>{summary.totalDuels}</strong>
            <small>{model?.matchCount ?? 0} 场 demo</small>
          </div>
          <div>
            <span>完整血量对枪</span>
            <strong>{summary.fullHealthDuels}</strong>
            <small>{summary.fullHealthRate.toFixed(1)}%</small>
          </div>
          <div>
            <span>中位 TTK</span>
            <strong>{summary.medianTtk == null ? "—" : `${summary.medianTtk}ms`}</strong>
            <small>连发第一枪 → 击杀</small>
          </div>
          <div>
            <span>对枪胜出样本</span>
            <strong>{summary.contestedDuels}</strong>
            <small>有来有回</small>
          </div>
        </section>
      )}

      <div className="stu-subtabs" role="tablist" aria-label="对枪实验室">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? "stu-subtab stu-subtab-active" : "stu-subtab"}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <EmptyState variant="error" title="分析失败" hint={error} />}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
      {!error && !model && entries.length > 0 && <div className="stu-loading">分析 {entries.length} 场 demo 的逐枪与伤害事件…</div>}

      {model && tab === "records" && (
        <EvidenceCards rows={model.duelRows} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} />
      )}

      {model && tab === "mechanics" && (
        <>
          {model.mechanicsRows.length === 0 ? (
            <div className="stu-card"><p className="stu-muted">当前范围缺少 shots.json，机制画像已隐藏。</p></div>
          ) : (
            <PlayerMechanicsGrid rows={model.mechanicsRows} duelRows={model.duelRows} teamRenames={teamRenames} />
          )}
          <DuelNotes notes={model.notes} />
        </>
      )}

      {model && tab === "opening" && (
        <OpeningDuelMap rows={model.openingRows} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} />
      )}
    </div>
  );
}

function summarizeDuels(model: DuelInsightsModel) {
  const ttkValues = model.duelRows.map((row) => row.ttkMs).filter((value): value is number => value != null).sort((a, b) => a - b);
  const medianTtk = ttkValues.length === 0 ? null : ttkValues[Math.floor(ttkValues.length / 2)];
  const fullHealthDuels = model.duelRows.filter((row) => row.fullHealth).length;
  return {
    totalDuels: model.duelRows.length,
    fullHealthDuels,
    fullHealthRate: model.duelRows.length > 0 ? fullHealthDuels / model.duelRows.length * 100 : 0,
    medianTtk,
    contestedDuels: model.duelRows.filter((row) => row.classification === "contested_duel").length
  };
}

function PlayerMechanicsGrid({
  rows,
  duelRows,
  teamRenames
}: {
  rows: PlayerMechanicsRow[];
  duelRows: DuelFinderRow[];
  teamRenames: Record<string, string>;
}) {
  const grouped = useMemo(() => {
    const byPlayer = new Map<string, { name: string; teamName: string; rows: PlayerMechanicsRow[]; duels: DuelFinderRow[] }>();
    for (const row of rows) {
      const current = byPlayer.get(row.steamId64) ?? { name: row.playerName, teamName: row.teamName, rows: [], duels: [] };
      current.rows.push(row);
      byPlayer.set(row.steamId64, current);
    }
    for (const duel of duelRows) {
      const current = byPlayer.get(duel.killerSteamId64);
      if (current) current.duels.push(duel);
    }
    return [...byPlayer.entries()]
      .map(([steamId64, data]) => ({
        steamId64,
        ...data,
        rows: [...data.rows].sort((a, b) => b.killCount - a.killCount || b.shotCount - a.shotCount)
      }))
      .sort((a, b) => b.duels.length - a.duels.length || a.name.localeCompare(b.name));
  }, [rows, duelRows]);

  return (
    <section className="stu-duel-player-grid">
      {grouped.slice(0, 12).map((player) => {
        const topWeapon = [...player.rows].sort((a, b) => b.killCount - a.killCount || b.shotCount - a.shotCount)[0];
        const contested = player.duels.filter((duel) => duel.classification === "contested_duel").length;
        const suppressed = player.duels.filter((duel) => duel.classification === "suppressed_kill").length;
        return (
          <article key={player.steamId64} className="stu-duel-player-card">
            <header>
              <div>
                <h3>{player.name}</h3>
                <span>{displayTeamName(player.teamName, teamRenames)}</span>
              </div>
              <b>{player.duels.length}</b>
            </header>
            <div className="stu-duel-card-stats">
              <MetricPill label="主武器" value={topWeapon ? displayWeaponName(topWeapon.weapon) : "—"} />
              <MetricPill label="对枪胜出" value={String(contested)} />
              <MetricPill label="先手压制" value={String(suppressed)} />
            </div>
            <div className="stu-duel-weapon-stack">
              {player.rows.slice(0, 3).map((row) => (
                <div key={`${row.steamId64}-${row.weapon}`} className="stu-duel-weapon-row">
                  <span>{displayWeaponName(row.weapon)}</span>
                  <b>{row.killCount} 击杀 · {row.shotCount} 发</b>
                  <div>
                    {row.metrics.slice(0, 4).map((metric) => (
                      <small key={metric.key}>
                        {metric.label} {metric.value.toFixed(1)}{metric.unit ?? ""}
                        <MetricInfo note={metricInfoNote(metric.key)} />
                      </small>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="stu-duel-pill">
      <small>{label}</small>
      <b>{value}</b>
    </span>
  );
}

function OpeningDuelMap({
  rows,
  entryByMatchId,
  onOpenMatch
}: {
  rows: DuelInsightsModel["openingRows"];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
}) {
  const mapName = rows[0]?.mapName ?? "de_mirage";
  const calibration = getMapCalibration(mapName);
  return (
    <section className="stu-duel-opening-layout">
      <div className="stu-card stu-duel-map-card">
        <h3>首杀位置</h3>
        <p className="stu-muted">每回合第一条击杀事件，落点取受害者死亡位置；点击点位跳到对应回合回放。</p>
        <svg
          className="stu-duel-radar"
          viewBox={`0 0 ${calibration?.radarSize ?? 1024} ${calibration?.radarSize ?? 1024}`}
          role="img"
          aria-label={`${mapName} 首杀位置`}
        >
          {calibration && <image href={`./maps/radars/${mapName}.png`} width={calibration.radarSize} height={calibration.radarSize} opacity={0.88} />}
          {calibration && rows.slice(0, 80).map((row) => {
            if (!row.victimPosition) return null;
            const point = worldToRadar(row.victimPosition, calibration);
            return (
              <g
                key={row.id}
                className={`stu-duel-map-point stu-duel-map-point-${row.classification}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  const entry = entryByMatchId.get(row.matchId);
                  if (entry) onOpenMatch(entry.id, { roundNumber: row.roundNumber, tick: row.tick });
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  const entry = entryByMatchId.get(row.matchId);
                  if (entry) onOpenMatch(entry.id, { roundNumber: row.roundNumber, tick: row.tick });
                }}
              >
                <title>{`R${row.roundNumber} ${row.killerName} > ${row.victimName}`}</title>
                <circle cx={point.x} cy={point.y} r={10} className="stu-duel-map-point-ring" />
                <circle cx={point.x} cy={point.y} r={5} className="stu-duel-map-point-core" />
              </g>
            );
          })}
        </svg>
        <div className="stu-duel-legend">
          <span><i className="stu-duel-dot contested" />对枪胜出</span>
          <span><i className="stu-duel-dot outaimed" />先手压制</span>
          <span><i className="stu-duel-dot caught" />侧背身</span>
        </div>
      </div>
      <EvidenceCards rows={rows} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} compact />
    </section>
  );
}

function EvidenceCards({
  rows,
  entryByMatchId,
  onOpenMatch,
  compact = false
}: {
  rows: DuelInsightsModel["duelRows"];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState<EvidenceFilter>(compact ? "all" : "contested_duel");
  const counts = useMemo(() => {
    const next = new Map<EvidenceFilter, number>(EVIDENCE_FILTERS.map((item) => [item.key, 0]));
    for (const row of rows) {
      next.set(row.classification, (next.get(row.classification) ?? 0) + 1);
      next.set(row.hpBucket, (next.get(row.hpBucket) ?? 0) + 1);
      next.set("all", (next.get("all") ?? 0) + 1);
    }
    return next;
  }, [rows]);
  const activeRows = useMemo(
    () => filter === "all"
      ? rows
      : filter === "full_hp" || filter === "low_hp"
        ? rows.filter((row) => row.hpBucket === filter)
        : rows.filter((row) => row.classification === filter),
    [filter, rows]
  );
  return (
    <section className={compact ? "stu-duel-evidence-wrap compact" : "stu-duel-evidence-wrap"}>
      {rows.length === 0 ? (
        <div className="stu-card"><p className="stu-muted">当前范围没有可识别对枪。</p></div>
      ) : (
        <>
          {!compact && (
            <div className="stu-duel-evidence-toolbar" role="tablist" aria-label="证据分类">
              {EVIDENCE_FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={filter === item.key ? "active" : ""}
                  onClick={() => setFilter(item.key)}
                >
                  <span>{item.label}</span>
                  <b>{counts.get(item.key) ?? 0}</b>
                  <small className="stu-duel-tooltip" role="tooltip">{item.description}</small>
                </button>
              ))}
            </div>
          )}
          <div className={compact ? "stu-duel-evidence compact" : "stu-duel-evidence-list"}>
            {activeRows.slice(0, compact ? 10 : 80).map((row) => {
              const entry = entryByMatchId.get(row.matchId);
              const explanation = explainDuelRow(row);
              return (
                <article key={row.id} className="stu-duel-evidence-card">
                  <div className="stu-duel-evidence-main">
                    <span className={`stu-duel-type stu-duel-type-${row.classification}`}>
                      {CLASS_TONE[row.classification] ?? duelClassificationLabel(row.classification)}
                      <small className="stu-duel-tooltip" role="tooltip">{explanation}</small>
                    </span>
                    <h3>{row.killerName} <small>击败</small> {row.victimName}</h3>
                    <p>{row.mapName} · R{row.roundNumber} · {displayWeaponName(row.weapon)}</p>
                  </div>
                  <div className="stu-duel-evidence-meta">
                    <MetricPill label="TTK" value={row.ttkMs == null ? "—" : `${row.ttkMs}ms`} />
                    <MetricPill label="HP 分档" value={row.hpBucket === "full_hp" ? "完整" : "低血"} />
                    <MetricPill label="自己血量" value={row.killerHealthBefore == null ? "—" : `${row.killerHealthBefore} HP`} />
                    {row.thirdParty && <MetricPill label="第三方" value="已隔离" />}
                  </div>
                  {entry && (
                    <button type="button" className="stu-button-sm" onClick={() => onOpenMatch(entry.id, { roundNumber: row.roundNumber, tick: row.tick })}>
                      看回放
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function explainDuelRow(row: DuelFinderRow): string {
  if (row.hpBucket === "low_hp") {
    const killer = row.killerHealthBefore == null ? "己方血量未知" : `己方 ${row.killerHealthBefore} HP`;
    return `低血样本：交火开始时对手 ${row.victimHealthBefore} HP，${killer}；保留证据但不计入 full HP TTK。`;
  }
  if (row.ttkMs === 0 && row.oneShotKill) {
    return row.classification === "contested_duel"
      ? "0ms 表示击杀者这一组第一枪就是致命伤；对手在判定窗口内有开枪或伤害，所以仍归为正面对枪。"
      : "0ms 表示击杀者这一组第一枪就是致命伤。";
  }
  if (row.thirdParty) return "第三方关键伤害参与，TTK 已从完整分布隔离。";
  if (row.classification === "caught_off_guard") return "侧背身击杀：对手未面向、转点或跑动中被击杀。";
  if (row.classification === "suppressed_kill") return "先手压制击杀：对手面向击杀者，但未在窗口内开枪。";
  return "对枪胜出：受害者在 ±1.5s 内还手。";
}

function metricInfoNote(key: string): string {
  if (key === "firstShotAccuracy") return "每个 burst 第一发是否在 ±1 tick 匹配伤害事件。";
  if (key === "sprayAccuracy") return "同一 burst 第二发起，且只统计击杀边界前开枪。";
  if (key === "counterStrafe") return "开枪前 200ms velocity 按武器/类别阈值判定，缺失 velocity 显示 —。";
  if (key === "oneTapRate") return "单发击杀数 / 总击杀数，一枪头 TTK≈0 合法。";
  if (key === "visualReaction") return "首次可见 tick 到首发开枪；有 tri BVH 时使用 LOS，否则降级到 duels window 起点。";
  if (key === "preaimAngleError") return "peek 前视角与敌人方向夹角；误差越小越好。";
  return "当前范围百分位，不输出 A/B/C。";
}

function DuelNotes({ notes }: { notes: string[] }) {
  return (
    <div className="stu-duel-notes">
      {notes.map((note) => <span key={note}>ⓘ {note}</span>)}
    </div>
  );
}
