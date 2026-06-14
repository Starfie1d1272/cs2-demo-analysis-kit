import { useState, useMemo } from "react";
import { DEFAULT_POSITIONS } from "@cs2dak/maps";
import { autoName, suspectFake, type TacticalCluster } from "../../lib/tactics.js";
import type { TacticalRoundFact } from "../../lib/facts.js";
import type { StudioDemoEntry } from "../../lib/library.js";

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
}

export function PatternExplorer({ clusters, facts, entryByMatchId, onOpenMatch }: PatternExplorerProps) {
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

  if (clusters.length === 0) {
    return <div className="stu-coach-pattern-explorer stu-empty">暂无聚类数据，请导入更多 demo。</div>;
  }

  return (
    <div className="stu-coach-pattern-explorer">
      {/* 左栏：簇列表 */}
      <aside className="stu-pe-list">
        {clusters.map((c) => {
          const fake = suspectFake(selectedFacts.find((f) => f.matchId === c.rounds[0]?.matchId && f.roundNumber === c.rounds[0]?.roundNumber) ?? { targetSite: null, siteInvestment: { a: { grenadeCount: 0, entryCount: 0, deepestAnchor: null, planted: false }, b: { grenadeCount: 0, entryCount: 0, deepestAnchor: null, planted: false } } } as TacticalRoundFact);
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
          <ClusterRadar cluster={selected} mapName={selected.mapName} />
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
            />
          </>
        )}
      </div>
    </div>
  );
}

function ClusterRadar({ cluster, mapName }: { cluster: TacticalCluster; mapName: string }) {
  const anchors = DEFAULT_POSITIONS[mapName]?.[cluster.side]?.anchors ?? {};

  const basisParts = cluster.defaultsBasis.split("|").filter(Boolean).map((seg) => {
    const [id, n] = seg.split(":");
    return { id: id ?? "", count: Number(n ?? 1), name: anchors[id ?? ""]?.name ?? id ?? "" };
  });

  return (
    <div className="stu-pe-radar-wrap">
      <img className="stu-pe-radar-bg" src={`./maps/radars/${mapName}.png`} alt={mapName} />
      <div className="stu-pe-radar-overlay">
        <div className="stu-pe-snapshot-title">首切片站位分布</div>
        {basisParts.map(({ id, count, name }) => (
          <div key={id} className="stu-pe-anchor-row">
            <span className="stu-pe-anchor-name">{name}</span>
            <span className="stu-pe-anchor-bar" style={{ width: `${Math.min(100, count * 22)}%` }} />
            <span className="stu-pe-anchor-count">{count} 人</span>
          </div>
        ))}
        {cluster.entryAnchors.length > 0 && (
          <div className="stu-pe-entry-anchors">
            进点：{cluster.entryAnchors.map((a) => anchors[a]?.name ?? a).join("、")}
          </div>
        )}
      </div>
    </div>
  );
}

function ClusterSummary({ cluster, facts }: { cluster: TacticalCluster; facts: TacticalRoundFact[] }) {
  const plantCount = facts.filter((f) => f.siteInvestment.a.planted || f.siteInvestment.b.planted).length;
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
          <dt>执行剩余（中位）<span className="stu-derived-hint" title="下包时回合剩余秒中位数">ⓘ</span></dt>
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
}: {
  cluster: TacticalCluster;
  facts: TacticalRoundFact[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
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
                <td>{fact ? ((fact.siteInvestment.a.planted || fact.siteInvestment.b.planted) ? "✓" : "—") : "—"}</td>
                <td className={r.won ? "stu-win" : "stu-loss"}>{r.won ? "胜" : "负"}</td>
                <td>
                  {entry && (
                    <button
                      type="button"
                      className="stu-button-sm"
                      onClick={() => onOpenMatch(entry.id, { roundNumber: r.roundNumber })}
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
