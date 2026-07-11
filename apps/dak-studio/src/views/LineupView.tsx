import { useEffect, useMemo, useState } from "react";
import {
  buildLineupClusters,
  getMapCalibration,
  worldToRadar,
  calloutCn,
  type LineupCluster,
  type LineupClusterMode,
  type LineupGrenadeLike,
} from "@cs2dak/maps";
import { displayWeaponName } from "@cs2dak/presentation";
import { DataTable, STUDIO_TABLE_CLASSES, EmptyState, MetricInfo, EvidenceLink, type DataTableColumn } from "@cs2dak/react";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { mapDisplayName } from "../lib/series";
import { getFactsStore } from "../lib/facts";
import { GRENADE_COLOR } from "../components/RadarTrails";
import { savePracticeLineup } from "../lib/practice-lineups";

// ── 常亮 ────────────────────────────────────────────────────────────────────

const GRENADE_LABEL: Record<string, string> = {
  flashbang: "闪光",
  smoke: "烟",
  molotov: "火",
  incendiary: "火",
  hegrenade: "雷",
  decoy: "诱饵",
};

const SIDE_LABEL: Record<string, string> = { t: "T", ct: "CT" };
const MODE_LABEL: Record<LineupClusterMode, { label: string; hint: string }> = {
  strict: { label: "精聚类", hint: "固定站位 + 固定落点，用来找可学习的高频道具。" },
  loose: { label: "粗聚类", hint: "只看落点区域，用来回答这类道具大概打哪里。" },
};

const PAGE_SIZE = 20;
const TOP_N_OPTIONS = [20, 40, 60] as const;
type TopNOption = (typeof TOP_N_OPTIONS)[number];

// ── 数据加载与 callout 解析 ──────────────────────────────────────────────────

interface LoadedGrenades {
  entryId: string;
  mapName: string;
  grenades: LineupGrenadeLike[];
  winners: Map<string, string>;
  tickrate: number;
}

async function loadAllGrenades(
  entries: StudioDemoEntry[],
  onProgress?: (done: number) => void
): Promise<LoadedGrenades[]> {
  const facts = await getFactsStore().getLineups({ matchIds: entries.map(matchIdForEntry) });
  const entryIdByMatchId = new Map(entries.map((entry) => [matchIdForEntry(entry), entry.id]));
  onProgress?.(facts.length);
  return facts.map((fact) => {
    const entryId = entryIdByMatchId.get(fact.matchId) ?? fact.matchId;
    return {
      entryId,
      mapName: fact.mapName,
      tickrate: fact.tickrate,
      grenades: fact.grenades.map((grenade) => ({ ...grenade, entryId })),
      winners: new Map(fact.roundWinners.map(([key, value]) => [key.replace(`${fact.matchId}:`, `${entryId}:`), value]))
    };
  });
}

/** 英文 callout → 中文（有映射时）。 */
function calloutName(mapName: string, place: string): string {
  return calloutCn(mapName, place) || place;
}

// ── 组件 ────────────────────────────────────────────────────────────────────

