import { useEffect, useMemo, useState } from "react";
import {
  buildLineupClusters,
  getMapCalibration,
  worldToRadar,
  CALLOUT_NAME_CN,
  type LineupCluster,
  type LineupGrenadeLike,
} from "@cs2dak/maps";
import { displayWeaponName } from "@cs2dak/presentation";
import type { DemoPackage } from "@cs2dak/contract";
import { EmptyState } from "../components/primitives";
import { Pagination } from "../components/Pagination";
import { getDemoPackage, type StudioDemoEntry } from "../lib/library";

// ── 常亮 ────────────────────────────────────────────────────────────────────

const GRENADE_LABEL: Record<string, string> = {
  flashbang: "闪光",
  smoke: "烟",
  molotov: "火",
  incendiary: "火",
  hegrenade: "雷",
  decoy: "诱饵",
};

const GRENADE_COLOR: Record<string, string> = {
  smoke: "#9b59b6",
  flashbang: "#f1c40f",
  molotov: "#e74c3c",
  incendiary: "#e74c3c",
  hegrenade: "#2ecc71",
  decoy: "#95a5a6",
};

const SIDE_LABEL: Record<string, string> = { t: "T", ct: "CT" };

const BATCH_SIZE = 5;
const PAGE_SIZE = 16;

// ── 数据加载与 callout 解析 ──────────────────────────────────────────────────

interface LoadedGrenades {
  entryId: string;
  mapName: string;
  grenades: LineupGrenadeLike[];
  winners: Map<string, string>;
  tickrate: number;
}

/**
 * 分批加载所有 entry 的 pkg，把 raw grenade 行 enrich 为 LineupGrenadeLike。
 * BATCH_SIZE = 5 避免浏览器的 IndexedDB 并发压力。
 */
async function loadAllGrenades(
  entries: StudioDemoEntry[],
  onProgress?: (done: number, total: number) => void
): Promise<LoadedGrenades[]> {
  const result: LoadedGrenades[] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const loaded = await Promise.all(
      batch.map(async (entry) => {
        const pkg = await getDemoPackage(entry.id);
        return {
          entryId: entry.id,
          mapName: pkg.match.mapName,
          tickrate: pkg.match.tickrate || 64,
          grenades: enrichGrenades(pkg, entry.id),
          winners: buildWinnersMap(pkg, entry.id),
        };
      })
    );
    result.push(...loaded);
    onProgress?.(Math.min(i + BATCH_SIZE, entries.length), entries.length);
  }
  return result;
}

/** 为单个 entry 构建 roundWinners map，key = `${entryId}:${roundNumber}`。 */
function buildWinnersMap(pkg: DemoPackage, entryId: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const round of pkg.rounds) {
    map.set(`${entryId}:${round.roundNumber}`, round.winnerTeamKey);
  }
  return map;
}

/** 把 pkg 的 raw grenade 转为 LineupGrenadeLike，附加上 callout/side/freezeEndTick。 */
function enrichGrenades(pkg: DemoPackage, entryId: string): LineupGrenadeLike[] {
  const roundsByNumber = new Map(pkg.rounds.map((r) => [r.roundNumber, r]));
  return (pkg.grenades ?? []).map((grenade) => {
    const round = roundsByNumber.get(grenade.roundNumber);
    const player = pkg.players[grenade.throwerIndex];
    return {
      roundNumber: grenade.roundNumber,
      grenade: grenade.grenade,
      throwerIndex: grenade.throwerIndex,
      throwTick: grenade.throwTick,
      throwPosition: grenade.throwPosition,
      effectPosition: grenade.effectPosition,
      entryId,
      freezeEndTick: round?.freezeEndTick ?? 0,
      throwerPlaceName: getThrowerPlaceAt(pkg, grenade.roundNumber, grenade.throwerIndex, grenade.throwTick),
      side: resolveSide(pkg, grenade.throwerIndex, grenade.roundNumber),
      teamKey: player?.teamKey ?? null,
    };
  });
}

/**
 * 从 replay 取 thrower 在 throwTick 帧的 callout 名。
 *
 * TODO: effectPosition 的 callout 标注待 zone 多边形标定覆盖全部地图后，
 * 通过 zoneAt() 补全。当前仅 4/7 图有 zone 数据（见 MAP_ZONE_ASSETS），
 * 且 effectPosition 无玩家关联，无法走 replay player track 路径。
 */
