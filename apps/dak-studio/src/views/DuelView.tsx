import { useCapabilityBlocked } from "../components/CapabilityBar";
import { EVIDENCE_FILTERS } from "../lib/analysis-display-labels";
import { canExportSnapshot } from "../lib/analysis-export";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../lib/queries/query-cache";
import { AnalysisExportButtons } from "../components/AnalysisExportButtons";
import { buildDuelAnalysisResult } from "../lib/analysis-export-duel";
import type { AnalysisExportSource } from "../lib/analysis-export";
import { filteredDuelRows, weaponCat, groupDuelMechanics } from "../lib/duel-export-projection";
import { flushSync } from "react-dom";
import { usePageReady } from "../lib/use-page-ready";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DuelFinderRow, DuelInsightsModel, PlayerMechanicsRow } from "@cs2dak/contract";
import { displayWeaponName, duelClassificationLabel } from "@cs2dak/presentation";
import { getMapCalibration, worldToRadar } from "@cs2dak/maps/calibration";
import { EmptyState, MetricInfo, Pagination } from "@cs2dak/react";
import { displayTeamName } from "../lib/team-identity";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/demo-entry";
import { getDuelInsights } from "../lib/queries/combat-queries";
import { type IdentityOptions } from "../lib/identity";

import type { DuelTab, EvidenceFilter, DuelPageState, WeaponCategory } from "../lib/analysis-theme-state";
import type { OpenEvidence } from "../lib/evidence-continuation";
import { projectDuelPlayer } from "../lib/analysis-view-projections";

export interface DuelViewProps {
  exportSource?: AnalysisExportSource | null;
  state: DuelPageState;
  onStateChange: (state: DuelPageState) => void;
  onOpenEvidence: OpenEvidence;
  playerSteamIds: readonly string[] | null;
  onPageReady?: (keys: string[]) => void;
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  selectedTeams: string[];
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
  teamRenames?: Record<string, string>;
}

const DUEL_TABS: Array<{ key: DuelTab; label: string }> = [
  { key: "records", label: "交火证据" },
  { key: "opening", label: "首次交火分布" },
  { key: "mechanics", label: "枪法机制" },
];

const CLASS_TONE: Record<string, string> = {
  contested_duel: "正面对枪击杀",
  suppressed_kill: "先手压制击杀",
  caught_off_guard: "无有效视野击杀"
};

