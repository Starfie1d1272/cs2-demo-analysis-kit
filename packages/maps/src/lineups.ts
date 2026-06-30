import type { Vec3 } from "./nav.js";

/** CS2 竞技模式标准回合时长（秒，freeze 结束后）。 */
const ROUND_DURATION_SECONDS = 115;

export type LineupClusterMode = "loose" | "strict";

type GrenadeClusterKind = "smoke" | "molotov" | "incendiary" | "flashbang" | "he";

export const GRENADE_CLUSTER_PRESETS = {
  loose: {
    landingRadius: {
      smoke: 150,
      molotov: 180,
      incendiary: 170,
      flashbang: 220,
      he: 220,
    },
    originRadius: null,
  },
  strict: {
    landingRadius: {
      smoke: 96,
      molotov: 120,
      incendiary: 112,
      flashbang: 160,
      he: 160,
    },
    originRadius: {
      smoke: 64,
      molotov: 64,
      incendiary: 64,
      flashbang: 80,
      he: 80,
    },
  },
} as const;

export interface LineupPracticePose {
  position: Vec3;
  yaw: number;
  pitch: number;
}

export interface LineupThrowEvidence {
  entryId: string;
  roundNumber: number;
  tick: number;
  practicePose?: LineupPracticePose | null;
}

export interface LineupGrenadeLike {
  roundNumber: number;
  grenade: string;
  throwerIndex: number;
  throwTick: number;
  throwPosition: Vec3;
  effectPosition: Vec3;
  /** 投掷 tick 的玩家站位/视角，用于生成跑图练习命令。 */
  practicePose?: LineupPracticePose | null;
  /** 跨场聚类所需：区分各 demo 的 grenade 来源。 */
  entryId: string;
  /** 回合 freezeEndTick，用于计算投掷时间（throwTick - freezeEndTick → 秒）。 */
  freezeEndTick: number;
  /** 投掷时 thrower 所在的 callout 名（从 replay placeDict 解析）。 */
  throwerPlaceName?: string | null;
  /** 落点/生效点对应的 callout 名（从 3D callout grid 解析）。 */
  effectCallout?: string | null;
  /** effectCallout 的多数表决置信度。 */
  effectCalloutConfidence?: number | null;
  /** effectCallout 所在格采样数。 */
  effectCalloutSamples?: number | null;
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
  mode: LineupClusterMode;
  grenade: string;
  throwPosition: Vec3;
  effectPosition: Vec3;
  count: number;
  roundNumbers: number[];
  throwerIndices: number[];
  /** 聚类成员的投掷证据（demo + 回合 + throwTick），按时间排序；[0] 即最早一次投掷。 */
  throws: LineupThrowEvidence[];
  winRatePercent: number | null;
  /** 跨场记录：哪些 demo 含该 lineup。 */
  entryIds: string[];
  /** 跨场涉及的 demo 数（按 entryId 去重）。 */
  demoCount: number;
  /** 最高频投掷时间段（10 秒桶，如 "10-20s"），基于 freezeEndTick 偏移。 */
  throwTimeBucket: string | null;
  /** 最高频投掷位 callout（从 replay placeDict 取 thrower 位置）。 */
  throwerPlaceName: string | null;
  /** 最高频落点 callout（从 3D callout grid 取 effectPosition 位置）。 */
  effectCallout: string | null;
  /** 同簇内落点 callout 置信度均值。 */
  effectCalloutConfidence: number | null;
  /** 同簇内落点 callout 采样总数。 */
  effectCalloutSamples: number | null;
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
  /** strict=固定道具学习；loose=只看大致落点/区域频率。默认 strict。 */
  mode?: LineupClusterMode;
  /** tickrate，用于将 freeEndTick 偏移量转换为秒。默认 64。 */
  tickrate?: number;
}

/**
 * 按投掷位置 + 落点位置的空间容差聚类。跨场聚类应由调用方合并
 * 所有 entry 的 grenades 后单次调用，不可每场各调一次再 flat 拼合。
 *
 * throwerPlaceName 通过 replay player track 的 place 字段解析；
 * effectCallout 来自 Studio 3D callout grid，多数表决后进入簇摘要。
 */