function getThrowerPlaceAt(
  pkg: DemoPackage,
  roundNumber: number,
  playerIndex: number,
  tick: number
): string | null {
  if (!pkg.replay) return null;
  const replayRound = pkg.replay.rounds.find((r) => r.roundNumber === roundNumber);
  if (!replayRound) return null;
  const track = replayRound.players.find((p) => p.playerIndex === playerIndex);
  if (!track) return null;
  const frameIndex = Math.max(
    0,
    Math.min(
      replayRound.frameCount - 1,
      Math.round((tick - replayRound.startTick) / replayRound.tickStep)
    )
  );
  const placeIdx = track.place[frameIndex];
  if (placeIdx == null || placeIdx < 0 || placeIdx >= pkg.replay.placeDict.length) return null;
  return pkg.replay.placeDict[placeIdx] || null;
}

/** 判断 thrower 在特定回合的 side。 */
function resolveSide(
  pkg: DemoPackage,
  playerIndex: number,
  roundNumber: number
): "t" | "ct" | null {
  const player = pkg.players[playerIndex];
  if (!player) return null;
  const round = pkg.rounds.find((r) => r.roundNumber === roundNumber);
  if (!round) return null;
  return player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
}

/** 英文 callout → 中文（有映射时）。 */
function calloutName(mapName: string, place: string): string {
  const table = (CALLOUT_NAME_CN as Record<string, Record<string, string>>)[mapName] ?? {};
  return table[place] || place;
}

// ── 组件 ────────────────────────────────────────────────────────────────────