export function DuelView({
  exportSource, state, onStateChange, onOpenEvidence, playerSteamIds,
  allEntries,
  entries,
  selectedTeams,
  onWatchDemo,
  onGoLibrary,
  identityOptions,
  teamRenames = {},
  onPageReady,
}: DuelViewProps) {
  const blocked = useCapabilityBlocked();
  const tab = state.tab;
  const [snapshot, setSnapshot] = useState<{ key: string; generation: number; value: DuelInsightsModel | null } | null>(null);
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const requestKey = JSON.stringify([entries.map(entry => entry.id), selectedTeams, identityOptions?.version]);
  const model = snapshot?.key === requestKey ? snapshot.value : null;
  const [error, setError] = useState<string | null>(null);
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);
  usePageReady(entries.length === 0 || model !== null || error !== null, onPageReady);

  useEffect(() => {
    if (entries.length === 0) {
      return;
    }
    if (analysis.status !== "ready") return;
    let cancelled = false;
    setError(null);
    getDuelInsights(entries, identityOptions, selectedTeams)
      .then((next) => {
        if (!cancelled) { assertAnalysisGeneration(analysis.generation); setSnapshot({ key: requestKey, generation: analysis.generation, value: next }); }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries, identityOptions?.version, selectedTeams, requestKey, analysis]);

  const projected = useMemo(() => model && playerSteamIds !== null ? projectDuelPlayer(model, playerSteamIds) : model, [model, playerSteamIds]);
  const summary = useMemo(() => projected ? summarizeDuels(projected) : null, [projected]);

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

  return (
    <div className="stu-view stu-duel-view">
      <header className="stu-view-header">
        <div>
          <h1>对枪</h1>
          {projected && exportSource && (playerSteamIds === null || playerSteamIds.length > 0) && !error && canExportSnapshot(snapshot, analysis) && <AnalysisExportButtons capture={() => buildDuelAnalysisResult(exportSource, projected, state, teamRenames)} />}
          <p>在同一分析上下文中查看交火证据、首次交火分布与枪法机制；指标只来自当前聚合范围。受压制或无有效视野的记录不自动代表选手失误。</p>
        </div>
      </header>
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
            <small>{summary.fullHealthRate == null ? "—" : `${summary.fullHealthRate.toFixed(1)}%`}</small>
          </div>
          <div>
            <span>中位击杀耗时</span>
            <strong>{summary.medianTtk == null ? "—" : `${summary.medianTtk}ms`}</strong>
            <small>击杀开火段第一枪 → 击杀</small>
          </div>
          <div>
            <span>正面对枪击杀样本</span>
            <strong>{summary.contestedDuels}</strong>
            <small>有来有回</small>
          </div>
        </section>
      )}

      <div className="stu-subtabs" role="tablist" aria-label="对枪">
          {DUEL_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? "stu-subtab stu-subtab-active" : "stu-subtab"}
              onClick={() => onStateChange({ ...state, tab: item.key })}
            >
              {item.label}
            </button>
          ))}
        </div>

      {playerSteamIds !== null && playerSteamIds.length === 0 && <p className="stu-muted">无法解析该选手的身份，无法筛选个人交火证据。</p>}
      {model && (error || analysis.status !== "ready" || snapshot?.generation !== analysis.generation) && <p className="stu-muted" role="status">{error || analysis.status === "error" ? "更新失败，显示旧版本结果。" : "正在更新，显示旧版本结果。"}</p>}
      {error && <EmptyState variant="error" title="分析失败" hint={error} />}
      {!error && entries.length === 0 && <div className="stu-compact-empty"><EmptyState variant="insufficient" title={blocked === "error" ? "分析数据暂不可用" : blocked ? "当前范围暂无可用比赛" : "聚合范围为空"} hint={blocked === "error" ? "请重试或查看上方状态。" : blocked ? "请查看上方原因和操作。" : "请调整聚合范围。"} /></div>}
      {!error && !model && entries.length > 0 && <div className="stu-loading">分析 {entries.length} 场 demo 的逐枪与伤害事件…</div>}

      {projected && tab === "records" && (
        <EvidenceCards rows={projected.duelRows} entryByMatchId={entryByMatchId} state={state} onStateChange={onStateChange} onOpenEvidence={onOpenEvidence} onWatchDemo={onWatchDemo} />
      )}

      {projected && tab === "mechanics" && (
        <>
          {projected.mechanicsRows.length === 0 ? (
            <div className="stu-card"><p className="stu-muted">当前范围缺少 shots.json，机制画像已隐藏。</p></div>
          ) : (
            <PlayerMechanicsGrid rows={projected.mechanicsRows} duelRows={projected.duelRows} teamRenames={teamRenames} page={state.mechanicsPage} onPageChange={page => onStateChange({ ...state, mechanicsPage: page })} />
          )}
          <DuelNotes notes={projected.notes} />
        </>
      )}

      {projected && tab === "opening" && (
        <OpeningDuelMap rows={projected.openingRows} entryByMatchId={entryByMatchId} state={state} onStateChange={onStateChange} onOpenEvidence={onOpenEvidence} onWatchDemo={onWatchDemo} />
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
    fullHealthRate: model.duelRows.length > 0 ? fullHealthDuels / model.duelRows.length * 100 : null,
    medianTtk,
    contestedDuels: model.duelRows.filter((row) => row.classification === "contested_duel").length
  };
}

