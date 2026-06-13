import { useEffect, useMemo, useState } from "react";
import type { DuelFinderRow, DuelInsightsModel, PlayerMechanicsRow } from "@cs2dak/contract";
import { displayWeaponName, duelClassificationLabel } from "@cs2dak/presentation";
import { getMapCalibration, worldToRadar } from "@cs2dak/maps";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { EmptyState, MetricInfo } from "../components/primitives";
import { displayTeamName } from "../lib/identity";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { getDuelInsights, type IdentityOptions } from "../lib/season";
import { Pagination } from "../components/Pagination";

type DuelTab = "records" | "opening" | "mechanics";
type EvidenceFilter = "contested_duel" | "suppressed_kill" | "caught_off_guard" | "low_hp" | "third_party" | "all";

const EVIDENCE_FILTERS: Array<{ key: EvidenceFilter; label: string; description: string }> = [
  { key: "contested_duel", label: "对枪胜出", description: "受害者造成伤害，或可见击杀者时开火" },
  { key: "suppressed_kill", label: "先手压制", description: "受害者死前获得过有效可见机会但没有有效还手" },
  { key: "caught_off_guard", label: "侧背身", description: "受害者死前没有获得有效可见机会" },
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
  identityOptions?: IdentityOptions;
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
  identityOptions,
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
    getDuelInsights(entries, identityOptions)
      .then((next) => {
        if (!cancelled) setModel(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries, identityOptions?.version]);

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
                  <div className="stu-duel-weapon-metrics">
                    {row.metrics.map((metric) => (
                      <MechanicsMetricItem key={metric.key} metric={metric} />
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
  compact = false,
  hoveredId,
  onHoverChange,
  page: controlledPage,
  onPageChange,
  pageSize = 48
}: {
  rows: DuelInsightsModel["duelRows"];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  compact?: boolean;
  hoveredId?: string | null;
  onHoverChange?: (id: string | null) => void;
  page?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
}) {
  const [filter, setFilter] = useState<EvidenceFilter>(compact ? "all" : "contested_duel");
  const [weaponCatFilter, setWeaponCatFilter] = useState<WeaponCategory | "其他" | "全部">("全部");
  const isControlled = controlledPage != null && onPageChange != null;
  const [internalPage, setInternalPage] = useState(0);
  const page = isControlled ? controlledPage : internalPage;
  const setPage = isControlled ? onPageChange : setInternalPage;
  const perPage = pageSize;

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
    const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
    const safePage = Math.min(page, Math.max(0, totalPages - 1));
    const pageRows = rows.slice(safePage * perPage, (safePage + 1) * perPage);
    return (
      <section className="stu-duel-evidence-wrap compact">
        <div className="stu-duel-evidence compact">
          {pageRows.map((row) => {
            const entry = entryByMatchId.get(row.matchId);
            const hovered = hoveredId === row.id;
            const hp = row.killerHealthBefore != null ? `${row.killerHealthBefore}→${row.victimHealthBefore}` : `?→${row.victimHealthBefore}`;
            const matchLabel = entry ? `${entry.meta.teamAName} ${entry.meta.teamAScore}:${entry.meta.teamBScore} ${entry.meta.teamBName}` : row.mapName;
            return (
              <article
                key={row.id}
                className={`stu-duel-card-compact${hovered ? " stu-duel-card-hovered" : ""}`}
                onMouseEnter={() => onHoverChange?.(row.id)}
                onMouseLeave={() => onHoverChange?.(null)}
                role={entry ? "button" : undefined}
                tabIndex={entry ? 0 : undefined}
                onClick={() => entry && onOpenMatch(entry.id, { roundNumber: row.roundNumber, tick: row.tick })}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && entry) { e.preventDefault(); onOpenMatch(entry.id, { roundNumber: row.roundNumber, tick: row.tick }); } }}
              >
                <div className="stu-duel-compact-row1">
                  <span className={`stu-duel-grid-badge stu-duel-grid-badge-${row.classification}`}>
                    {CLASS_TONE[row.classification] ?? duelClassificationLabel(row.classification)}
                  </span>
                  <span className="stu-duel-grid-info">
                    <b className="stu-duel-grid-killer">{row.killerName}</b>
                    <i className="stu-duel-grid-arrow">→</i>
                    <span className="stu-duel-grid-victim">{row.victimName}</span>
                  </span>
                  <span className="stu-duel-compact-weapon">{displayWeaponName(row.weapon)}</span>
                  <span className="stu-duel-compact-hp">{hp}</span>
                  {entry && (
                    <button type="button" className="stu-button-sm" onClick={(e) => { e.stopPropagation(); onOpenMatch(entry.id, { roundNumber: row.roundNumber, tick: row.tick }); }}>
                      回放
                    </button>
                  )}
                </div>
                <div className="stu-duel-compact-row2">
                  <span className="stu-duel-compact-match">{matchLabel}</span>
                  <span className="stu-duel-compact-round">R{row.roundNumber}</span>
                  {row.roundTimeLabel && <span className="stu-duel-compact-clock">{row.roundTimeLabel}</span>}
                  {row.oneShotKill && <span className="stu-duel-compact-oneshot">一发</span>}
                </div>
              </article>
            );
          })}
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} maxButtons={6} info={`${rows.length} 条`} />
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
          <Pagination page={page} totalPages={totalPages} onChange={setPage} info={`${activeRows.length} 条 · ${safePage + 1}/${totalPages} 页`} />
        </>
      )}
    </section>
  );
}

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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [listPage, setListPage] = useState(0);
  const LIST_PAGE_SIZE = 12;
  const mapNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const row of rows) seen.set(row.mapName, (seen.get(row.mapName) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [rows]);
  const [activeMap, setActiveMap] = useState<string | null>(null);
  const mapName = activeMap && mapNames.includes(activeMap) ? activeMap : mapNames[0] ?? "de_mirage";
  const mapRows = useMemo(() => rows.filter((row) => row.mapName === mapName), [rows, mapName]);
  const calibration = getMapCalibration(mapName);
  // 地图 hover 时自动翻到对应页面
  useEffect(() => {
    if (!hoveredId) return;
    const idx = mapRows.findIndex((r) => r.id === hoveredId);
    if (idx >= 0) {
      setListPage(Math.floor(idx / LIST_PAGE_SIZE));
    }
  }, [hoveredId, mapRows]);
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
            const victimP = worldToRadar(row.victimPosition, calibration);
            const killerP = row.killerPosition ? worldToRadar(row.killerPosition, calibration) : null;
            const hovered = hoveredId === row.id;
            return (
              <g
                key={row.id}
                className={`stu-duel-map-point stu-duel-map-point-${row.classification}${hovered ? " stu-duel-map-point-hovered" : ""}`}
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
                onMouseEnter={() => setHoveredId(row.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(row.id)}
                onBlur={() => setHoveredId(null)}
              >
                <title>{`R${row.roundNumber} ${row.killerName} > ${row.victimName}`}</title>
                {killerP && (
                  <>
                    <line x1={killerP.x} y1={killerP.y} x2={victimP.x} y2={victimP.y} className="stu-duel-killline" />
                    <circle cx={killerP.x} cy={killerP.y} r={4} className="stu-duel-map-point-killer" />
                  </>
                )}
                <circle cx={victimP.x} cy={victimP.y} r={10} className="stu-duel-map-point-ring" />
                <circle cx={victimP.x} cy={victimP.y} r={5} className="stu-duel-map-point-core" />
              </g>
            );
          })}
        </svg>
        <div className="stu-duel-legend">
          <span><i className="stu-duel-dot contested" />对枪胜出</span>
          <span><i className="stu-duel-dot outaimed" />先手压制</span>
          <span><i className="stu-duel-dot caught" />侧背身</span>
          <span><i className="stu-duel-dot-killer" />击杀方</span>
        </div>
      </div>
      <EvidenceCards rows={mapRows} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} compact hoveredId={hoveredId} onHoverChange={setHoveredId} page={listPage} onPageChange={setListPage} pageSize={LIST_PAGE_SIZE} />
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

