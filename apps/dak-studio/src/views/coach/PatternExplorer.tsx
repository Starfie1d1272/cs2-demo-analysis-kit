import { useState, useMemo } from "react";
import { autoName, suspectFake, type TacticalCluster } from "../../lib/tactics.js";
import type { TacticalRoundFact } from "../../lib/facts.js";
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
  const [selectedId, setSelectedId] = useState<string | null>(clusters[0]?.id ?? null);

  const selected = useMemo(() => clusters.find((c) => c.id === selectedId) ?? null, [clusters, selectedId]);

  const selectedFacts = useMemo(() => {
    if (!selected) return [];
    return facts.filter(
      (f) => f.side === selected.side &&
        f.mapName === selected.mapName &&
        selected.rounds.some((r) => r.matchId === f.matchId && r.roundNumber === f.roundNumber)
    );
  }, [selected, facts]);

  // 对所有簇预计算佯攻标志（基于该簇全量 facts，而非仅当前选中簇）
  const clusterFakeMap = useMemo(() => {
    const m = new Map<string, { suspected: boolean; reason?: string }>();
    for (const c of clusters) {
      const clusterFacts = facts.filter(
        (f) => f.side === c.side && f.mapName === c.mapName &&
          c.rounds.some((r) => r.matchId === f.matchId && r.roundNumber === f.roundNumber)
      );
      const representativeFact = clusterFacts[0];
      m.set(c.id, representativeFact ? suspectFake(representativeFact) : { suspected: false });
    }
    return m;
  }, [clusters, facts]);

  if (clusters.length === 0) {
    return <div className="stu-coach-pattern-explorer stu-empty">暂无聚类数据，请导入更多 demo。</div>;
  }

  return (
    <div className="stu-coach-pattern-explorer">
      {/* 左栏：簇列表 */}
      <aside className="stu-pe-list">
        {clusters.map((c) => {
          const fake = clusterFakeMap.get(c.id) ?? { suspected: false };
          return (
            <button
              key={c.id}
              type="button"
              className={c.id === selectedId ? "stu-pe-cluster stu-pe-cluster-active" : "stu-pe-cluster"}
              onClick={() => setSelectedId(c.id)}
            >
              <span className="stu-pe-cluster-name">
                {autoName(c)}
                {fake.suspected && <span className="stu-pe-tag stu-pe-tag-fake" title={fake.reason}>佯</span>}
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

      {/* 中栏：雷达快照 */}
      <div className="stu-pe-radar">
        {selected ? (
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
              onOpenMatch={onOpenMatch}
              onAddToPlaylist={onAddToPlaylist}
            />
          </>
        )}
      </div>
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
          <dt>下包率 <span className="stu-derived-hint" title="成功下包的回合比例">ⓘ</span></dt>
          <dd>{facts.length > 0 ? `${((plantCount / facts.length) * 100).toFixed(1)}%` : "—"}</dd>
        </div>
        <div>
          <dt>执行剩余（中位）<span className="stu-derived-hint" title="第二名队员进入目标包点时的回合剩余秒中位数">ⓘ</span></dt>
          <dd>{execMedian != null ? `${execMedian}s` : "—"}</dd>
        </div>
        <div>
          <dt>首杀率 <span className="stu-derived-hint" title="该 side 率先击杀的回合比例">ⓘ</span></dt>
          <dd>{firstKillValid > 0 ? `${((firstKillCount / firstKillValid) * 100).toFixed(1)}%` : "—"}</dd>
        </div>
        <div>
          <dt>节奏</dt>
          <dd>{cluster.executeBucket ? (BUCKET_LABEL[cluster.executeBucket] ?? cluster.executeBucket) : "—"}</dd>
        </div>
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
  onOpenMatch,
  onAddToPlaylist,
}: {
  cluster: TacticalCluster;
  facts: TacticalRoundFact[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
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
                    <button
                      type="button"
                      className="stu-button-sm"
                      onClick={() => onOpenMatch(entry.id, {
                        roundNumber: r.roundNumber,
                        tick: fact ? jumpTickFor(fact) : undefined,
                      })}
                    >
                      回放
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

function jumpTickFor(fact: TacticalRoundFact): number | undefined {
  const target = fact.targetSite ? fact.siteEntries[fact.targetSite] : null;
  return target?.secondEntryTick ?? fact.plant?.tick ?? undefined;
}