function PlayerMechanicsGrid({
  rows,
  duelRows,
  teamRenames, page: mechPage, onPageChange: setMechPage
}: {
  page: number; onPageChange: (page: number) => void;
  rows: PlayerMechanicsRow[];
  duelRows: DuelFinderRow[];
  teamRenames: Record<string, string>;
}) {
  const grouped = useMemo(() => groupDuelMechanics(rows, duelRows), [rows, duelRows]);

  const MECHANICS_PAGE_SIZE = 12;
  const mechTotalPages = Math.max(1, Math.ceil(grouped.length / MECHANICS_PAGE_SIZE));
  const mechSafePage = Math.max(0, Math.min(mechPage, mechTotalPages - 1));
  useEffect(() => { if (mechPage !== mechSafePage) setMechPage(mechSafePage); }, [mechPage, mechSafePage, setMechPage]);
  const pagePlayers = grouped.slice(mechSafePage * MECHANICS_PAGE_SIZE, (mechSafePage + 1) * MECHANICS_PAGE_SIZE);

  return (
    <section className="stu-duel-player-grid-section">
      <Pagination
        page={mechSafePage}
        totalPages={mechTotalPages}
        onChange={setMechPage}
        className="stu-pagination"
        info={`${grouped.length} 人 · ${mechSafePage + 1}/${mechTotalPages} 页`}
      />
      <div className="stu-duel-player-grid">
      {pagePlayers.map((player) => {
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
              <div className="stu-duel-kill-count">
                <b>{player.duels.length}</b>
                <small>击杀</small>
              </div>
            </header>
            <div className="stu-duel-card-stats">
              <MetricPill label="主武器" value={topWeapon ? displayWeaponName(topWeapon.weapon) : "—"} />
              <MetricPill label="正面对枪击杀" value={String(contested)} />
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
      </div>
    </section>
  );
}

const CAT_KEYS: Array<WeaponCategory | "其他" | "全部"> = ["步枪", "狙击", "手枪", "冲锋枪", "霰弹机枪", "其他", "全部"];
const CAT_LABEL: Record<WeaponCategory | "其他" | "全部", string> = {
  步枪: "步枪", 狙击: "狙击", 手枪: "手枪", 冲锋枪: "冲锋枪", 霰弹机枪: "霰弹机枪", 其他: "其他", 全部: "全部"
};

/** 统一击杀耗时列标签：有合法数值显示数值，非满血 / 补枪干扰分别标注。 */
function ttkLabel(row: DuelFinderRow): string {
  if (row.ttkMs != null) return `${row.ttkMs}ms`;
  if (row.hpBucket === "low_hp") return "非满血";
  if (row.thirdParty) return "补枪干扰";
  return "—";
}

function EvidenceCards({
  rows,
  entryByMatchId,
  state, onStateChange, onOpenEvidence,
  onWatchDemo,
  compact = false,
  hoveredId,
  onHoverChange,
  pageSize = 48
}: {
  rows: DuelInsightsModel["duelRows"];
  entryByMatchId: Map<string, StudioDemoEntry>;
  state: DuelPageState; onStateChange: (state: DuelPageState) => void; onOpenEvidence: OpenEvidence;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  compact?: boolean;
  hoveredId?: string | null;
  onHoverChange?: (id: string | null) => void;
  pageSize?: number;
}) {
  const filter = compact ? "all" : state.evidenceFilter;
  const weaponCatFilter = compact ? "全部" : state.weaponCategory;
  const page = compact ? state.openingPage : state.recordPage;
  const setPage = (page: number) => onStateChange({ ...state, ...(compact ? { openingPage: page } : { recordPage: page }) });
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
  const activeRows = useMemo(() => filteredDuelRows(rows, filter, weaponCatFilter), [rows, filter, weaponCatFilter]);

  const totalPages = Math.max(1, Math.ceil(activeRows.length / perPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const pageRows = activeRows.slice(safePage * perPage, (safePage + 1) * perPage);
  const effectivePage = compact ? Math.max(0, Math.min(page, Math.max(0, Math.ceil(rows.length / perPage) - 1))) : safePage;
  useEffect(() => { if (page !== effectivePage) setPage(effectivePage); }, [page, effectivePage]);

  function switchFilter(next: EvidenceFilter) {
    onStateChange({ ...state, evidenceFilter: next, recordPage: 0 });
  }
  function switchWeapon(next: WeaponCategory | "其他" | "全部") {
    onStateChange({ ...state, weaponCategory: weaponCatFilter === next ? "全部" : next, recordPage: 0 });
  }

  const queueRows = compact ? rows : activeRows;
  const queue = queueRows.flatMap(row => {
    const entry = entryByMatchId.get(row.matchId);
    return entry ? [{ key: row.id, entryId: entry.id, evidence: row.evidence }] : [];
  });
  function openRow(row: DuelFinderRow) {
    const entry = entryByMatchId.get(row.matchId);
    if (!entry) return;
    flushSync(() => onStateChange({ ...state, selectedRowId: row.id }));
    onOpenEvidence({ entryId: entry.id, evidence: row.evidence, sourceKey: row.id, selectedKey: row.id, queue });
  }

  if (compact) {
    const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const pageRows = rows.slice(safePage * perPage, (safePage + 1) * perPage);
    return (
      <section className="stu-duel-evidence-wrap compact">
        <div className="stu-duel-evidence compact">
          {pageRows.map((row) => {
            const entry = entryByMatchId.get(row.matchId);
            const hovered = hoveredId === row.id || state.selectedRowId === row.id;
            const hp = row.killerHealthBefore != null ? `${row.killerHealthBefore}→${row.victimHealthBefore}` : `?→${row.victimHealthBefore}`;
            const matchLabel = entry ? `${entry.meta.teamAName} ${entry.meta.teamAScore}:${entry.meta.teamBScore} ${entry.meta.teamBName}` : row.mapName;
            return (
              <article
                key={row.id} id={row.id}
                className={`stu-duel-card-compact${hovered ? " stu-duel-card-hovered" : ""}`}
                onMouseEnter={() => onHoverChange?.(row.id)}
                onMouseLeave={() => onHoverChange?.(null)}
                role={entry ? "button" : undefined}
                tabIndex={entry ? 0 : undefined}
                onClick={() => entry && openRow(row)}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && entry) { e.preventDefault(); openRow(row); } }}
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
                    <button type="button" className="stu-button-sm" onClick={(e) => { e.stopPropagation(); openRow(row); }}>
                      回放
                    </button>
                  )}
                  {entry?.sourceDemPath && onWatchDemo && (
                    <button type="button" className="stu-button-sm" onClick={(e) => { e.stopPropagation(); onWatchDemo(entry.id, { roundNumber: row.roundNumber, tick: row.tick }); }}>
                      进游戏
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
        <Pagination page={safePage} totalPages={totalPages} onChange={setPage} maxButtons={6} className="stu-pagination" info={`${rows.length} 条`} />
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
                  key={row.id} id={row.id}
                  className={state.selectedRowId === row.id ? "stu-duel-grid-card stu-duel-card-hovered" : "stu-duel-grid-card"}
                  role={entry ? "button" : undefined}
                  tabIndex={entry ? 0 : undefined}
                  onClick={() => entry && openRow(row)}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && entry) { e.preventDefault(); openRow(row); } }}
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
                  {entry?.sourceDemPath && onWatchDemo && (
                    <button type="button" className="stu-button-sm" onClick={(e) => { e.stopPropagation(); onWatchDemo(entry.id, { roundNumber: row.roundNumber, tick: row.tick }); }}>
                      进游戏
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} className="stu-pagination" info={`筛选后 ${activeRows.length} 条 · 全部候选 ${rows.length} 条 · ${safePage + 1}/${totalPages} 页`} />
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

/** 击杀耗时色条宽度（满宽度对应 1000ms，超过或补枪干扰/非满血固定 100%）。 */
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
  state, onStateChange, onOpenEvidence,
  onWatchDemo
}: {
  state: DuelPageState; onStateChange: (state: DuelPageState) => void; onOpenEvidence: OpenEvidence;
  rows: DuelInsightsModel["openingRows"];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const LIST_PAGE_SIZE = 12;
  const mapNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const row of rows) seen.set(row.mapName, (seen.get(row.mapName) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [rows]);
  const activeMap = state.openingMapName;
  const mapName = activeMap && mapNames.includes(activeMap) ? activeMap : mapNames[0] ?? "de_mirage";
  const mapRows = useMemo(() => rows.filter((row) => row.mapName === mapName), [rows, mapName]);
  const queue = mapRows.flatMap(row => { const entry = entryByMatchId.get(row.matchId); return entry ? [{ key: row.id, entryId: entry.id, evidence: row.evidence }] : []; });
  function openRow(row: DuelFinderRow) {
    const entry = entryByMatchId.get(row.matchId);
    if (!entry) return;
    flushSync(() => onStateChange({ ...state, selectedRowId: row.id, openingPage: Math.floor(mapRows.findIndex(item => item.id === row.id) / LIST_PAGE_SIZE) }));
    onOpenEvidence({ entryId: entry.id, evidence: row.evidence, sourceKey: row.id, selectedKey: row.id, queue });
  }
  const calibration = getMapCalibration(mapName);
  // 地图 hover 时自动翻到对应页面
  useEffect(() => {
    if (!hoveredId) return;
    const idx = mapRows.findIndex((r) => r.id === hoveredId);
    if (idx >= 0) {
      const page = Math.floor(idx / LIST_PAGE_SIZE);
      if (page !== state.openingPage) onStateChange({ ...state, openingPage: page });
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
                onClick={() => onStateChange({ ...state, openingMapName: name, openingPage: 0 })}
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
                  if (entry) openRow(row);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  const entry = entryByMatchId.get(row.matchId);
                  if (entry) openRow(row);
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
          <span><i className="stu-duel-dot contested" />正面对枪击杀</span>
          <span><i className="stu-duel-dot outaimed" />先手压制</span>
          <span><i className="stu-duel-dot caught" />无有效视野击杀</span>
          <span><i className="stu-duel-dot-killer" />击杀方</span>
        </div>
      </div>
      <EvidenceCards rows={mapRows} entryByMatchId={entryByMatchId} state={state} onStateChange={onStateChange} onOpenEvidence={onOpenEvidence} onWatchDemo={onWatchDemo} compact hoveredId={hoveredId} onHoverChange={setHoveredId} pageSize={LIST_PAGE_SIZE} />
    </section>
  );
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
  if (key === "firstShotHit") return "干净交火开火段第一发命中 / 干净交火开火段数；排除第三方、穿烟和穿墙终结。";
  if (key === "sprayHit") return "干净全自动开火段长度 ≥5 时，从第 4 发起的命中率；排除第三方、穿烟和穿墙终结。";
  if (key === "counterStrafe") return "干净交火开火段中，开枪前确实在移动且开枪时已降到该武器判定用最大移动速度约 34% 以下的比例；AWP 按常见开镜开枪口径取 100u/s，其他开镜武器暂按基础移速口径展示。";
  if (key === "oneTap") return "在可一枪满血击杀的武器中，满血干净击杀是否由终结开火段的第一发直接完成。";
  if (key === "ttk") return "满血干净击杀中，击杀开火段第一枪到击杀的中位耗时，越低越好。";
  if (key === "reaction") return "敌人进入有效视野到首发开枪的中位耗时；受预瞄、架点、信息、动画与 demo tick 影响，不等同于人体反应速度。";
  if (key === "preaim") return "干净击杀中，捕获前 1~3 帧准星与目标三维夹角中位，附 ≤5° 比例。";
  if (key === "headshot") return "干净爆头击杀 / 干净击杀。";
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