export function buildLineupClusters({
  mapName,
  grenades,
  roundWinners,
  throwerTeam,
  throwToleranceUnits,
  effectToleranceUnits,
  mode = "strict",
  tickrate = 64
}: BuildLineupClustersOptions): LineupCluster[] {
  const clusters: Array<
    LineupCluster & { wins: number; teamRounds: number }
  > = [];
  // 辅助 map：记录 throwTimeBucket 的频次分布，用于取 mode
  const bucketCounts: Array<Map<string, number>> = [];
  const placeCounts: Array<Map<string, number>> = [];
  const effectCalloutCounts: Array<Map<string, number>> = [];
  const effectCalloutStats: Array<Map<string, { confidenceSum: number; confidenceCount: number; samples: number }>> = [];
  const sideCounts: Array<Map<string, number>> = [];

  for (const grenade of grenades) {
    const effectTolerance = effectToleranceUnits ?? landingRadiusFor(mode, grenade.grenade);
    const throwTolerance = throwToleranceUnits ?? originRadiusFor(mode, grenade.grenade);
    const existing = clusters.find((cluster) =>
      cluster.grenade === grenade.grenade &&
      (throwTolerance == null || distance(cluster.throwPosition, grenade.throwPosition) <= throwTolerance) &&
      distance(cluster.effectPosition, grenade.effectPosition) <= effectTolerance
    );
    const team = throwerTeam?.(grenade.throwerIndex) ?? grenade.teamKey ?? null;
    const winner = roundWinners?.get(`${grenade.entryId}:${grenade.roundNumber}`) ?? null;
    const won = team != null && winner === team;
    const counted = team != null && winner != null;
    const target = existing ?? {
      id: `${mapName}:${mode}:${grenade.grenade}:${clusters.length + 1}`,
      mapName,
      mode,
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
      effectCallout: null,
      effectCalloutConfidence: null,
      effectCalloutSamples: null,
      side: null,
    };

    const idx = existing ? clusters.indexOf(existing) : clusters.length;
    if (!existing) {
      bucketCounts.push(new Map());
      placeCounts.push(new Map());
      effectCalloutCounts.push(new Map());
      effectCalloutStats.push(new Map());
      sideCounts.push(new Map());
    }

    // 基础计数
    target.count += 1;
    target.roundNumbers.push(grenade.roundNumber);
    target.throwerIndices.push(grenade.throwerIndex);
    target.throws.push({
      entryId: grenade.entryId,
      roundNumber: grenade.roundNumber,
      tick: grenade.throwTick,
      practicePose: grenade.practicePose ?? null,
    });
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

    // 落点 callout
    if (grenade.effectCallout) {
      const ec = effectCalloutCounts[idx];
      ec.set(grenade.effectCallout, (ec.get(grenade.effectCallout) ?? 0) + 1);
      const statsByCallout = effectCalloutStats[idx];
      const stats = statsByCallout.get(grenade.effectCallout) ?? { confidenceSum: 0, confidenceCount: 0, samples: 0 };
      if (typeof grenade.effectCalloutConfidence === "number") {
        stats.confidenceSum += grenade.effectCalloutConfidence;
        stats.confidenceCount += 1;
      }
      if (typeof grenade.effectCalloutSamples === "number") {
        stats.samples += grenade.effectCalloutSamples;
      }
      statsByCallout.set(grenade.effectCallout, stats);
    }

    // side
    if (grenade.side) {
      const sc = sideCounts[idx];
      sc.set(grenade.side, (sc.get(grenade.side) ?? 0) + 1);
    }

    if (!existing) clusters.push(target);
  }

  return clusters
    .map((cluster, i) => {
      const effectCallout = modeOfMap(effectCalloutCounts[i]);
      const effectStats = effectCallout ? effectCalloutStats[i].get(effectCallout) : undefined;
      return {
        ...cluster,
        roundNumbers: [...new Set(cluster.roundNumbers)].sort((a, b) => a - b),
        throwerIndices: [...new Set(cluster.throwerIndices)].sort((a, b) => a - b),
        throws: [...cluster.throws].sort((a, b) =>
          a.entryId.localeCompare(b.entryId) || a.roundNumber - b.roundNumber || a.tick - b.tick
        ),
        winRatePercent: cluster.teamRounds > 0
          ? Math.round((cluster.wins / cluster.teamRounds) * 1000) / 10
          : null,
        entryIds: [...new Set(cluster.entryIds)].sort(),
        demoCount: new Set(cluster.entryIds).size,
        throwTimeBucket: modeOfMap(bucketCounts[i]),
        throwerPlaceName: modeOfMap(placeCounts[i]),
        effectCallout,
        effectCalloutConfidence: effectStats && effectStats.confidenceCount > 0
          ? Math.round((effectStats.confidenceSum / effectStats.confidenceCount) * 1000) / 1000
          : null,
        effectCalloutSamples: effectStats && effectStats.samples > 0 ? effectStats.samples : null,
        side: modeOfMap(sideCounts[i]) as "t" | "ct" | null,
      };
    })
    .sort((a, b) => b.count - a.count || a.grenade.localeCompare(b.grenade));
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function grenadeKind(grenade: string): GrenadeClusterKind {
  const value = grenade.toLowerCase();
  if (value.includes("smoke")) return "smoke";
  if (value.includes("molotov")) return "molotov";
  if (value.includes("incendiary") || value.includes("incgrenade")) return "incendiary";
  if (value.includes("flash")) return "flashbang";
  return "he";
}

function landingRadiusFor(mode: LineupClusterMode, grenade: string): number {
  return GRENADE_CLUSTER_PRESETS[mode].landingRadius[grenadeKind(grenade)];
}

function originRadiusFor(mode: LineupClusterMode, grenade: string): number | null {
  const radius = GRENADE_CLUSTER_PRESETS[mode].originRadius;
  return radius ? radius[grenadeKind(grenade)] : null;
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