export function LineupView({
  entries,
  onOpenMatch,
}: {
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
}) {
  const [clusters, setClusters] = useState<LineupCluster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeMap, setActiveMap] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"count" | "winRate" | "demoCount">("count");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(0);

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  function handleClusterJump(cluster: LineupCluster) {
    const first = cluster.throws[0];
    if (first) onOpenMatch(cluster.entryIds[0] ?? "", { roundNumber: first.roundNumber, tick: first.tick });
  }

  // ── 加载：分批 → 按地图分组 → 跨场聚类 ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setClusters([]);
    setError(null);
    setProgress(0);
    setPage(0);
    if (entries.length === 0) return;
    setLoading(true);

    loadAllGrenades(entries, (done, total) => {
      if (!cancelled) setProgress(done);
    })
      .then((loaded) => {
        if (cancelled) return;

        // 按 mapName 分组
        const byMap = new Map<
          string,
          { grenades: LineupGrenadeLike[]; winners: Map<string, string>; tickrate: number }
        >();
        for (const entry of loaded) {
          const group = byMap.get(entry.mapName) ?? {
            grenades: [],
            winners: new Map<string, string>(),
            tickrate: 64,
          };
          group.grenades.push(...entry.grenades);
          for (const [k, v] of entry.winners) group.winners.set(k, v);
          group.tickrate = entry.tickrate;
          byMap.set(entry.mapName, group);
        }

        // 每张地图调用一次 buildLineupClusters（跨场聚类）
        const allClusters: LineupCluster[] = [];
        for (const [mapName, group] of byMap) {
          const result = buildLineupClusters({
            mapName,
            grenades: group.grenades,
            roundWinners: group.winners,
            tickrate: group.tickrate,
            // throwerTeam 不再传入；teamKey 已在 enrich 阶段预解析到每条 grenade 上
          });
          if (import.meta.env.DEV) {
            const counts = result.map((c) => c.count);
            const gt1 = counts.filter((c) => c > 1).length;
            console.log(
              `[Lineup] ${mapName}: ${result.length} clusters, ${gt1} with count>1, ` +
                `counts: [${counts.slice(0, 15).join(",")}${counts.length > 15 ? "…" : ""}]`
            );
          }
          allClusters.push(...result);
        }

        if (!cancelled) setClusters(allClusters);
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

  // ── 按地图分组 + 排序 + 类型筛选 + 分页 ──────────────────────────────────
  const byMap = useMemo(() => {
    const groups = new Map<string, LineupCluster[]>();
    for (const cluster of clusters) {
      const list = groups.get(cluster.mapName) ?? [];
      list.push(cluster);
      groups.set(cluster.mapName, list);
    }
    return [...groups.entries()]
      .map(([mapName, rows]) => {
        const filtered = typeFilter ? rows.filter((r) => r.grenade === typeFilter) : rows;
        const sorted = [...filtered].sort((a, b) => {
          const dir = sortDesc ? 1 : -1;
          if (sortKey === "count") return (b.count - a.count) * dir;
          if (sortKey === "demoCount") return (b.demoCount - a.demoCount) * dir;
          const wa = a.winRatePercent ?? -1;
          const wb = b.winRatePercent ?? -1;
          return (wb - wa) * dir;
        });
        return { mapName, rows: sorted };
      })
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [clusters, typeFilter, sortKey, sortDesc]);

  // ── 所有可用的 grenade 类型 ─────────────────────────────────────────────
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const c of clusters) types.add(c.grenade);
    return [...types].sort();
  }, [clusters]);

  // 地图 hover 时自动翻到对应页（all hooks before early returns）
  useEffect(() => {
    if (!hoveredId || byMap.length === 0) return;
    const idx = byMap[0]!.rows.findIndex((r) => r.id === hoveredId);
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE));
  }, [hoveredId, byMap]);

  // ── 渲染（空态提前返回） ──────────────────────────────────────────────

  if (error) return <EmptyState variant="error" title="Lineup 聚类失败" hint={error} />;
  if (loading) {
    return (
      <div className="stu-loading">
        扫描 {entries.length} 场 demo 的 grenades.json… ({progress}/{entries.length})
      </div>
    );
  }
  if (byMap.length === 0) {
    return (
      <EmptyState
        variant="insufficient"
        title="没有可聚类道具"
        hint="需要 v3 ZIP 中的 grenades.json 才能生成道具库。"
      />
    );
  }

  // ── 当前地图的分页数据（byMap 非空，current 安全） ───────────────────
  const current = byMap.find((group) => group.mapName === activeMap) ?? byMap[0]!;
  const totalPages = Math.max(1, Math.ceil(current.rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = current.rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const calibration = getMapCalibration(current.mapName);

  return (
    <div className="stu-lineup-layout">
      {/* ── 雷达 ──────────────────────────────────────────────────────── */}
      <div className="stu-card">
        <h3>Lineup 雷达 · {current.mapName.replace(/^de_/, "")}</h3>

        {byMap.length > 1 && (
          <div className="stu-chip-row" role="tablist" aria-label="地图选择">
            {byMap.map((group) => (
              <button
                key={group.mapName}
                type="button"
                role="tab"
                aria-selected={group.mapName === current.mapName}
                className={
                  group.mapName === current.mapName ? "stu-chip stu-chip-active" : "stu-chip"
                }
                onClick={() => {
                  setActiveMap(group.mapName);
                  setPage(0);
                }}
              >
                {group.mapName.replace(/^de_/, "")} · {group.rows.length}
              </button>
            ))}
          </div>
        )}

        {availableTypes.length > 1 && (
          <div className="stu-chip-row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className={typeFilter === null ? "stu-chip stu-chip-active" : "stu-chip"}
              onClick={() => {
                setTypeFilter(null);
                setPage(0);
              }}
            >
              全部
            </button>
            {availableTypes.map((type) => (
              <button
                key={type}
                type="button"
                className={typeFilter === type ? "stu-chip stu-chip-active" : "stu-chip"}
                onClick={() => {
                  setTypeFilter(typeFilter === type ? null : type);
                  setPage(0);
                }}
              >
                {GRENADE_LABEL[type] ?? type}
              </button>
            ))}
          </div>
        )}

        {calibration ? (
          <svg
            className="stu-duel-radar"
            viewBox={`0 0 ${calibration.radarSize} ${calibration.radarSize}`}
            role="img"
            aria-label={`${current.mapName} lineup 雷达图`}
          >
            <image
              href={`./maps/radars/${current.mapName}.png`}
              width={calibration.radarSize}
              height={calibration.radarSize}
              opacity={0.85}
            />
            {current.rows.slice(0, 60).map((cluster) => {
              const from = worldToRadar(cluster.throwPosition, calibration);
              const to = worldToRadar(cluster.effectPosition, calibration);
              const color = GRENADE_COLOR[cluster.grenade] ?? "#888";
              const isHovered = hoveredId === cluster.id;
              const hoveredColor = isHovered ? "#ffffff" : color;
              const hoveredWidth = isHovered ? 3 : 1.5;
              return (
                <g
                  key={cluster.id}
                  className={"stu-lineup-g" + (hoveredId === cluster.id ? " stu-lineup-g-hovered" : "")}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredId(cluster.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(cluster.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => handleClusterJump(cluster)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleClusterJump(cluster);
                    }
                  }}
                >
                  <title>
                    {GRENADE_LABEL[cluster.grenade] ?? cluster.grenade} · ×{cluster.count} ·{" "}
                    {cluster.demoCount} 场 · 投掷位{" "}
                    {cluster.throwerPlaceName
                      ? calloutName(cluster.mapName, cluster.throwerPlaceName)
                      : "—"}{" "}
                    · 胜率{" "}
                    {cluster.winRatePercent == null
                      ? "—"
                      : `${cluster.winRatePercent.toFixed(1)}%`}
                  </title>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={hoveredColor}
                    strokeWidth={hoveredWidth}
                    strokeOpacity={isHovered ? 1 : 0.6}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={from.x}
                    cy={from.y}
                    r={isHovered ? 6 : 4}
                    fill={hoveredColor}
                    stroke={isHovered ? "#fff" : "none"}
                    strokeWidth={1.5}
                    opacity={isHovered ? 1 : 0.7}
                  />
                  <circle
                    cx={to.x}
                    cy={to.y}
                    r={Math.min(12, 4 + cluster.count * 1.2)}
                    fill={color}
                    fillOpacity={isHovered ? 0.4 : 0.2}
                    stroke={hoveredColor}
                    strokeWidth={isHovered ? 2 : 1}
                    strokeOpacity={isHovered ? 1 : 0.6}
                  />
                </g>
              );
            })}
          </svg>
        ) : (
          <p className="stu-muted">{current.mapName} 缺少雷达标定，仅显示列表。</p>
        )}
      </div>

      {/* ── 表格 + 分页 ──────────────────────────────────────────────── */}
      <div className="stu-card">
        <h3>常用道具库 · {current.mapName}</h3>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          onChange={setPage}
          info={`${current.rows.length} 条 · ${safePage + 1}/${totalPages} 页`}
        />
        <table className="stu-mini-table">
          <thead>
            <tr>
              <th>道具</th>
              <th>方</th>
              <th>投掷位</th>
              <th>时间</th>
              <th>回合</th>
              <th className="stu-num stu-col-sortable" onClick={() => handleSort("count")}>
                次数{sortKey === "count" ? (sortDesc ? " ↓" : " ↑") : ""}
              </th>
              <th className="stu-num stu-col-sortable" onClick={() => handleSort("demoCount")}>
                场次{sortKey === "demoCount" ? (sortDesc ? " ↓" : " ↑") : ""}
              </th>
              <th className="stu-num stu-col-sortable" onClick={() => handleSort("winRate")}>
                胜率{sortKey === "winRate" ? (sortDesc ? " ↓" : " ↑") : ""}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((cluster) => {
              const firstThrow = cluster.throws[0];
              const place = cluster.throwerPlaceName
                ? calloutName(cluster.mapName, cluster.throwerPlaceName)
                : null;
              const timeBucket = cluster.throwTimeBucket ?? null;

              return (
                <tr
                  key={cluster.id}
                  className={hoveredId === cluster.id ? "stu-lineup-row-hovered" : ""}
                  onMouseEnter={() => setHoveredId(cluster.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(cluster.id)}
                  onBlur={() => setHoveredId(null)}
                >
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: GRENADE_COLOR[cluster.grenade] ?? "#888",
                        marginRight: 6,
                        verticalAlign: "middle",
                      }}
                    />
                    {GRENADE_LABEL[cluster.grenade] ?? displayWeaponName(cluster.grenade)}
                  </td>
                  <td>{cluster.side ? SIDE_LABEL[cluster.side] : "—"}</td>
                  <td>{place ?? "—"}</td>
                  <td>{timeBucket ?? "—"}</td>
                  <td>
                    R{cluster.roundNumbers.slice(0, 3).join("/")}
                    {cluster.roundNumbers.length > 3 ? "…" : ""}
                  </td>
                  <td className="stu-num">{cluster.count}</td>
                  <td className="stu-num">{cluster.demoCount}</td>
                  <td className="stu-num">
                    {cluster.winRatePercent == null ? "—" : `${cluster.winRatePercent.toFixed(1)}%`}
                  </td>
                  <td>
                    {firstThrow && (
                      <button
                        type="button"
                        className="stu-button-sm"
                        onClick={() =>
                          onOpenMatch(cluster.entryIds[0] ?? "", {
                            roundNumber: firstThrow.roundNumber,
                            tick: firstThrow.tick,
                          })
                        }
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
