import { useEffect, useState, useMemo } from "react";
import type { MatchWorkspaceModel } from "@cs2dak/contract";
import { ReplayViewer } from "@cs2dak/react";
import { autoName, type TacticalCluster } from "../../lib/tactics.js";
import { getFactsStore, type TacticalRoundFact } from "../../lib/facts.js";
import type { StudioDemoEntry } from "../../lib/library.js";
import { RadarTrails, GRENADE_COLOR, type RadarGrenadeOverlay, type RadarTrail } from "../../components/RadarTrails.js";

const SIDE_LABEL: Record<string, string> = { t: "T 方", ct: "CT 方" };
const BUCKET_LABEL: Record<string, string> = { rush: "提速", fast: "速爆", mid: "默认", late: "后打" };
const ECO_LABEL: Record<string, string> = {
  full: "全购", half: "半购", "half-buy": "半购", force: "强购", eco: "省钱", pistol: "手枪局",
};

export interface PatternExplorerProps {
  clusters: TacticalCluster[];
  facts: TacticalRoundFact[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onAddToPlaylist?: (cluster: TacticalCluster, fact: TacticalRoundFact) => void;
}

export function PatternExplorer({ clusters, facts, entryByMatchId, onOpenMatch, onAddToPlaylist }: PatternExplorerProps) {
  // 顶部视角切换：T 进攻语境 / CT 防守语境分开看，避免两个 side 的簇混在一列。
  const [side, setSide] = useState<"t" | "ct">("t");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 页面内回放：选中证据回合后在本页弹出 2D 回放，不跳转比赛工作台。
  const [replayTarget, setReplayTarget] = useState<{ matchId: string; roundNumber: number; tick?: number } | null>(null);

  const sideCounts = useMemo(() => ({
    t: clusters.filter((c) => c.side === "t").length,
    ct: clusters.filter((c) => c.side === "ct").length,
  }), [clusters]);

  const visibleClusters = useMemo(() => clusters.filter((c) => c.side === side), [clusters, side]);

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
          {/* 左栏：簇列表 */}
          <aside className="stu-pe-list">
            {visibleClusters.map((c) => {
          return (
            <button
              key={c.id}
              type="button"
              className={c.id === selectedId ? "stu-pe-cluster stu-pe-cluster-active" : "stu-pe-cluster"}
              onClick={() => setSelectedId(c.id)}
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
                <span>{SIDE_LABEL[c.side]}</span>
                {c.executeBucket && <span className="stu-pe-bucket">{BUCKET_LABEL[c.executeBucket] ?? c.executeBucket}</span>}
                <span>{c.roundCount} 回合</span>
                <span>{c.winRatePercent != null ? `${c.winRatePercent.toFixed(1)}%` : "—"}</span>
              </span>
            </button>
          );
        })}
      </aside>

          {/* 中栏：站位快照 ↔ 该回合 2D 回放（同一张雷达上播放，不跳转） */}
          <div className="stu-pe-radar">
            {replayTarget ? (
              <InlineRoundReplay
                matchId={replayTarget.matchId}
                roundNumber={replayTarget.roundNumber}
                tick={replayTarget.tick}
                label={entryByMatchId.get(replayTarget.matchId)
                  ? `${entryByMatchId.get(replayTarget.matchId)!.meta.teamAName} vs ${entryByMatchId.get(replayTarget.matchId)!.meta.teamBName} · R${replayTarget.roundNumber}`
                  : `R${replayTarget.roundNumber}`}
                onBack={() => setReplayTarget(null)}
              />
            ) : selected ? (
              <ClusterRadar facts={selectedFacts} mapName={selected.mapName} />
            ) : (
              <div className="stu-pe-radar-empty">选择左侧聚类</div>
            )}
          </div>

          {/* 右栏：数据摘要 + 证据回合 */}
          <div className="stu-pe-detail">
            {selected && (
              <>
                <ClusterSummary cluster={selected} facts={selectedFacts} />
                <EvidenceTable
                  cluster={selected}
                  facts={selectedFacts}
                  entryByMatchId={entryByMatchId}
                  activeReplay={replayTarget}
                  onOpenMatch={onOpenMatch}
                  onPlayInline={(matchId, roundNumber, tick) => setReplayTarget({ matchId, roundNumber, tick })}
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

const replayModelCache = new Map<string, MatchWorkspaceModel>();

async function loadReplayModel(matchId: string): Promise<MatchWorkspaceModel> {
  const cached = replayModelCache.get(matchId);
  if (cached) return cached;
  const stored = await getFactsStore().getMatchWorkspaces({ matchIds: [matchId] });
  if (!stored[0]) throw new Error("本场没有本地持久化回放，请重新导入或重建该场。");
  replayModelCache.set(matchId, stored[0].row);
  return stored[0].row;
}

/** 在中栏雷达位置直接播放某回合的 2D 回放（懒加载该场 workspace facts）。 */
function InlineRoundReplay({ matchId, roundNumber, tick, label, onBack }: {
  matchId: string;
  roundNumber: number;
  tick?: number;
  label: string;
  onBack: () => void;
}) {
  const [model, setModel] = useState<MatchWorkspaceModel | null>(replayModelCache.get(matchId) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!replayModelCache.get(matchId)) setModel(null);
    loadReplayModel(matchId)
      .then((m) => { if (!cancelled) setModel(m); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [matchId]);

  return (
    <div className="stu-pe-replay">
      <div className="stu-pe-replay-bar">
        <button type="button" className="stu-button-sm" onClick={onBack}>← 返回站位</button>
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
          target={{ roundNumber, tick, seq: tick ?? roundNumber }}
        />
      )}
    </div>
  );
}

function ClusterRadar({ facts, mapName }: { facts: TacticalRoundFact[]; mapName: string }) {
  const maxSnapshots = Math.max(0, ...facts.map((fact) => fact.snapshots.length));
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const safeSnapshotIndex = Math.min(snapshotIndex, Math.max(0, maxSnapshots - 1));
  const shownFacts = facts.slice(0, 8);

  const trails: RadarTrail[] = shownFacts.flatMap((fact, factIndex) => {
    const snapshot = fact.snapshots[safeSnapshotIndex];
    if (!snapshot) return [];
    return snapshot.positions.map((position) => ({
      id: `${fact.matchId}:${fact.roundNumber}:${position.playerIndex}:${safeSnapshotIndex}`,
      points: [{ x: position.x, y: position.y }],
      color: fact.won ? "var(--dak-ok)" : "var(--dak-danger)",
      opacity: 0.85 - Math.min(0.45, factIndex * 0.04),
    }));
  });

  const grenades: RadarGrenadeOverlay[] = shownFacts.flatMap((fact) =>
    fact.grenades.map((grenade) => ({
      trailId: grenade.id,
      type: grenade.type,
      x: grenade.throwPosition.x,
      y: grenade.throwPosition.y,
      ex: grenade.effectPosition.x,
      ey: grenade.effectPosition.y,
      showEffect: true,
      effectActive: grenade.type === "smoke" || grenade.type === "molotov" || grenade.type === "incendiary",
    }))
  );

  return (
    <div className="stu-pe-radar-wrap">
      {maxSnapshots > 1 && (
        <div className="stu-chip-row" role="tablist" aria-label="战术切片">
          {Array.from({ length: maxSnapshots }, (_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={safeSnapshotIndex === index}
              className={safeSnapshotIndex === index ? "stu-chip stu-chip-active" : "stu-chip"}
              onClick={() => setSnapshotIndex(index)}
            >
              切片 {index + 1}
            </button>
          ))}
        </div>
      )}
      <RadarTrails
        mapName={mapName}
        trails={trails}
        grenades={grenades}
        showTrails={false}
        showGrenades
        trailOpacity={0.7}
        className="stu-trail-stage"
      />
      <div className="stu-pe-radar-legend">
        <span><i style={{ background: "var(--dak-ok)" }} />胜回合站位</span>
        <span><i style={{ background: "var(--dak-danger)" }} />负回合站位</span>
        {Object.entries(GRENADE_COLOR).map(([type, color]) => (
          <span key={type}><i style={{ background: color }} />{type}</span>
        ))}
      </div>
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

  return (
    <div className="stu-pe-summary">
      <h3 className="stu-pe-summary-title">{autoName(cluster)} <small>（推测名）</small></h3>
      <dl className="stu-pe-stats">
        <div>
          <dt>样本</dt>
          <dd>{cluster.roundCount} 回合</dd>
        </div>
        <div>
          <dt>胜率 <span className="stu-derived-hint" title="赢得该回合的比例">ⓘ</span></dt>
          <dd>{cluster.winRatePercent != null ? `${cluster.winRatePercent.toFixed(1)}%` : "—"}</dd>
        </div>
        <div>
          <dt>{isT ? "下包率" : "对手下包率"} <span className="stu-derived-hint" title={isT ? "本方成功下包的回合比例" : "该防守阵型下对手成功下包的回合比例"}>ⓘ</span></dt>
          <dd>{facts.length > 0 ? `${((plantCount / facts.length) * 100).toFixed(1)}%` : "—"}</dd>
        </div>
        {isT && (
          <div>
            <dt>执行剩余（中位）<span className="stu-derived-hint" title="第二名队员进入目标包点时的回合剩余秒中位数">ⓘ</span></dt>
            <dd>{execMedian != null ? `${execMedian}s` : "—"}</dd>
          </div>
        )}
        <div>
          <dt>首杀率 <span className="stu-derived-hint" title="该 side 率先击杀的回合比例">ⓘ</span></dt>
          <dd>{firstKillValid > 0 ? `${((firstKillCount / firstKillValid) * 100).toFixed(1)}%` : "—"}</dd>
        </div>
        {isT && (
          <div>
            <dt>节奏</dt>
            <dd>{cluster.executeBucket ? (BUCKET_LABEL[cluster.executeBucket] ?? cluster.executeBucket) : "—"}</dd>
          </div>
        )}
        {isT && cluster.fakeRoundCount > 0 && (
          <div>
            <dt>疑似纯道具佯攻 <span className="stu-derived-hint" title="非目标点成片道具但无人真正进点的回合数 · Experimental">ⓘ</span></dt>
            <dd>{cluster.fakeRoundCount}/{cluster.roundCount} 回合</dd>
          </div>
        )}
      </dl>
      {Object.keys(ecoCounts).length > 0 && (
        <div className="stu-pe-eco">
          <span className="stu-pe-eco-label">经济分布：</span>
          {Object.entries(ecoCounts).map(([eco, n]) => (
            <span key={eco} className="stu-pe-eco-item">{ECO_LABEL[eco] ?? eco} {n}</span>
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
  activeReplay,
  onOpenMatch,
  onPlayInline,
  onAddToPlaylist,
}: {
  cluster: TacticalCluster;
  facts: TacticalRoundFact[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  activeReplay: { matchId: string; roundNumber: number } | null;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onPlayInline: (matchId: string, roundNumber: number, tick?: number) => void;
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
              <tr key={`${r.matchId}-${r.roundNumber}`}>
                <td title={r.matchId}>{label}</td>
                <td className="stu-num">R{r.roundNumber}</td>
                <td>{ECO_LABEL[r.economy] ?? r.economy}</td>
                <td className="stu-num">{fact?.executeRemainSec != null ? `${fact.executeRemainSec}s` : "—"}</td>
                <td>{fact?.firstKillForTeam == null ? "—" : fact.firstKillForTeam ? "✓" : "✗"}</td>
                <td>{fact?.plant ? `${fact.plant.site.toUpperCase()} ${fact.plant.remainSec}s` : "—"}</td>
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
                    <>
                      <button
                        type="button"
                        className={activeReplay?.matchId === r.matchId && activeReplay.roundNumber === r.roundNumber
                          ? "stu-button-sm stu-button-sm-active"
                          : "stu-button-sm"}
                        title="在左侧雷达上直接播放该回合"
                        onClick={() => onPlayInline(r.matchId, r.roundNumber, fact ? jumpTickFor(fact) : undefined)}
                      >
                        ▶ 回放
                      </button>
                      <button
                        type="button"
                        className="stu-button-sm"
                        title="在比赛工作台打开（完整分析）"
                        onClick={() => onOpenMatch(entry.id, {
                          roundNumber: r.roundNumber,
                          tick: fact ? jumpTickFor(fact) : undefined,
                        })}
                      >
                        工作台 ↗
                      </button>
                    </>
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

function jumpTickFor(fact: TacticalRoundFact): number | undefined {
  const target = fact.targetSite ? fact.siteEntries[fact.targetSite] : null;
  return target?.secondEntryTick ?? fact.plant?.tick ?? undefined;
}
