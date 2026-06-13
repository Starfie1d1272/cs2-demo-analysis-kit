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
type EvidenceFilter = "contested_duel" | "suppressed_kill" | "caught_off_guard" | "low_hp" | "third_party" | "all";

const EVIDENCE_FILTERS: Array<{ key: EvidenceFilter; label: string; description: string }> = [
  { key: "contested_duel", label: "对枪胜出", description: "受害者在 ±1.5s 内还手，属于真实对枪样本" },
  { key: "suppressed_kill", label: "先手压制", description: "受害者面向击杀者但未开枪" },
  { key: "caught_off_guard", label: "侧背身", description: "受害者未面向、转点或跑动中被击杀" },
  { key: "low_hp", label: "低血量", description: "victimHealthBefore < 80，保留证据但不进 full HP TTK" },
  { key: "third_party", label: "补枪", description: "第三方在 ±2s 内造成关键伤害，TTK 不计入分布" },
  { key: "all", label: "全部", description: "保留全部证据队列" }
];

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

// ── 武器分类映射（用于筛选栏） ──
type WeaponCategory = "步枪" | "狙击" | "手枪" | "冲锋枪" | "霰弹机枪";

const WEAPON_CATS: Record<string, WeaponCategory> = {
  // 步枪（从 WEAPON_DISPLAY_NAMES 的 key 看）
  ak47: "步枪", m4a4: "步枪", m4a1: "步枪", m4a1_silencer: "步枪",
  aug: "步枪", sg556: "步枪", sg553: "步枪",
  famas: "步枪", galilar: "步枪", galil: "步枪",
  // 狙击
  awp: "狙击", ssg08: "狙击", scar20: "狙击", g3sg1: "狙击",
  // 手枪
  deagle: "手枪", deserteagle: "手枪", revolver: "手枪",
  glock: "手枪", usp_silencer: "手枪", usp: "手枪",
  hkp2000: "手枪", p2000: "手枪", p250: "手枪",
  fiveseven: "手枪", tec9: "手枪", cz75a: "手枪", cz75: "手枪",
  elite: "手枪",
  // 冲锋枪
  mp9: "冲锋枪", mp7: "冲锋枪", mp5sd: "冲锋枪",
  ump45: "冲锋枪", p90: "冲锋枪", bizon: "冲锋枪", mac10: "冲锋枪",
  // 霰弹/机枪
  nova: "霰弹机枪", xm1014: "霰弹机枪", mag7: "霰弹机枪",
  sawedoff: "霰弹机枪", m249: "霰弹机枪", negev: "霰弹机枪"
};

function weaponCat(name: string): WeaponCategory | "其他" {
  return WEAPON_CATS[name.toLowerCase()] ?? "其他";
}

const CAT_KEYS: Array<WeaponCategory | "其他" | "全部"> = ["步枪", "狙击", "手枪", "冲锋枪", "霰弹机枪", "其他", "全部"];
const CAT_LABEL: Record<WeaponCategory | "其他" | "全部", string> = {
  步枪: "步枪", 狙击: "狙击", 手枪: "手枪", 冲锋枪: "冲锋枪", 霰弹机枪: "霰弹机枪", 其他: "其他", 全部: "全部"
};

