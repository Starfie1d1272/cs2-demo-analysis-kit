import { AnalysisExportButtons } from "../../components/AnalysisExportButtons";
import { buildPatternsAnalysisResult } from "../../lib/analysis-export-patterns";
import type { AnalysisExportSource } from "../../lib/analysis-export";
import { patternFingerprint } from "../../lib/pattern-observations";
import type { PatternExplorerState } from "../../lib/pattern-page-state";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../../lib/queries/query-cache";
import { createReplayViewState, normalizeReplayViewState, type ReplayViewState } from "@cs2dak/presentation";
import { STUDIO_TABLE_CLASSES } from "../../components/table-styles";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject, type Dispatch, type SetStateAction } from "react";
import type { MatchWorkspaceModel } from "@cs2dak/presentation";
import { ReplayViewer } from "@cs2dak/react/replay";
import { economyLabelCn, formatClockSeconds, ECONOMY_ENTRY_CN, formatEntryEvidenceLabel, formatTacticalClusterShortName } from "@cs2dak/presentation";
import { calloutCn, buildLineupClusters, type LineupGrenadeLike } from "@cs2dak/maps";
import type { EconomyEntry } from "@cs2dak/tactics";
import { formatTacticalClusterName as autoName } from "@cs2dak/presentation";
import type { TacticalCluster } from "@cs2dak/tactics";
import type { TacticalRoundFact } from "@cs2dak/tactics";
import { loadMatchWorkspaceModel } from "../../lib/match-workspace-loader.js";
import { type StudioDemoEntry } from "../../lib/demo-entry.js";
import { MetricInfo, EvidenceLink, DataTable, type DataTableColumn } from "@cs2dak/react";

