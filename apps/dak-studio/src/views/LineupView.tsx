import { useEffect, useMemo, useState } from "react";
import { buildLineupClusters, getMapCalibration, worldToRadar, type LineupCluster } from "@cs2dak/maps";
import { displayWeaponName } from "@cs2dak/presentation";
import { EmptyState } from "../components/primitives";
import { getDemoPackage, type StudioDemoEntry } from "../lib/library";

const GRENADE_LABEL: Record<string, string> = {
  flashbang: "闪光",
  smoke: "烟",
  molotov: "火",
  incendiary: "火",
  hegrenade: "雷",
  decoy: "诱饵"
};

type StudioLineupCluster = LineupCluster & { entryId: string };

export function LineupView({
  entries,
  onOpenMatch
}: {
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
}) {
  const [clusters, setClusters] = useState<StudioLineupCluster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeMap, setActiveMap] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setClusters([]);
    setError(null);
    if (entries.length === 0) return;
    setLoading(true);
    Promise.all(entries.map(async (entry) => {
      const pkg = await getDemoPackage(entry.id);
      const winners = new Map(pkg.rounds.map((round) => [round.roundNumber, round.winnerTeamKey]));
      return buildLineupClusters({
        mapName: pkg.match.mapName,
        grenades: pkg.grenades,
        roundWinners: winners,
        throwerTeam: (idx) => pkg.players[idx]?.teamKey ?? null
      }).map((cluster) => ({ ...cluster, entryId: entry.id }));
    }))
      .then((rows) => {
        if (!cancelled) setClusters(rows.flat());
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  /** 按地图分组；每张雷达只画本图的 lineup，避免跨图坐标错位。 */
  const byMap = useMemo(() => {
    const groups = new Map<string, StudioLineupCluster[]>();
    for (const cluster of clusters) {
      const list = groups.get(cluster.mapName) ?? [];
      list.push(cluster);
      groups.set(cluster.mapName, list);
    }
    return [...groups.entries()]
      .map(([mapName, rows]) => ({ mapName, rows: rows.sort((a, b) => b.count - a.count) }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [clusters]);

  if (error) return <EmptyState variant="error" title="Lineup 聚类失败" hint={error} />;
  if (loading) return <div className="stu-loading">扫描 {entries.length} 场 demo 的 grenades.json…</div>;
  if (byMap.length === 0) {
    return <EmptyState variant="insufficient" title="没有可聚类道具" hint="需要 v3 ZIP 中的 grenades.json 才能生成道具库。" />;
  }

  const current = byMap.find((group) => group.mapName === activeMap) ?? byMap[0]!;
  const calibration = getMapCalibration(current.mapName);

  return (
    <div className="stu-lineup-layout">
      <div className="stu-card">
        <h3>Lineup 雷达</h3>
        {byMap.length > 1 && (
          <div className="stu-chip-row" role="tablist" aria-label="地图选择">
            {byMap.map((group) => (
              <button
                key={group.mapName}
                type="button"
                role="tab"
                aria-selected={group.mapName === current.mapName}
                className={group.mapName === current.mapName ? "stu-chip stu-chip-active" : "stu-chip"}
                onClick={() => setActiveMap(group.mapName)}
              >
                {group.mapName.replace(/^de_/, "")} · {group.rows.length}
              </button>
            ))}
          </div>
        )}
        {calibration ? (
          <svg className="stu-duel-radar" viewBox={`0 0 ${calibration.radarSize} ${calibration.radarSize}`}>
            <image href={`./maps/radars/${current.mapName}.png`} width={calibration.radarSize} height={calibration.radarSize} opacity={0.85} />
            {current.rows.slice(0, 60).map((cluster) => {
              const from = worldToRadar(cluster.throwPosition, calibration);
              const to = worldToRadar(cluster.effectPosition, calibration);
              return (
                <g key={cluster.id + cluster.entryId}>
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="stu-lineup-line" />
                  <circle cx={from.x} cy={from.y} r={5} className="stu-lineup-throw" />
                  <circle cx={to.x} cy={to.y} r={Math.min(14, 5 + cluster.count)} className="stu-lineup-effect" />
                </g>
              );
            })}
          </svg>
        ) : (
          <p className="stu-muted">{current.mapName} 缺少雷达标定，仅显示列表。</p>
        )}
      </div>
      <div className="stu-card">
        <h3>常用道具库 · {current.mapName}</h3>
        <table className="stu-mini-table">
          <thead><tr><th>道具</th><th>回合</th><th className="stu-num">次数</th><th className="stu-num">关联胜率</th><th /></tr></thead>
          <tbody>
            {current.rows.slice(0, 40).map((cluster) => {
              const firstThrow = cluster.throws[0];
              return (
                <tr key={cluster.id + cluster.entryId}>
                  <td>{GRENADE_LABEL[cluster.grenade] ?? displayWeaponName(cluster.grenade)}</td>
                  <td>R{cluster.roundNumbers.slice(0, 3).join("/")}{cluster.roundNumbers.length > 3 ? "…" : ""}</td>
                  <td className="stu-num">{cluster.count}</td>
                  <td className="stu-num">{cluster.winRatePercent == null ? "—" : `${cluster.winRatePercent.toFixed(1)}%`}</td>
                  <td>
                    {firstThrow && (
                      <button
                        type="button"
                        className="stu-button-sm"
                        onClick={() => onOpenMatch(cluster.entryId, { roundNumber: firstThrow.roundNumber, tick: firstThrow.tick })}
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
    </div>
  );
}
