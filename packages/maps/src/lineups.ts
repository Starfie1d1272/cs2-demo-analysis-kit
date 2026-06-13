import type { Vec3 } from "./nav.js";

/** CS2 竞技模式标准回合时长（秒，freeze 结束后）。 */
const ROUND_DURATION_SECONDS = 115;

export interface LineupGrenadeLike {
  roundNumber: number;
  grenade: string;
  throwerIndex: number;
  throwTick: number;
  throwPosition: Vec3;
  effectPosition: Vec3;
  /** 跨场聚类所需：区分各 demo 的 grenade 来源。 */
  entryId: string;
  /** 回合 freezeEndTick，用于计算投掷时间（throwTick - freezeEndTick → 秒）。 */
  freezeEndTick: number;
  /** 投掷时 thrower 所在的 callout 名（从 replay placeDict 解析）。 */
  throwerPlaceName?: string | null;
  /** thrower 所在方。 */
  side?: "t" | "ct" | null;
  /**
   * thrower 的队伍 key（"teamA" / "teamB"），跨场聚类时替代 throwerTeam 回调。
   * 单场场景下 throwerTeam 回调也能用，但跨场后 playerIndex 不复跨场有效。
   */
  teamKey?: string | null;
}

export interface LineupCluster {
  id: string;
  mapName: string;
  grenade: string;
  throwPosition: Vec3;
  effectPosition: Vec3;
  count: number;
  roundNumbers: number[];
  throwerIndices: number[];
  /** 聚类成员的投掷证据（回合 + throwTick），按时间排序；[0] 即最早一次投掷。 */
  throws: Array<{ roundNumber: number; tick: number }>;
  winRatePercent: number | null;
  /** 跨场记录：哪些 demo 含该 lineup。 */
  entryIds: string[];
  /** 跨场涉及的 demo 数（按 entryId 去重）。 */
  demoCount: number;
  /** 最高频投掷时间段（10 秒桶，如 "10-20s"），基于 freezeEndTick 偏移。 */
  throwTimeBucket: string | null;
  /** 最高频投掷位 callout（从 replay placeDict 取 thrower 位置）。 */
  throwerPlaceName: string | null;
  /** 最高频 side。 */
  side: "t" | "ct" | null;
}

export interface BuildLineupClustersOptions {
  mapName: string;
  grenades: LineupGrenadeLike[];
  /** key: `${entryId}:${roundNumber}`，跨场场景下每场 roundNumber 会重复，需加 entryId 前缀。 */
  roundWinners?: Map<string, string>;
  throwerTeam?: (throwerIndex: number) => string | null;
  throwToleranceUnits?: number;
  effectToleranceUnits?: number;
  /** tickrate，用于将 freeEndTick 偏移量转换为秒。默认 64。 */
  tickrate?: number;
}

/**
 * 按投掷位置 + 落点位置的空间容差聚类。跨场聚类应由调用方合并
 * 所有 entry 的 grenades 后单次调用，不可每场各调一次再 flat 拼合。
 *
 * TODO: effectPosition 的 callout 标注待 zone 多边形标定覆盖更多地图后补全。
 * 当前仅支持 throwerPlaceName（通过 replay player track 的 place 字段解析），
 * 不包含 effectPosition 对应的 callout —— 后者需要 zoneAt() 做点 → 区归属
 * （目前 4/7 图有 zone 标定，见 MAP_ZONE_ASSETS）。
 */