export function LineupView({
  entries,
  onOpenMatch,
  onWatchDemo,
}: {
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
}) {
  const [clusters, setClusters] = useState<LineupCluster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeMap, setActiveMap] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sideFilter, setSideFilter] = useState<"t" | "ct" | null>(null);
  const [page, setPage] = useState(0);
  const [radarTopN, setRadarTopN] = useState<TopNOption>(20);
  const [clusterMode, setClusterMode] = useState<LineupClusterMode>("strict");
  const [copiedClusterId, setCopiedClusterId] = useState<string | null>(null);
  const [savedClusterId, setSavedClusterId] = useState<string | null>(null);
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  function handleClusterJump(cluster: LineupCluster) {
    const first = cluster.throws[0];
    if (first) onOpenMatch(first.entryId, { roundNumber: first.roundNumber, tick: first.tick });
  }

  async function handleCopyPractice(cluster: LineupCluster) {
    const command = practiceCommandForCluster(cluster);
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      window.prompt("复制练习命令", command);
    }
    setCopiedClusterId(cluster.id);
    window.setTimeout(() => setCopiedClusterId((current) => current === cluster.id ? null : current), 1400);
  }

  async function handleSavePractice(cluster: LineupCluster) {
    await savePracticeLineup(cluster, practiceCommandForCluster(cluster));
    setSavedClusterId(cluster.id);
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

    loadAllGrenades(entries, (done) => {
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
            mode: clusterMode,
            tickrate: group.tickrate,
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
  }, [entries, clusterMode]);

  // ── 按地图分组 + 类型筛选（排序交由 DataTable） ──────────────────────────
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
        return { mapName, rows: filtered };
      })
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [clusters, typeFilter]);

  // ── 所有可用的 grenade 类型 ─────────────────────────────────────────────
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const c of clusters) types.add(c.grenade);
    return [...types].sort();
  }, [clusters]);

  // 列定义：必须在所有 early return 之前声明，否则 Hook 数量随 loading 态变化导致崩溃
  const lineupColumns = useMemo<DataTableColumn<LineupCluster>[]>(() => [
    {
      key: "grenade", label: "道具",
      render: (c) => <>
        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: GRENADE_COLOR[c.grenade] ?? "#888", marginRight: 6, verticalAlign: "middle" }} />
        {GRENADE_LABEL[c.grenade] ?? displayWeaponName(c.grenade)}
      </>
    },
    { key: "side", label: "方", format: (c) => c.side ? SIDE_LABEL[c.side] : "—" },
    { key: "throwPlace", label: "投掷位", format: (c) => c.throwerPlaceName ? calloutName(c.mapName, c.throwerPlaceName) : "—" },
    {
      key: "effectPlace", label: "落点",
      render: (c) => <span title={c.effectCalloutConfidence != null ? `confidence ${c.effectCalloutConfidence.toFixed(2)} · samples ${c.effectCalloutSamples ?? 0}` : undefined}>{c.effectCallout ? calloutName(c.mapName, c.effectCallout) : "—"}</span>,
    },
    { key: "time", label: "时间", format: (c) => c.throwTimeBucket ?? "—" },
    {
      key: "rounds",
      label: "出现回合",
      render: (c) => (
        <span className="stu-lineup-rounds" title={`全部回合：${c.roundNumbers.map((n) => `R${n}`).join("、")}`}>
          <b>{c.roundNumbers.length} 回合</b>
          <small>{formatRoundNumbers(c.roundNumbers)}</small>
        </span>
      )
    },
    { key: "count", label: "次数", numeric: true, sortable: true, sortValue: (c) => c.count, format: (c) => c.count },
    { key: "demoCount", label: "场次", numeric: true, sortable: true, sortValue: (c) => c.demoCount, format: (c) => c.demoCount },
    {
      key: "winRate", label: <>胜率<MetricInfo note="该道具点位所在回合的本方胜率；样本小仅供参考" /></>, numeric: true, sortable: true,
      sortValue: (c) => c.winRatePercent,
      format: (c) => c.winRatePercent == null ? "—" : `${c.winRatePercent.toFixed(1)}%`,
    },
    {
      key: "replay", label: "",
      render: (c) => {
        const firstThrow = c.throws[0];
        const watchThrow = c.throws.find((row) => entryById.get(row.entryId)?.sourceDemPath);
        const practiceCommand = practiceCommandForCluster(c);
        return firstThrow ? (
          <span className="stu-lineup-actions">
            <EvidenceLink hint="打开该场比赛复盘并定位该点位投掷" onOpen={() => onOpenMatch(firstThrow.entryId, { roundNumber: firstThrow.roundNumber, tick: firstThrow.tick })}>
              回放
            </EvidenceLink>
            {practiceCommand && (
              <button
                type="button"
                className="stu-button-sm"
                title={`复制跑图练习命令：传送到投掷站位并设置视角\n${practiceCommand}`}
                aria-label="复制跑图练习命令"
                onClick={() => void handleCopyPractice(c)}
              >
                {copiedClusterId === c.id ? "已复制" : "复制命令"}
              </button>
            )}
            <button type="button" className="stu-button-sm" title="保存为本地点位练习素材；不会把普通浏览自动写入资料库" onClick={() => void handleSavePractice(c)}>
              {savedClusterId === c.id ? "已保存" : "保存点位"}
            </button>
            {watchThrow && onWatchDemo && (
              <button type="button" className="stu-button-sm" title="在 CS2 中打开原始 demo，并尝试跳到该投掷 tick" onClick={() => onWatchDemo(watchThrow.entryId, { roundNumber: watchThrow.roundNumber, tick: watchThrow.tick })}>
                进游戏
              </button>
            )}
          </span>
        ) : null;
      }
    },
  ], [copiedClusterId, savedClusterId, entryById, onOpenMatch, onWatchDemo]);

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

  // ── 当前地图数据（byMap 非空，current 安全） ─────────────────────────
  const current = byMap.find((group) => group.mapName === activeMap) ?? byMap[0]!;
  const sideFilteredRows = sideFilter
    ? current.rows.filter((r) => r.side === sideFilter)
    : current.rows;
  const calibration = getMapCalibration(current.mapName);
  const radarSideFiltered = sideFilter
    ? current.rows.filter((r) => r.side === sideFilter)
    : current.rows;
  const radarRows = radarSideFiltered.slice(0, radarTopN);
  const selectedCluster = hoveredId ? current.rows.find((cluster) => cluster.id === hoveredId) : undefined;
  const radarClusters = selectedCluster && !radarRows.some((cluster) => cluster.id === selectedCluster.id)
    ? [...radarRows, selectedCluster]
    : radarRows;

  return (
    <div className="stu-lineup-layout">
      {/* ── 雷达 ──────────────────────────────────────────────────────── */}
      <div className="stu-card">
        <h3>道具点位雷达 · {mapDisplayName(current.mapName)}</h3>

        <div className="stu-chip-row" role="tablist" aria-label="聚类模式">
          {(["strict", "loose"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={clusterMode === mode}
              className={clusterMode === mode ? "stu-chip stu-chip-active" : "stu-chip"}
              title={MODE_LABEL[mode].hint}
              onClick={() => {
                setClusterMode(mode);
                setPage(0);
              }}
            >
              {MODE_LABEL[mode].label}
            </button>
          ))}
          <span className="stu-muted stu-chip-row-label">{MODE_LABEL[clusterMode].hint}</span>
        </div>

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
                {mapDisplayName(group.mapName)} · {group.rows.length}
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

        <div className="stu-chip-row" role="tablist" aria-label="阵营筛选" style={{ marginTop: 8 }}>
          <button
            type="button"
            role="tab"
            aria-selected={sideFilter === null}
            className={sideFilter === null ? "stu-chip stu-chip-active" : "stu-chip"}
            onClick={() => { setSideFilter(null); setPage(0); }}
          >
            全部
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sideFilter === "t"}
            className={sideFilter === "t" ? "stu-chip stu-chip-active" : "stu-chip"}
            onClick={() => { setSideFilter("t"); setPage(0); }}
          >
            T · {current.rows.filter((r) => r.side === "t").length}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sideFilter === "ct"}
            className={sideFilter === "ct" ? "stu-chip stu-chip-active" : "stu-chip"}
            onClick={() => { setSideFilter("ct"); setPage(0); }}
          >
            CT · {current.rows.filter((r) => r.side === "ct").length}
          </button>
        </div>

        <div className="stu-chip-row stu-lineup-topn" role="radiogroup" aria-label="雷达显示数量">
          {TOP_N_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={radarTopN === value}
              className={radarTopN === value ? "stu-chip stu-chip-active" : "stu-chip"}
              onClick={() => setRadarTopN(value)}
            >
              Top {value}
            </button>
          ))}
        </div>

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
            {radarClusters.map((cluster) => {
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
                    → 落点{" "}
                    {cluster.effectCallout
                      ? calloutName(cluster.mapName, cluster.effectCallout)
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
          <p className="stu-muted">{mapDisplayName(current.mapName)} 缺少雷达标定，仅显示列表。</p>
        )}
      </div>

      {/* ── 表格（DataTable：受控分页 + rowProps hover 联动雷达） ──── */}
      <div className="stu-card">
        <h3>道具点位库 · {mapDisplayName(current.mapName)}</h3>
        <p className="stu-muted">练习命令复现投掷 tick 的玩家站位和视角；跑动、跳投和组合键细节仍建议点“回放”或“进游戏”核对原始 demo。</p>
        <DataTable
          classes={STUDIO_TABLE_CLASSES}
          rows={sideFilteredRows}
          rowKey={(c) => c.id}
          initialSortKey="count"
          pageSize={PAGE_SIZE}
          page={page}
          onPageChange={setPage}
          paginationInfo={(total) => `${total} 条`}
          rowProps={(cluster) => ({
            className: hoveredId === cluster.id ? "stu-lineup-row-hovered" : "",
            onMouseEnter: () => setHoveredId(cluster.id),
            onMouseLeave: () => setHoveredId(null),
            onFocus: () => setHoveredId(cluster.id),
            onBlur: () => setHoveredId(null),
          })}
          columns={lineupColumns}
        />
      </div>
    </div>
  );
}

