import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchWorkspaceModel } from "@cs2dak/contract";
import { ReplayViewer } from "@cs2dak/react";
import { economyLabelCn, formatClockSeconds } from "@cs2dak/presentation";
import { autoName, type TacticalCluster } from "../../lib/tactics.js";
import { getFactsStore, type TacticalRoundFact } from "../../lib/facts.js";
import type { StudioDemoEntry } from "../../lib/library.js";
import { MetricInfo } from "../../components/primitives.js";

const BUCKET_LABEL: Record<string, string> = { rush: "提速", fast: "速爆", mid: "默认", late: "后打" };

export interface PatternExplorerProps {
  clusters: TacticalCluster[];
  facts: TacticalRoundFact[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onAddToPlaylist?: (cluster: TacticalCluster, fact: TacticalRoundFact) => void;
  /** 回放缓存：传入则与上层复用；未传时组件生命周期内保持同一个缓存。 */
  replayModelCache?: Map<string, MatchWorkspaceModel>;
}

export function PatternExplorer({ clusters, facts, entryByMatchId, onOpenMatch, onAddToPlaylist, replayModelCache }: PatternExplorerProps) {
  // 顶部视角切换：T 进攻语境 / CT 防守语境分开看，避免两个 side 的簇混在一列。
  const [side, setSide] = useState<"t" | "ct">("t");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEvidenceKey, setSelectedEvidenceKey] = useState<string | null>(null);
  const localReplayCache = useRef(new Map<string, MatchWorkspaceModel>());
  const replayCache = replayModelCache ?? localReplayCache.current;

  const sideCounts = useMemo(() => ({
    t: clusters.filter((c) => c.side === "t").length,
    ct: clusters.filter((c) => c.side === "ct").length,
  }), [clusters]);

  const visibleClusters = useMemo(() => clusters.filter((c) => c.side === side), [clusters, side]);

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

  // 选中项必须属于当前 side；切换 side 或数据变化后回退到首个可见簇。
  const selected = useMemo(
    () => visibleClusters.find((c) => c.id === selectedId) ?? visibleClusters[0] ?? null,
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
    () => selectedFacts.find((fact) => evidenceKey(fact) === selectedEvidenceKey) ?? selectedFacts[0] ?? null,
    [selectedFacts, selectedEvidenceKey]
  );

  if (clusters.length === 0) {
    return <div className="stu-coach-pattern-explorer stu-empty">暂无聚类数据，请导入更多 demo。</div>;
  }