/** 主数值：null 显示 —，否则保留一位小数加单位。 */
function formatMetricValue(metric: PlayerMechanicsRow["metrics"][number]): string {
  if (metric.value == null) return "—";
  return `${metric.value.toFixed(1)}${metric.unit ?? ""}`;
}

/** 证据：命中率类附 (分子/分母)，中位类附样本数，外加 detail（如 ≤5° 比例 / 非自动武器）。 */
function formatMetricEvidence(metric: PlayerMechanicsRow["metrics"][number]): string {
  const parts: string[] = [];
  if (metric.attempts != null && metric.attempts > 0) parts.push(`${metric.successes ?? 0}/${metric.attempts}`);
  else if (metric.sampleSize != null && metric.sampleSize > 0) parts.push(`n=${metric.sampleSize}`);
  if (metric.detail) parts.push(metric.detail);
  return parts.length > 0 ? ` (${parts.join(" · ")})` : "";
}

function MechanicsMetricItem({ metric }: { metric: PlayerMechanicsRow["metrics"][number] }) {
  const evidence = formatMetricEvidence(metric).replace(/^\s*\(|\)$/g, "");
  return (
    <div className="stu-duel-metric-item">
      <span>{metric.label}<MetricInfo note={metricInfoNote(metric.key)} /></span>
      <b>{formatMetricValue(metric)}</b>
      {evidence && <small>{evidence}</small>}
      {!evidence && metric.percentileLabel && <small>{metric.percentileLabel}</small>}
    </div>
  );
}

function metricInfoNote(key: string): string {
  if (key === "firstShotHit") return "clean combat burst 第一发命中 / clean combat burst 数；排除第三方、穿烟和穿墙终结。";
  if (key === "sprayHit") return "clean 全自动 burst≥5 的第 4 发起命中率；排除第三方、穿烟和穿墙终结。";
  if (key === "counterStrafe") return "clean combat burst 中，开枪前确实在移动且开枪时已降到武器站立精准速度内的比例。";
  if (key === "oneTap") return "可一枪满血终结武器中，clean 满血击杀的 lethal burst 仅一发比例。";
  if (key === "ttk") return "clean 满血击杀的 lethal burst 第一枪到击杀中位耗时，越低越好。";
  if (key === "reaction") return "clean 击杀中，敌人进入有效视野(锥+静态LOS+无烟+未被闪)到首发开枪的中位耗时；首发即击杀用上一帧仍存活的可见状态。";
  if (key === "preaim") return "clean 击杀中，捕获前 1~3 帧准星与目标三维夹角中位，附 ≤5° 比例。";
  if (key === "headshot") return "clean 爆头击杀 / clean 击杀。";
  if (key === "killsPerMatch") return "该武器击杀数 / 选手参与场数。";
  return "当前范围百分位，不输出 A/B/C。";
}

function DuelNotes({ notes }: { notes: string[] }) {
  return (
    <div className="stu-duel-notes">
      {notes.map((note) => <span key={note}>ⓘ {note}</span>)}
    </div>
  );
}