function weaponForGrenade(grenade: string): string {
  const value = grenade.toLowerCase();
  if (value.includes("smoke")) return "weapon_smokegrenade";
  if (value.includes("molotov")) return "weapon_molotov";
  if (value.includes("incendiary") || value.includes("incgrenade")) return "weapon_incgrenade";
  if (value.includes("flash")) return "weapon_flashbang";
  if (value.includes("he")) return "weapon_hegrenade";
  return `weapon_${value}`;
}

function formatCommandNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0";
}

function practiceCommandForCluster(cluster: LineupCluster): string | null {
  const sample = cluster.throws.find((row) => row.practicePose);
  const pose = sample?.practicePose;
  if (!pose) return null;
  return [
    "sv_cheats 1",
    "bot_kick",
    "sv_infinite_ammo 1",
    "sv_grenade_trajectory_prac_pipreview 1",
    `give ${weaponForGrenade(cluster.grenade)}`,
    `setpos_exact ${formatCommandNumber(pose.position.x)} ${formatCommandNumber(pose.position.y)} ${formatCommandNumber(pose.position.z)}`,
    `setang ${formatCommandNumber(pose.pitch)} ${formatCommandNumber(pose.yaw)} 0`,
  ].join("; ");
}

function formatRoundNumbers(roundNumbers: number[]): string {
  const sorted = [...new Set(roundNumbers)].sort((a, b) => a - b);
  const head = sorted.slice(0, 5).map((n) => `R${n}`).join(" / ");
  return sorted.length > 5 ? `${head} / …` : head || "—";
}