export interface PatternExplorerProps {
  exportSource?: AnalysisExportSource | null;
  patternNames?: Record<string, string>;
  state: PatternExplorerState;
  onStateChange: Dispatch<SetStateAction<PatternExplorerState>>;
  clusters: TacticalCluster[];
  facts: TacticalRoundFact[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onAddToPlaylist?: (cluster: TacticalCluster, fact: TacticalRoundFact) => void;
  /** 回放缓存：传入则与上层复用；未传时组件生命周期内保持同一个缓存。 */
  replayModelCache?: Map<string, MatchWorkspaceModel>;
}

export function PatternExplorer({ exportSource, patternNames = {}, state, onStateChange, clusters, facts, entryByMatchId, onOpenMatch, onWatchDemo, onAddToPlaylist, replayModelCache }: PatternExplorerProps) {
  const { mapName, side, economyEntry: econ, clusterId: selectedId, selectedFactKey: selectedEvidenceKey } = state;
  const maps = useMemo(() => [...new Set(clusters.map(c => c.mapName))].sort(), [clusters]);
  const setSide = (side: "t" | "ct") => onStateChange(current => ({ ...current, side, clusterId: null, selectedFactKey: null }));
  const setEcon = (economyEntry: EconomyEntry | "all") => onStateChange(current => ({ ...current, economyEntry, clusterId: null, selectedFactKey: null }));
  const setSelectedEvidenceKey = (selectedFactKey: string | null) => onStateChange(current => ({ ...current, selectedFactKey }));
  const localReplayCache = useRef(new Map<string, MatchWorkspaceModel>());
  const replayCache = replayModelCache ?? localReplayCache.current;
  const replayMainRef = useRef<HTMLDivElement | null>(null);
  const [replayHeight, setReplayHeight] = useState<number | null>(null);

  const sideCounts = useMemo(() => ({
    t: clusters.filter((c) => c.side === "t").length,
    ct: clusters.filter((c) => c.side === "ct").length,
  }), [clusters]);

  // 保留当前所选经济档，即使新数据里没有样本。
  const econOptions = useMemo(() => {
    const present = new Set(clusters.filter((c) => c.side === side).map((c) => c.economyEntry));
    return (["pistol", "gun", "anti_eco", "force", "semi", "eco"] as EconomyEntry[]).filter((e) => present.has(e) || e === econ);
  }, [clusters, side, econ]);
  const effectiveEcon = econ;

  const visibleClusters = useMemo(
    () => clusters.filter((c) => c.side === side && (mapName === null || c.mapName === mapName) && (effectiveEcon === "all" || c.economyEntry === effectiveEcon)),
    [clusters, side, mapName, effectiveEcon]
  );

  // 双层分组：大分类（打A/打B…）→ 小聚类（具体站位/结构）。
  const groupedClusters = useMemo(() => {
    const groups = new Map<string, TacticalCluster[]>();
    for (const c of visibleClusters) {
      const cat = c.primaryCategory;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(c);
    }
    return [...groups.entries()];
  }, [visibleClusters]);

  // 初次进入可展示首项；已选择的模式失效时不切换到其他模式。
  const selected = useMemo(
    () => selectedId === null ? visibleClusters[0] ?? null : visibleClusters.find((c) => c.id === selectedId) ?? null,
    [visibleClusters, selectedId]
  );

  const selectedFacts = useMemo(() => {
    if (!selected) return [];
    return facts.filter(
      (f) => f.side === selected.side &&
        f.mapName === selected.mapName &&
        selected.rounds.some((r) => r.matchId === f.matchId && r.roundNumber === f.roundNumber)
    );
  }, [selected, facts]);
  const activeFact = useMemo(
    () => selectedEvidenceKey === null ? selectedFacts[0] ?? null : selectedFacts.find((fact) => evidenceKey(fact) === selectedEvidenceKey) ?? null,
    [selectedFacts, selectedEvidenceKey]
  );

  useEffect(() => {
    const node = replayMainRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setReplayHeight((current) => current === next ? current : next);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeFact]);

  if (clusters.length === 0) {
    return <div className="stu-coach-pattern-explorer stu-empty">暂无聚类数据，请导入更多 demo。</div>;
  }

  return (
    <div className="stu-pe-shell">
      {exportSource && selected && <AnalysisExportButtons capture={() => buildPatternsAnalysisResult(exportSource, selected, selectedFacts, { section: "patterns", explorer: state }, patternNames[patternFingerprint(selected)] ?? null)} />}
      <label>地图 <select className="stu-select" value={mapName ?? ""} onChange={event => onStateChange(current => ({ ...current, mapName: event.target.value || null, clusterId: null, selectedFactKey: null }))}>
        <option value="">全部地图</option>{maps.map(map => <option key={map} value={map}>{map}</option>)}
      </select></label>
      <div className="stu-subtabs stu-pe-econ-filter" role="tablist" aria-label="经济入口筛选">
        <button
          type="button"
          role="tab"
          aria-selected={effectiveEcon === "all"}
          className={effectiveEcon === "all" ? "stu-subtab stu-subtab-active" : "stu-subtab"}
          onClick={() => setEcon("all")}
        >
          全部
        </button>
        {econOptions.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={effectiveEcon === entry}
            className={effectiveEcon === entry ? "stu-subtab stu-subtab-active" : "stu-subtab"}
            onClick={() => setEcon(entry)}
          >
            {ECONOMY_ENTRY_CN[entry]}
          </button>
        ))}
      </div>
      <div className="stu-subtabs stu-pe-side-toggle" role="tablist" aria-label="进攻/防守视角">
        <button
          type="button"
          role="tab"
          aria-selected={side === "t"}
          className={side === "t" ? "stu-subtab stu-subtab-active" : "stu-subtab"}
          onClick={() => setSide("t")}
        >
          T 进攻视角（{sideCounts.t}）
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={side === "ct"}
          className={side === "ct" ? "stu-subtab stu-subtab-active" : "stu-subtab"}
          onClick={() => setSide("ct")}
        >
          CT 防守视角（{sideCounts.ct}）
        </button>
      </div>
      {visibleClusters.length === 0 ? (
        <div className="stu-coach-pattern-explorer stu-empty">
          当前经济条件暂无样本。该视角下暂无聚类（{side === "t" ? "T" : "CT"} 方）。切换到另一视角，或导入更多 demo。
        </div>
      ) : (
        <div className="stu-coach-pattern-explorer">
          {selectedId !== null && !selected && <div className="stu-notice" role="status">所选模式已不可用，请重新选择。</div>}
          {/* 左栏：大分类 → 小聚类双层列表 */}
          <aside className="stu-pe-list" style={replayHeight ? { height: replayHeight } : undefined}>
            {groupedClusters.map(([category, cats]) => (
              <div key={category} className="stu-pe-group">
                <div className="stu-pe-group-header">{category}</div>
                {cats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={c.id === selected?.id ? "stu-pe-cluster stu-pe-cluster-active" : "stu-pe-cluster"}
                    onClick={() => {
                      onStateChange(current => ({ ...current, clusterId: c.id, selectedFactKey: null, evidenceTable: { ...current.evidenceTable, page: 0 } }));
                    }}
                  >
                    <span className="stu-pe-cluster-name">
                      {formatTacticalClusterShortName(c)}
                    </span>
                    <span className="stu-pe-cluster-meta">
                      <span>{c.roundCount} 回合</span>
                      <span>{c.winRatePercent != null ? `${c.winRatePercent.toFixed(1)}%` : "—"}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          {/* 中栏：常驻统一回放。模式与证据选择只改变它的当前回合。 */}
          <CoachReplayStage fact={activeFact} entryByMatchId={entryByMatchId} cache={replayCache} mainRef={replayMainRef} savedSource={state.replaySource} savedReplay={state.replay} onReplayChange={(replaySource, replay) => onStateChange(current => ({ ...current, replaySource, replay }))} />

          {/* 右栏：数据摘要 + 证据回合 */}
          <div className="stu-pe-detail">
            {selected && (
              <>
                <ClusterSummary cluster={selected} facts={selectedFacts} />
                <EvidenceTable
                  cluster={selected}
                  tableState={state.evidenceTable}
                  onTableStateChange={evidenceTable => onStateChange(current => ({ ...current, evidenceTable }))}
                  facts={selectedFacts}
                  entryByMatchId={entryByMatchId}
                  activeFact={activeFact}
                  onOpenMatch={onOpenMatch}
                  onWatchDemo={onWatchDemo}
                  onSelect={setSelectedEvidenceKey}
                  onAddToPlaylist={onAddToPlaylist}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


async function loadReplayModel(demoId: string | null, cache: Map<string, MatchWorkspaceModel>, generation: number): Promise<MatchWorkspaceModel> {
  assertAnalysisGeneration(generation);
  if (!demoId) throw new Error("本场没有可用回放，请重新导入或重建该场。");
  for (const key of cache.keys()) if (!key.startsWith(`${generation}:`)) cache.delete(key);
  const key = `${generation}:${demoId}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const model = await loadMatchWorkspaceModel(demoId);
  assertAnalysisGeneration(generation);
  cache.set(key, model);
  while (cache.size > 5) cache.delete(cache.keys().next().value!);
  return model;
}

/** 教练页常驻回放主画布：只按当前证据的 matchId 懒加载单场 workspace。 */
function CoachReplayStage({ fact, entryByMatchId, cache, mainRef, savedSource, savedReplay, onReplayChange }: {
  fact: TacticalRoundFact | null;
  savedSource: string | null;
  savedReplay: ReplayViewState | null;
  onReplayChange: (source: string, state: ReplayViewState) => void;
  entryByMatchId: Map<string, StudioDemoEntry>;
  cache: Map<string, MatchWorkspaceModel>;
  mainRef?: RefObject<HTMLDivElement | null>;
}) {
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  useEffect(() => subscribeAnalysisDataInvalidation(() => { if (getAnalysisDataSnapshot().status !== "ready") cache.clear(); }), [cache]);
  const matchId = fact?.matchId ?? null;
  const entryId = matchId ? entryByMatchId.get(matchId)?.id : undefined;
  const cachedModel = entryId && analysis.status === "ready" ? cache.get(`${analysis.generation}:${entryId}`) ?? null : null;
  const [loaded, setLoaded] = useState<{ matchId: string; generation: number; model: MatchWorkspaceModel } | null>(
    matchId && cachedModel ? { matchId, generation: analysis.generation, model: cachedModel } : null
  );
  const [error, setError] = useState<string | null>(null);
  const model = loaded?.matchId === matchId && loaded.generation === analysis.generation && analysis.status === "ready" && entryId ? loaded.model : null;
  const [replay, setReplay] = useState<{ source: string; matchId: string; state: ReplayViewState } | null>(null);
  const source = fact ? evidenceKey(fact) : null;
  useEffect(() => {
    if (analysis.status !== "ready") return;
    if (!model || !fact || !source) { setReplay(null); return; }
    const round = model.replay.rounds.find(r => r.roundNumber === fact.roundNumber);
    const initial = createReplayViewState(model.replay, model.map.view);
    setReplay(previous => {
      const state = round && initial ? normalizeReplayViewState(model.replay, model.map.view, {
        ...(savedSource === source && savedReplay ? savedReplay : previous?.matchId === fact.matchId ? previous.state : initial),
        roundNumber: round.roundNumber, tick: savedSource === source && savedReplay ? savedReplay.tick : round.freezeEndTick + 20 * (model.replay.tickrate ?? 64), playing: false,
      }) : null;
      return state ? { source, matchId: fact.matchId, state } : null;
    });
  }, [model, fact?.matchId, fact?.roundNumber, source, analysis.status]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!matchId || !entryId || analysis.status !== "ready") {
      setLoaded(null);
      return () => { cancelled = true; };
    }
    for (const key of cache.keys()) if (!key.startsWith(`${analysis.generation}:`)) cache.delete(key);
    const nextCached = cache.get(`${analysis.generation}:${entryId}`);
    setLoaded(nextCached ? { matchId, generation: analysis.generation, model: nextCached } : null);
    loadReplayModel(entryId, cache, analysis.generation)
      .then((nextModel) => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setLoaded({ matchId, generation: analysis.generation, model: nextModel }); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [matchId, entryId, cache, analysis.generation, analysis.status]);

  if (!fact) return <div ref={mainRef} className="stu-pe-replay-main stu-pe-radar-empty">所选回合不可用，请从证据回合中重新选择。</div>;
  const entry = entryByMatchId.get(fact.matchId);
  const label = entry
    ? `${entry.meta.teamAName} vs ${entry.meta.teamBName} · R${fact.roundNumber}`
    : `${fact.teamName} vs ${fact.opponentName} · R${fact.roundNumber}`;

  return (
    <div ref={mainRef} className="stu-pe-replay-main">
      <div className="stu-pe-replay-bar">
        <span className="stu-pe-replay-kicker">示例回合</span>
        <span className="stu-pe-replay-label">{label}</span>
      </div>
      {error ? (
        <div className="stu-pe-radar-empty">{error}</div>
      ) : !model ? (
        <div className="stu-loading">读取本地回放…</div>
      ) : !model.replay.available || !model.replay.rounds.some(r => r.roundNumber === fact.roundNumber) ? (
        <div className="stu-pe-radar-empty">本场导出未附带 2D 回放流。</div>
      ) : replay?.source !== source ? (
        <div className="stu-loading">准备示例回合…</div>
      ) : (
        <div className="stu-pe-replay-frame">
          <ReplayViewer
            replay={model.replay}
            map={model.map.view}
            state={replay.state}
            onStateChange={(state) => { if (!state || !source) return; setReplay(current => current?.source === source ? { ...current, state } : current); onReplayChange(source, { ...state, playing: false }); }}
          />
        </div>
      )}
    </div>
  );
}

function ClusterSummary({ cluster, facts }: { cluster: TacticalCluster; facts: TacticalRoundFact[] }) {
  const plantCount = facts.filter((f) => f.plant != null).length;
  const firstKillCount = facts.filter((f) => f.firstKillForTeam === true).length;
  const firstKillValid = facts.filter((f) => f.firstKillForTeam !== null).length;

  const ecoCounts = facts.reduce<Record<string, number>>((acc, f) => {
    acc[f.economy] = (acc[f.economy] ?? 0) + 1;
    return acc;
  }, {});

  const execMedian = (() => {
    const vals = facts.map((f) => f.executeRemainSec).filter((v): v is number => v != null).sort((a, b) => a - b);
    if (vals.length === 0) return null;
    return vals[Math.floor(vals.length / 2)] ?? null;
  })();

  const isT = cluster.side === "t";
  // 道具落点：命中目标点的烟/火按落点空间聚类（buildLineupClusters），开销较大，对 facts/cluster 加 memo。
  const utilityLanding = useMemo(
    () => isT ? buildUtilityLanding(facts, cluster.mapName) : null,
    [isT, facts, cluster.mapName],
  );
  const pressureLabels = [...new Map(
    facts.flatMap((fact) => fact.openingPressure).map((event) => [
      `${event.calloutLabel}:${event.kind}`,
      `${event.calloutLabel}${event.kind === "deep" ? "（深入）" : "（前压）"}`
    ])
  ).values()];

  // C4 首尾方向只作轨迹事实，不自动命名“转点”。
  const c4Routes = facts.map((f) => f.c4Route).filter((r): r is NonNullable<typeof r> => r != null);
  const c4Rotated = c4Routes.filter((r) => r.rotated).length;
  const c4EndCounts = c4Routes.reduce<Record<string, number>>((acc, r) => {
    if (r.endRegion) acc[r.endRegion] = (acc[r.endRegion] ?? 0) + 1;
    return acc;
  }, {});
  const c4MainEnd = Object.entries(c4EndCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return (
    <div className="stu-pe-summary">
      <h3 className="stu-pe-summary-title">{autoName(cluster)} <small>（事实簇）</small></h3>
      <dl className="stu-pe-stats">
        <div>
          <dt>样本</dt>
          <dd>{cluster.roundCount} 回合</dd>
        </div>
        <div>
          <dt>胜率 <MetricInfo note="该模式证据回合中赢得回合的比例" /></dt>
          <dd>{cluster.winRatePercent != null ? `${cluster.winRatePercent.toFixed(1)}%` : "—"}</dd>
        </div>
        <div>
          <dt>{isT ? "下包率" : "对手下包率"} <MetricInfo note={isT ? "本方成功下包的证据回合比例" : "该防守模式下对手成功下包的证据回合比例"} /></dt>
          <dd>{facts.length > 0 ? `${((plantCount / facts.length) * 100).toFixed(1)}%` : "—"}</dd>
        </div>
        {isT && (
          <div>
            <dt>进点时间（中位）<MetricInfo note="第二名队员进入目标包点时的 1:55 回合倒计时中位数" /></dt>
            <dd>{execMedian != null ? formatClockSeconds(execMedian) : "—"}</dd>
          </div>
        )}
        <div>
          <dt>首杀率 <MetricInfo note="该模式中本方拿到回合首杀的比例；没有击杀的回合不进入分母" /></dt>
          <dd>{firstKillValid > 0 ? `${((firstKillCount / firstKillValid) * 100).toFixed(1)}%` : "—"}</dd>
        </div>
        <div>
          <dt>开局推进 <MetricInfo note="离开默认位后进入前压/控图区的深度；深入表示已进入对方默认位覆盖区域。" /></dt>
          <dd>{pressureLabels.length > 0 ? pressureLabels.slice(0, 3).join(" / ") : "—"}</dd>
        </div>
        {isT && c4Routes.length > 0 && (
          <div>
            <dt>C4 轨迹末端 <MetricInfo note="按 C4 携带者轨迹末端区域多数表决；跨方向只描述轨迹首尾经过不同 A/B 方向，不等同于战术转点" /></dt>
            <dd>{c4MainEnd ? c4MainEnd.toUpperCase() : "—"}{c4Rotated > 0 ? ` · 跨方向 ${c4Rotated}/${c4Routes.length}` : ""}</dd>
          </div>
        )}
      </dl>
      {Object.keys(ecoCounts).length > 0 && (
        <div className="stu-pe-eco">
          <span className="stu-pe-eco-label">经济分布：</span>
          {Object.entries(ecoCounts).map(([eco, n]) => (
            <span key={eco} className="stu-pe-eco-item">{economyLabelCn(eco)} {n}</span>
          ))}
        </div>
      )}
      {isT && (
        <div className="stu-pe-eco">
          <span className="stu-pe-eco-label">
            常见进点路线 <MetricInfo note="只统计有真实目标点与进点口判定的回合；进点路线不参与聚类身份" />
          </span>
          {cluster.entryEvidence.routes.length > 0 ? cluster.entryEvidence.routes.slice(0, 5).map((route) => (
            <span key={`${route.site}:${route.combo}`} className="stu-pe-eco-item">
              {route.site.toUpperCase()} · {formatEntryEvidenceLabel(cluster.mapName, route.site, route.combo)} {route.roundCount} 回合（{route.percentOfCovered.toFixed(1)}%）
            </span>
          )) : <span className="stu-pe-eco-item">—</span>}
          <span className="stu-pe-eco-item">覆盖 {cluster.entryEvidence.coveredRounds}/{cluster.entryEvidence.totalRounds}（{cluster.entryEvidence.coveragePercent.toFixed(1)}%）</span>
        </div>
      )}
      {utilityLanding && (utilityLanding.smoke.length > 0 || utilityLanding.fire.length > 0) && (
        <div className="stu-pe-eco">
          <span className="stu-pe-eco-label">
            目标点道具落点 <MetricInfo note="这些回合中命中目标点的烟与火，按落点 callout 计数（grid 解析，仅展示不参与聚类）；当前事实没有可靠的统一秒制执行窗口，因此不按 tick 猜测过滤" />
          </span>
          {utilityLanding.smoke.length > 0 && (
            <span className="stu-pe-eco-item">烟：{utilityLanding.smoke.map((s) => `${s.cn}×${s.n}`).join(" / ")}</span>
          )}
          {utilityLanding.fire.length > 0 && (
            <span className="stu-pe-eco-item">火：{utilityLanding.fire.map((s) => `${s.cn}×${s.n}`).join(" / ")}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 目标点道具落点聚合：保留"落点大区 == 本回合目标包点"的过滤，烟与火分别用
 * 验证过的 buildLineupClusters 做 loose 空间聚类（按落点合并近似点位，
 * 落点 callout 走多数表决），再按簇内回合数排序取 Top。
 */
function buildUtilityLanding(facts: TacticalRoundFact[], mapName: string) {
  const normType = (t: string): "smoke" | "fire" | "other" => {
    const s = t.toLowerCase();
    if (s.includes("smoke")) return "smoke";
    if (s.includes("molot") || s.includes("incend") || s.includes("fire")) return "fire";
    return "other";
  };
  const buckets: { smoke: LineupGrenadeLike[]; fire: LineupGrenadeLike[] } = { smoke: [], fire: [] };
  for (const f of facts) {
    const site = f.targetSite;
    if (!site) continue;
    for (const g of f.grenades ?? []) {
      if (g.targetRegion !== site) continue;
      const kind = normType(g.type);
      if (kind === "other") continue;
      // 教练 fact 的 grenade 已带 3D 投掷/落点与 effectCallout，直接构造 LineupGrenadeLike；
      // throwerIndex / freezeEndTick 此处不参与展示（不算 winRate / 投掷时间桶），置 0 即可。
      buckets[kind].push({
        roundNumber: f.roundNumber,
        grenade: g.type,
        throwerIndex: 0,
        throwTick: g.throwTick,
        throwPosition: g.throwPosition,
        effectPosition: g.effectPosition,
        entryId: f.matchId,
        freezeEndTick: 0,
        effectCallout: g.effectCallout,
      });
    }
  }
  const top = (grenades: LineupGrenadeLike[]) =>
    buildLineupClusters({ mapName, grenades, mode: "loose" })
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map((c) => ({
        cn: (c.effectCallout ? calloutCn(mapName, c.effectCallout) : "") || c.effectCallout || "未知",
        n: c.count,
      }));
  return { smoke: top(buckets.smoke), fire: top(buckets.fire) };
}

function EvidenceTable({
  tableState, onTableStateChange,
  cluster,
  facts,
  entryByMatchId,
  activeFact,
  onOpenMatch,
  onWatchDemo,
  onSelect,
  onAddToPlaylist,
}: {
  cluster: TacticalCluster;
  tableState: import("@cs2dak/presentation").TableState;
  onTableStateChange: (state: import("@cs2dak/presentation").TableState) => void;
  facts: TacticalRoundFact[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  activeFact: TacticalRoundFact | null;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onSelect: (key: string) => void;
  onAddToPlaylist?: (cluster: TacticalCluster, fact: TacticalRoundFact) => void;
}) {
  const PAGE_SIZE = 12;

  // 预建 fact 查找表，避免每列每行重复线性扫描
  const factByRound = useMemo(
    () => new Map(facts.map((f) => [`${f.matchId}-${f.roundNumber}`, f] as const)),
    [facts],
  );
  const findFact = (r: { matchId: string; roundNumber: number }) =>
    factByRound.get(`${r.matchId}-${r.roundNumber}`);

  const columns = useMemo<DataTableColumn<TacticalCluster["rounds"][number]>[]>(() => [
    {
      key: "match", label: "比赛",
      render: (r) => {
        const fact = findFact(r);
        const entry = entryByMatchId.get(r.matchId);
        const label = entry ? `${entry.meta.teamAName} vs ${entry.meta.teamBName}` : r.matchId.length > 18 ? `${r.matchId.slice(0, 18)}…` : r.matchId;
        return (
          <button
            type="button"
            className="stu-pe-evidence-select"
            onClick={() => fact && onSelect(evidenceKey(fact))}
            disabled={!fact}
            aria-label={`查看 ${label} 第 ${r.roundNumber} 回合`}
            title={r.matchId}
          >
            {label}
          </button>
        );
      }
    },
    { key: "round", label: "回合", numeric: true, format: (r) => `R${r.roundNumber}` },
    { key: "economy", label: "经济", format: (r) => economyLabelCn(r.economy) },
    {
      key: "executeRemain", label: "执行剩余", numeric: true,
      format: (r) => {
        const fact = findFact(r);
        return fact?.executeRemainSec != null ? formatClockSeconds(fact.executeRemainSec) : "—";
      }
    },
    {
      key: "firstKill", label: "首杀",
      format: (r) => {
        const fact = findFact(r);
        return fact?.firstKillForTeam == null ? "—" : fact.firstKillForTeam ? "✓" : "✗";
      }
    },
    {
      key: "plant", label: "下包",
      format: (r) => {
        const fact = findFact(r);
        return fact?.plant ? `${fact.plant.site.toUpperCase()} ${formatClockSeconds(fact.plant.remainSec)}` : "—";
      }
    },
    {
      key: "result", label: "结果",
      format: (r) => r.won ? "胜" : "负",
      cellClassName: (r) => r.won ? "stu-win" : "stu-loss",
    },
    {
      key: "actions", label: "",
      render: (r) => {
        const fact = findFact(r);
        const entry = entryByMatchId.get(r.matchId);
        return <>
          {fact && onAddToPlaylist && (
            <button type="button" className="stu-button-sm" onClick={() => onAddToPlaylist(cluster, fact)}>加入</button>
          )}
          {entry && (
            <EvidenceLink hint="在比赛工作台打开完整分析并定位执行证据" onOpen={() => onOpenMatch(entry.id, { roundNumber: r.roundNumber, tick: fact ? jumpTickFor(fact) : undefined })}>
              工作台 ↗
            </EvidenceLink>
          )}
          {entry?.sourceDemPath && onWatchDemo && (
            <button type="button" className="stu-button-sm" onClick={() => onWatchDemo(entry.id, { roundNumber: r.roundNumber, tick: fact ? jumpTickFor(fact) : undefined })}>
              进游戏
            </button>
          )}
        </>;
      }
    },
  ], [factByRound, entryByMatchId, onSelect, onOpenMatch, onWatchDemo, onAddToPlaylist, cluster]);

  return (
    <div className="stu-pe-evidence" id="patterns:evidence">
      <h4>证据回合（{cluster.roundCount}）</h4>
      <DataTable
        classes={STUDIO_TABLE_CLASSES}
        rows={cluster.rounds}
        rowKey={(r) => `${r.matchId}-${r.roundNumber}`}
        pageSize={PAGE_SIZE}
        state={tableState} onStateChange={onTableStateChange}
        paginationMaxButtons={6}
        paginationInfo={(total) => `${total} 回合`}
        rowClassName={(r) => activeFact?.matchId === r.matchId && activeFact.roundNumber === r.roundNumber ? "stu-pe-evidence-active" : undefined}
        columns={columns}
      />
    </div>
  );
}

function evidenceKey(fact: Pick<TacticalRoundFact, "matchId" | "roundNumber">): string {
  return `${fact.matchId}:${fact.roundNumber}`;
}

function jumpTickFor(fact: TacticalRoundFact): number | undefined {
  const target = fact.targetSite ? fact.siteEntries[fact.targetSite] : null;
  return target?.secondEntryTick ?? fact.plant?.tick ?? undefined;
}
