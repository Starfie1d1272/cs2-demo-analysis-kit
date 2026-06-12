import { useEffect, useMemo, useState } from "react";
import type { DuelFinderRow, DuelInsightsModel, PlayerMechanicsRow } from "@cs2dak/contract";
import { buildDuelInsights, displayWeaponName, duelClassificationLabel } from "@cs2dak/presentation";
import { getMapCalibration, worldToRadar } from "@cs2dak/maps";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { displayTeamName } from "../lib/identity";
import { getDemoPackage, matchIdForEntry, type StudioDemoEntry } from "../lib/library";

type DuelTab = "overview" | "opening" | "evidence";
type EvidenceFilter = "contested" | "outaimed" | "caught_off_guard" | "cleanup" | "all";

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
  { key: "overview", label: "机制总览" },
  { key: "opening", label: "首杀位置" },
  { key: "evidence", label: "证据回放" }
];

const CLASS_TONE: Record<string, string> = {
  contested: "正面对枪",
  outaimed: "正面秒杀",
  caught_off_guard: "偷背身",
  cleanup: "补残血"
};

const EVIDENCE_FILTERS: Array<{ key: EvidenceFilter; label: string; description: string }> = [
  { key: "contested", label: "正面对枪", description: "双方在窗口内互有开枪或伤害" },
  { key: "outaimed", label: "正面秒杀", description: "对手看向击杀者但未完成有效还手" },
  { key: "caught_off_guard", label: "偷背身", description: "对手未还手且朝向不在正面角度" },
  { key: "cleanup", label: "补残血", description: "交火开始时对手低于 80 HP；不判断是否补枪或残局" },
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
  const [tab, setTab] = useState<DuelTab>("overview");
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
    Promise.all(entries.map(async (entry) => ({ matchId: matchIdForEntry(entry), pkg: await getDemoPackage(entry.id) })))
      .then((demos) => {
        if (!cancelled) setModel(buildDuelInsights(demos));
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
        <div className="stu-empty">
          <h2>还没有对枪数据</h2>
          <p>先导入带逐枪数据的 v2 ZIP，再查看对枪和机制指标。</p>
          <button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>
        </div>
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
            <span>有效交火</span>
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
            <span>正面胜负样本</span>
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

      {error && <div className="stu-empty"><h2>分析失败</h2><p>{error}</p></div>}
      {!error && entries.length === 0 && <div className="stu-empty"><h2>聚合范围为空</h2><p>请调整聚合范围。</p></div>}
      {!error && !model && entries.length > 0 && <div className="stu-loading">分析 {entries.length} 场 demo 的逐枪与伤害事件…</div>}

      {model && tab === "overview" && (
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

      {model && tab === "evidence" && (
        <EvidenceCards rows={model.duelRows} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} />
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
    contestedDuels: model.duelRows.filter((row) => row.classification === "contested").length
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
        const contested = player.duels.filter((duel) => duel.classification === "contested").length;
        const outaimed = player.duels.filter((duel) => duel.classification === "outaimed").length;
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
              <MetricPill label="正面对枪" value={String(contested)} />
              <MetricPill label="正面秒人" value={String(outaimed)} />
            </div>
            <div className="stu-duel-weapon-stack">
              {player.rows.slice(0, 3).map((row) => (
                <div key={`${row.steamId64}-${row.weapon}`} className="stu-duel-weapon-row">
                  <span>{displayWeaponName(row.weapon)}</span>
                  <b>{row.killCount} 击杀 · {row.shotCount} 发</b>
                  <div>
                    {row.metrics.slice(0, 3).map((metric) => (
                      <small key={metric.key}>{metric.label} {metric.value.toFixed(1)}{metric.unit ?? ""}</small>
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
          <span><i className="stu-duel-dot contested" />首杀有还手</span>
          <span><i className="stu-duel-dot outaimed" />正面秒杀</span>
          <span><i className="stu-duel-dot caught" />抓背身</span>
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
  const [filter, setFilter] = useState<EvidenceFilter>(compact ? "all" : "contested");
  const counts = useMemo(() => {
    const next = new Map<EvidenceFilter, number>(EVIDENCE_FILTERS.map((item) => [item.key, 0]));
    for (const row of rows) {
      next.set(row.classification, (next.get(row.classification) ?? 0) + 1);
      next.set("all", (next.get("all") ?? 0) + 1);
    }
    return next;
  }, [rows]);
  const activeRows = useMemo(
    () => filter === "all" ? rows : rows.filter((row) => row.classification === filter),
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
                    <MetricPill label="对手血量" value={`${row.victimHealthBefore} HP`} />
                    <MetricPill label="自己血量" value={row.killerHealthBefore == null ? "—" : `${row.killerHealthBefore} HP`} />
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
  if (row.classification === "cleanup") {
    const killer = row.killerHealthBefore == null ? "己方血量未知" : `己方 ${row.killerHealthBefore} HP`;
    return `补残血：交火开始时对手 ${row.victimHealthBefore} HP，${killer}；不计入完整血量对枪。`;
  }
  if (row.ttkMs === 0 && row.oneShotKill) {
    return row.classification === "contested"
      ? "0ms 表示击杀者这一组第一枪就是致命伤；对手在判定窗口内有开枪或伤害，所以仍归为正面对枪。"
      : "0ms 表示击杀者这一组第一枪就是致命伤。";
  }
  if (row.classification === "caught_off_guard") return "偷背身：对手没有有效还手，死亡帧朝向不在正面角度。";
  if (row.classification === "outaimed") return "正面秒杀：对手朝向击杀者，但未在窗口内形成有效还手。";
  return "正面对枪：双方在判定窗口内互有开枪或伤害。";
}

function DuelNotes({ notes }: { notes: string[] }) {
  return (
    <div className="stu-duel-notes">
      {notes.map((note) => <span key={note}>ⓘ {note}</span>)}
    </div>
  );
}