export function buildLineupClusters({
  mapName,
  grenades,
  roundWinners,
  throwerTeam,
  throwToleranceUnits = 128,
  effectToleranceUnits = 160,
  tickrate = 64
}: BuildLineupClustersOptions): LineupCluster[] {
  const clusters: Array<
    LineupCluster & { wins: number; teamRounds: number }
  > = [];
  // 辅助 map：记录 throwTimeBucket 的频次分布，用于取 mode
  const bucketCounts: Array<Map<string, number>> = [];
  const placeCounts: Array<Map<string, number>> = [];
  const sideCounts: Array<Map<string, number>> = [];

  for (const grenade of grenades) {
    const existing = clusters.find((cluster) =>
      cluster.grenade === grenade.grenade &&
      distance(cluster.throwPosition, grenade.throwPosition) <= throwToleranceUnits &&
      distance(cluster.effectPosition, grenade.effectPosition) <= effectToleranceUnits
    );
    const team = throwerTeam?.(grenade.throwerIndex) ?? grenade.teamKey ?? null;
    const winner = roundWinners?.get(`${grenade.entryId}:${grenade.roundNumber}`) ?? null;
    const won = team != null && winner === team;
    const counted = team != null && winner != null;
    const target = existing ?? {
      id: `${mapName}:${grenade.grenade}:${clusters.length + 1}`,
      mapName,
      grenade: grenade.grenade,
      throwPosition: grenade.throwPosition,
      effectPosition: grenade.effectPosition,
      count: 0,
      roundNumbers: [],
      throwerIndices: [],
      throws: [],
      winRatePercent: null,
      wins: 0,
      teamRounds: 0,
      entryIds: [],
      demoCount: 0,
      throwTimeBucket: null,
      throwerPlaceName: null,
      side: null,
    };

    const idx = existing ? clusters.indexOf(existing) : clusters.length;
    if (!existing) {
      bucketCounts.push(new Map());
      placeCounts.push(new Map());
      sideCounts.push(new Map());
    }

    // 基础计数
    target.count += 1;
    target.roundNumbers.push(grenade.roundNumber);
    target.throwerIndices.push(grenade.throwerIndex);
    target.throws.push({ roundNumber: grenade.roundNumber, tick: grenade.throwTick });
    target.throwPosition = averagePoint(target.throwPosition, grenade.throwPosition, target.count);
    target.effectPosition = averagePoint(target.effectPosition, grenade.effectPosition, target.count);
    if (counted) target.teamRounds += 1;
    if (won) target.wins += 1;

    // 跨场条目追踪
    if (!target.entryIds.includes(grenade.entryId)) {
      target.entryIds.push(grenade.entryId);
    }
    target.demoCount = target.entryIds.length;

    // 投掷时间：10 秒桶 → 倒计时（距 freezeEnd 的剩余秒数，CS2 标准 1:55 回合）
    if (grenade.freezeEndTick > 0) {
      const secondsSinceFreeze = (grenade.throwTick - grenade.freezeEndTick) / tickrate;
      if (secondsSinceFreeze >= 0) {
        const bucketStart = Math.floor(secondsSinceFreeze / 10) * 10;
        const midpoint = bucketStart + 5; // 桶中值，如 10-20s 桶取 15s
        const remaining = Math.max(0, ROUND_DURATION_SECONDS - midpoint);
        const label = `${Math.floor(remaining / 60)}:${String(Math.round(remaining % 60)).padStart(2, "0")}`;
        const bc = bucketCounts[idx];
        bc.set(label, (bc.get(label) ?? 0) + 1);
      }
    }

    // 投掷位 callout
    if (grenade.throwerPlaceName) {
      const pc = placeCounts[idx];
      pc.set(grenade.throwerPlaceName, (pc.get(grenade.throwerPlaceName) ?? 0) + 1);
    }

    // side
    if (grenade.side) {
      const sc = sideCounts[idx];
      sc.set(grenade.side, (sc.get(grenade.side) ?? 0) + 1);
    }

    if (!existing) clusters.push(target);
  }

  return clusters
    .map((cluster, i) => ({
      ...cluster,
      roundNumbers: [...new Set(cluster.roundNumbers)].sort((a, b) => a - b),
      throwerIndices: [...new Set(cluster.throwerIndices)].sort((a, b) => a - b),
      throws: [...cluster.throws].sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick),
      winRatePercent: cluster.teamRounds > 0
        ? Math.round((cluster.wins / cluster.teamRounds) * 1000) / 10
        : null,
      entryIds: [...new Set(cluster.entryIds)].sort(),
      demoCount: new Set(cluster.entryIds).size,
      throwTimeBucket: modeOfMap(bucketCounts[i]),
      throwerPlaceName: modeOfMap(placeCounts[i]),
      side: modeOfMap(sideCounts[i]) as "t" | "ct" | null,
    }))
    .sort((a, b) => b.count - a.count || a.grenade.localeCompare(b.grenade));
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function averagePoint(current: Vec3, next: Vec3, count: number): Vec3 {
  if (count <= 1) return next;
  return {
    x: current.x + (next.x - current.x) / count,
    y: current.y + (next.y - current.y) / count,
    z: current.z + (next.z - current.z) / count,
  };
}

/** 取 Map<string, number> 中 value 最大的 key；空 map 返回 null。 */
function modeOfMap(map: Map<string, number>): string | null {
  if (map.size === 0) return null;
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of map) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey;
}