  return (
    <div className="stu-pe-shell">
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
          该视角下暂无聚类（{side === "t" ? "T" : "CT"} 方）。切换到另一视角，或导入更多 demo。
        </div>
      ) : (
        <div className="stu-coach-pattern-explorer">
          {/* 左栏：大分类 → 小聚类双层列表 */}
          <aside className="stu-pe-list">
            {groupedClusters.map(([category, cats]) => (
              <div key={category} className="stu-pe-group">
                <div className="stu-pe-group-header">{category}</div>
                {cats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={c.id === selected?.id ? "stu-pe-cluster stu-pe-cluster-active" : "stu-pe-cluster"}
                    onClick={() => {
                      setSelectedId(c.id);
                      setSelectedEvidenceKey(null);
                    }}
                  >
                    <span className="stu-pe-cluster-name">
                      {autoName(c)}
                      {c.fakeRoundCount > 0 && (
                        <span
                          className="stu-pe-tag stu-pe-tag-fake"
                          title={`疑似纯道具佯攻 ${c.fakeRoundCount}/${c.roundCount} 回合 · Experimental`}
                        >
                          佯 {c.fakeRoundCount}
                        </span>
                      )}
                    </span>
                    <span className="stu-pe-cluster-meta">
                      {c.executeBucket && <span className="stu-pe-bucket">{BUCKET_LABEL[c.executeBucket] ?? c.executeBucket}</span>}
                      <span>{c.roundCount} 回合</span>
                      <span>{c.winRatePercent != null ? `${c.winRatePercent.toFixed(1)}%` : "—"}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          {/* 中栏：常驻统一回放。模式与证据选择只改变它的当前回合。 */}
          <CoachReplayStage fact={activeFact} entryByMatchId={entryByMatchId} cache={replayCache} />

          {/* 右栏：数据摘要 + 证据回合 */}
          <div className="stu-pe-detail">
            {selected && (
              <>
                <ClusterSummary cluster={selected} facts={selectedFacts} />
                <EvidenceTable
                  cluster={selected}
                  facts={selectedFacts}
                  entryByMatchId={entryByMatchId}
                  activeFact={activeFact}
                  onOpenMatch={onOpenMatch}
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


async function loadReplayModel(matchId: string, cache: Map<string, MatchWorkspaceModel>): Promise<MatchWorkspaceModel> {
  const cached = cache.get(matchId);
  if (cached) return cached;
  const stored = await getFactsStore().getMatchWorkspace(matchId);
  if (!stored) throw new Error("本场没有本地持久化回放，请重新导入或重建该场。");
  cache.set(matchId, stored.row);
  return stored.row;
}

function replayTargetSeq(matchId: string, roundNumber: number): number {
  let hash = roundNumber;
  for (let index = 0; index < matchId.length; index += 1) hash = (hash * 31 + matchId.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

/** 教练页常驻回放主画布：只按当前证据的 matchId 懒加载单场 workspace。 */
function CoachReplayStage({ fact, entryByMatchId, cache }: {
  fact: TacticalRoundFact | null;
  entryByMatchId: Map<string, StudioDemoEntry>;
  cache: Map<string, MatchWorkspaceModel>;
}) {
  const matchId = fact?.matchId ?? null;
  const cachedModel = matchId ? cache.get(matchId) ?? null : null;
  const [loaded, setLoaded] = useState<{ matchId: string; model: MatchWorkspaceModel } | null>(
    matchId && cachedModel ? { matchId, model: cachedModel } : null
  );
  const [error, setError] = useState<string | null>(null);
  const model = loaded?.matchId === matchId ? loaded.model : null;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!matchId) {
      setLoaded(null);
      return () => { cancelled = true; };
    }
    const nextCached = cache.get(matchId);
    setLoaded(nextCached ? { matchId, model: nextCached } : null);
    loadReplayModel(matchId, cache)
      .then((nextModel) => { if (!cancelled) setLoaded({ matchId, model: nextModel }); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [matchId, cache]);

  if (!fact) return <div className="stu-pe-replay-main stu-pe-radar-empty">该模式没有可用证据回合。</div>;
  const entry = entryByMatchId.get(fact.matchId);
  const label = entry
    ? `${entry.meta.teamAName} vs ${entry.meta.teamBName} · R${fact.roundNumber}`
    : `${fact.teamName} vs ${fact.opponentName} · R${fact.roundNumber}`;

  return (
    <div className="stu-pe-replay-main">
      <div className="stu-pe-replay-bar">
        <span className="stu-pe-replay-kicker">代表回合</span>
        <span className="stu-pe-replay-label">{label}</span>
      </div>
      {error ? (
        <div className="stu-pe-radar-empty">{error}</div>
      ) : !model ? (
        <div className="stu-loading">读取本地回放…</div>
      ) : !model.replay.available ? (
        <div className="stu-pe-radar-empty">本场导出未附带 2D 回放流。</div>
      ) : (
        <ReplayViewer
          replay={model.replay}
          map={model.map.view}
          target={{ roundNumber: fact.roundNumber, seq: replayTargetSeq(fact.matchId, fact.roundNumber) }}
          initialClockSeconds={95}
        />
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
  const pressureLabels = [...new Map(
    facts.flatMap((fact) => fact.openingPressure).map((event) => [
      `${event.calloutLabel}:${event.kind}`,
      `${event.calloutLabel}${event.kind === "deep" ? "（深入）" : "（前压）"}`
    ])
  ).values()];

  // C4 轨迹统计（仅 T）：转点回合数 + 主要走向（按 endRegion 多数表决）。
  const c4Routes = facts.map((f) => f.c4Route).filter((r): r is NonNullable<typeof r> => r != null);
  const c4Rotated = c4Routes.filter((r) => r.rotated).length;
  const c4EndCounts = c4Routes.reduce<Record<string, number>>((acc, r) => {
    if (r.endRegion) acc[r.endRegion] = (acc[r.endRegion] ?? 0) + 1;
    return acc;
  }, {});
  const c4MainEnd = Object.entries(c4EndCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return (
    <div className="stu-pe-summary">
      <h3 className="stu-pe-summary-title">{autoName(cluster)} <small>（推测名）</small></h3>
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
            <dt>执行时钟（中位）<MetricInfo note="第二名队员进入目标包点时的 1:55 回合倒计时中位数" /></dt>
            <dd>{execMedian != null ? formatClockSeconds(execMedian) : "—"}</dd>
          </div>
        )}
        <div>
          <dt>首杀率 <MetricInfo note="该模式中本方取得回合首个击杀的比例；没有击杀的回合不进入分母" /></dt>
          <dd>{firstKillValid > 0 ? `${((firstKillCount / firstKillValid) * 100).toFixed(1)}%` : "—"}</dd>
        </div>
        <div>
          <dt>开局推进 <MetricInfo note="离开本方默认位后进入前方战术区域；深入表示已进入对方默认位覆盖区域" /></dt>
          <dd>{pressureLabels.length > 0 ? pressureLabels.slice(0, 3).join(" / ") : "—"}</dd>
        </div>
        {isT && (
          <div>
            <dt>节奏</dt>
            <dd>{cluster.executeBucket ? (BUCKET_LABEL[cluster.executeBucket] ?? cluster.executeBucket) : "—"}</dd>
          </div>
        )}
        {isT && cluster.fakeRoundCount > 0 && (
          <div>
            <dt>疑似纯道具佯攻 <MetricInfo note="非目标点出现成片道具但无人真正进点的回合数；当前为实验性判断" /></dt>
            <dd>{cluster.fakeRoundCount}/{cluster.roundCount} 回合</dd>
          </div>
        )}
        {isT && c4Routes.length > 0 && (
          <div>
            <dt>C4 走向 <MetricInfo note="按 C4 携带者最终所在区域多数表决；转点表示 C4 主方向在 A/B 之间切换" /></dt>
            <dd>{c4MainEnd ? c4MainEnd.toUpperCase() : "—"}{c4Rotated > 0 ? ` · 转点 ${c4Rotated}/${c4Routes.length}` : ""}</dd>
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
    </div>
  );
}

function EvidenceTable({
  cluster,
  facts,
  entryByMatchId,
  activeFact,
  onOpenMatch,
  onSelect,
  onAddToPlaylist,
}: {
  cluster: TacticalCluster;
  facts: TacticalRoundFact[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  activeFact: TacticalRoundFact | null;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onSelect: (key: string) => void;
  onAddToPlaylist?: (cluster: TacticalCluster, fact: TacticalRoundFact) => void;
}) {
  return (
    <div className="stu-pe-evidence">
      <h4>证据回合（{cluster.roundCount}）</h4>
      <table className="stu-mini-table">
        <thead>
          <tr>
            <th>比赛</th>
            <th className="stu-num">回合</th>
            <th>经济</th>
            <th className="stu-num">执行剩余</th>
            <th>首杀</th>
            <th>下包</th>
            <th>结果</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cluster.rounds.map((r) => {
            const fact = facts.find((f) => f.matchId === r.matchId && f.roundNumber === r.roundNumber);
            const entry = entryByMatchId.get(r.matchId);
            const label = r.matchId.length > 18 ? `${r.matchId.slice(0, 18)}…` : r.matchId;
            return (
              <tr
                key={`${r.matchId}-${r.roundNumber}`}
                className={activeFact?.matchId === r.matchId && activeFact.roundNumber === r.roundNumber ? "stu-pe-evidence-active" : undefined}
              >
                <td title={r.matchId}>
                  <button
                    type="button"
                    className="stu-pe-evidence-select"
                    onClick={() => fact && onSelect(evidenceKey(fact))}
                    disabled={!fact}
                    aria-label={`查看 ${label} 第 ${r.roundNumber} 回合`}
                  >
                    {label}
                  </button>
                </td>
                <td className="stu-num">R{r.roundNumber}</td>
                <td>{economyLabelCn(r.economy)}</td>
                <td className="stu-num">{fact?.executeRemainSec != null ? formatClockSeconds(fact.executeRemainSec) : "—"}</td>
                <td>{fact?.firstKillForTeam == null ? "—" : fact.firstKillForTeam ? "✓" : "✗"}</td>
                <td>{fact?.plant ? `${fact.plant.site.toUpperCase()} ${formatClockSeconds(fact.plant.remainSec)}` : "—"}</td>
                <td className={r.won ? "stu-win" : "stu-loss"}>{r.won ? "胜" : "负"}</td>
                <td>
                  {fact && onAddToPlaylist && (
                    <button
                      type="button"
                      className="stu-button-sm"
                      onClick={() => onAddToPlaylist(cluster, fact)}
                    >
                      加入
                    </button>
                  )}
                  {entry && (
                    <button
                      type="button"
                      className="stu-button-sm"
                      title="在比赛工作台打开完整分析并定位执行证据"
                      onClick={() => onOpenMatch(entry.id, {
                        roundNumber: r.roundNumber,
                        tick: fact ? jumpTickFor(fact) : undefined,
                      })}
                    >
                      工作台 ↗
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