/** 统一 TTK 列标签：有合法 TTK 显示数值，低血量 / 补枪分别标注。 */
function ttkLabel(row: DuelFinderRow): string {
  if (row.ttkMs != null) return `${row.ttkMs}ms`;
  if (row.hpBucket === "low_hp") return "低血量";
  if (row.thirdParty) return "补枪";
  return "—";
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
  const [weaponCatFilter, setWeaponCatFilter] = useState<WeaponCategory | "其他" | "全部">("全部");
  const [page, setPage] = useState(0);
  const perPage = 48;

  // 分类计数
  const counts = useMemo(() => {
    const next = new Map<EvidenceFilter | WeaponCategory | "其他" | "全部", number>();
    for (const f of EVIDENCE_FILTERS) next.set(f.key, 0);
    for (const cat of CAT_KEYS) next.set(cat, 0);
    for (const row of rows) {
      const c = row.classification;
      next.set(c, (next.get(c) ?? 0) + 1);
      if (row.hpBucket === "low_hp") next.set("low_hp", (next.get("low_hp") ?? 0) + 1);
      if (row.thirdParty) next.set("third_party", (next.get("third_party") ?? 0) + 1);
      const wc = weaponCat(row.weapon);
      next.set(wc, (next.get(wc) ?? 0) + 1);
      next.set("全部", (next.get("全部") ?? 0) + 1);
      next.set("all", (next.get("all") ?? 0) + 1);
    }
    return next;
  }, [rows]);

  // 分类 + 武器 + 排序
  const activeRows = useMemo(() => {
    let filtered = rows;
    if (filter === "low_hp") filtered = filtered.filter((r) => r.hpBucket === "low_hp");
    else if (filter === "third_party") filtered = filtered.filter((r) => r.thirdParty);
    else if (filter !== "all") filtered = filtered.filter((r) => r.classification === filter);
    if (weaponCatFilter !== "全部") filtered = filtered.filter((r) => weaponCat(r.weapon) === weaponCatFilter);
    return [...filtered].sort((a, b) => {
      const orderA = a.ttkMs != null ? 0 : a.hpBucket === "low_hp" ? 1 : 2;
      const orderB = b.ttkMs != null ? 0 : b.hpBucket === "low_hp" ? 1 : 2;
      return orderA - orderB || a.roundNumber - b.roundNumber || a.tick - b.tick;
    });
  }, [rows, filter, weaponCatFilter]);

  const totalPages = Math.ceil(activeRows.length / perPage);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageRows = activeRows.slice(safePage * perPage, (safePage + 1) * perPage);

  function switchFilter(next: EvidenceFilter) {
    setFilter(next);
    setPage(0);
  }
  function switchWeapon(next: WeaponCategory | "其他" | "全部") {
    setWeaponCatFilter((prev) => (prev === next ? "全部" : next));
    setPage(0);
  }

  if (compact) {
    // 首杀 tab 侧栏简单列表
    return (
      <section className="stu-duel-evidence-wrap compact">
        <div className="stu-duel-evidence compact">
          {rows.slice(0, 10).map((row) => {
            const entry = entryByMatchId.get(row.matchId);
            return (
              <article key={row.id} className="stu-duel-card-compact">
                <span className={`stu-duel-type stu-duel-type-${row.classification}`}>
                  {CLASS_TONE[row.classification] ?? duelClassificationLabel(row.classification)}
                </span>
                <small>{row.killerName} → {row.victimName}</small>
                <small className="stu-dim">{row.mapName} R{row.roundNumber}</small>
                {entry && (
                  <button type="button" className="stu-button-sm" onClick={() => onOpenMatch(entry.id, { roundNumber: row.roundNumber, tick: row.tick })}>
                    回放
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="stu-duel-evidence-wrap">
      {rows.length === 0 ? (
        <div className="stu-card"><p className="stu-muted">当前范围没有可识别对枪。</p></div>
      ) : (
        <>
          {/* 分类筛选栏 */}
          <div className="stu-duel-evidence-toolbar" role="tablist" aria-label="证据分类">
            {EVIDENCE_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={filter === item.key ? "active" : ""}
                onClick={() => switchFilter(item.key)}
              >
                <span>{item.label}</span>
                <b>{counts.get(item.key) ?? 0}</b>
                <small className="stu-duel-tooltip" role="tooltip">{item.description}</small>
              </button>
            ))}
          </div>
          {/* 武器分类筛选栏 */}
          <div className="stu-duel-weaponbar" role="tablist" aria-label="武器分类">
            {CAT_KEYS.map((cat) => (
              <button
                key={cat}
                type="button"
                className={weaponCatFilter === cat ? "active" : ""}
                onClick={() => switchWeapon(cat)}
              >
                <span>{CAT_LABEL[cat]}</span>
                <b>{counts.get(cat) ?? 0}</b>
              </button>
            ))}
          </div>
          {/* 网格卡片 */}
          <div className="stu-duel-grid">
            {pageRows.map((row) => {
              const entry = entryByMatchId.get(row.matchId);
              return (
                <article
                  key={row.id}
                  className="stu-duel-grid-card"
                  role={entry ? "button" : undefined}
                  tabIndex={entry ? 0 : undefined}
                  onClick={() => entry && onOpenMatch(entry.id, { roundNumber: row.roundNumber, tick: row.tick })}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && entry) { e.preventDefault(); onOpenMatch(entry.id, { roundNumber: row.roundNumber, tick: row.tick }); } }}
                >
                  <span className={`stu-duel-grid-badge stu-duel-grid-badge-${row.classification}`}>
                    {CLASS_TONE[row.classification] ?? duelClassificationLabel(row.classification)}
                  </span>
                  <div className="stu-duel-grid-info">
                    <b className="stu-duel-grid-killer">{row.killerName}</b>
                    <i className="stu-duel-grid-arrow">→</i>
                    <span className="stu-duel-grid-victim">{row.victimName}</span>
                  </div>
                  <small className="stu-duel-grid-meta">
                    {displayWeaponName(row.weapon)} · {row.mapName.replace(/^de_/, "")} R{row.roundNumber}
                  </small>
                  <div className="stu-duel-grid-ttk">
                    <div className="stu-duel-grid-ttk-track">
                      <div className={`stu-duel-grid-ttk-fill stu-duel-grid-ttk-${ttkTone(row) ?? "none"}`}
                        style={{ width: ttkBarWidth(row) }} />
                    </div>
                    <span className={`stu-duel-grid-ttk-label stu-duel-grid-ttk-${ttkTone(row) ?? "none"}`}>
                      {ttkLabel(row)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
          {/* 分页 */}
          {totalPages > 1 && (
            <nav className="stu-pagination" aria-label="分页">
              <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹</button>
              {Array.from({ length: Math.min(totalPages, 8) }, (_, i) => {
                const start = Math.max(0, Math.min(safePage - 3, totalPages - 8));
                return (
                  <button
                    key={start + i}
                    type="button"
                    className={safePage === start + i ? "active" : ""}
                    onClick={() => setPage(start + i)}
                  >
                    {start + i + 1}
                  </button>
                );
              })}
              <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>›</button>
              <span className="stu-pagination-info">{activeRows.length} 条 · {safePage + 1}/{totalPages} 页</span>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

/** TTK 值的展示颜色分类。 */
function ttkTone(row: DuelFinderRow): "ok" | "warn" | "danger" | undefined {
  if (row.ttkMs != null) return "ok";
  if (row.hpBucket === "low_hp") return "warn";
  if (row.thirdParty) return "danger";
  return undefined;
}

/** TTK 色条宽度（满宽度对应 1000ms，超过或补枪/低血量固定 100%）。 */
function ttkBarWidth(row: DuelFinderRow): string {
  if (row.ttkMs == null) return "100%";
  return `${Math.min(100, Math.round(row.ttkMs / 1000 * 100))}%`;
}
function MetricPill({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  return (
    <span className={`stu-duel-pill${tone ? ` stu-duel-pill-${tone}` : ""}`}>
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
  const mapNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const row of rows) seen.set(row.mapName, (seen.get(row.mapName) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [rows]);
  const [activeMap, setActiveMap] = useState<string | null>(null);
  const mapName = activeMap && mapNames.includes(activeMap) ? activeMap : mapNames[0] ?? "de_mirage";
  const mapRows = useMemo(() => rows.filter((row) => row.mapName === mapName), [rows, mapName]);
  const calibration = getMapCalibration(mapName);
  return (
    <section className="stu-duel-opening-layout">
      <div className="stu-card stu-duel-map-card">
        <h3>首杀位置</h3>
        <p className="stu-muted">每回合第一条击杀事件，落点取受害者死亡位置；点击点位跳到对应回合回放。</p>
        {mapNames.length > 1 && (
          <div className="stu-chip-row" role="tablist" aria-label="按地图筛选首杀位置">
            {mapNames.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={name === mapName}
                className={name === mapName ? "stu-chip stu-chip-active" : "stu-chip"}
                onClick={() => setActiveMap(name)}
              >
                {name.replace(/^de_/, "")}
              </button>
            ))}
          </div>
        )}
        <svg
          className="stu-duel-radar"
          viewBox={`0 0 ${calibration?.radarSize ?? 1024} ${calibration?.radarSize ?? 1024}`}
          role="img"
          aria-label={`${mapName} 首杀位置`}
        >
          {calibration && <image href={`./maps/radars/${mapName}.png`} width={calibration.radarSize} height={calibration.radarSize} opacity={0.88} />}
          {calibration && mapRows.slice(0, 80).map((row) => {
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

function explainDuelRow(row: DuelFinderRow): string {
  if (row.thirdParty) return "补枪：第三方在 ±2s 窗口内对受害者造成了关键伤害，TTK 不计入完整分布。";
  if (row.hpBucket === "low_hp") {
    const killer = row.killerHealthBefore == null ? "己方血量未知" : `己方 ${row.killerHealthBefore} HP`;
    return `低血量对决：交手时受害者 ${row.victimHealthBefore} HP，${killer}；保留证据但不计入 full HP TTK。`;
  }
  if (row.ttkMs === 0 && row.oneShotKill) {
    return row.classification === "contested_duel"
      ? "0ms 表示击杀者这一组第一枪就是致命伤；对手在判定窗口内有开枪或伤害，所以仍归为正面对枪。"
      : "0ms 表示击杀者这一组第一枪就是致命伤。";
  }
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
