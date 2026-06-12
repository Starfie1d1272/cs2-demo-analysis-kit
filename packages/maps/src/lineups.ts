import type { Vec3 } from "./nav.js";

export interface LineupGrenadeLike {
  roundNumber: number;
  grenade: string;
  throwerIndex: number;
  throwTick: number;
  throwPosition: Vec3;
  effectPosition: Vec3;
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
}

export interface BuildLineupClustersOptions {
  mapName: string;
  grenades: LineupGrenadeLike[];
  roundWinners?: Map<number, string>;
  throwerTeam?: (throwerIndex: number) => string | null;
  throwToleranceUnits?: number;
  effectToleranceUnits?: number;
}

export function buildLineupClusters({
  mapName,
  grenades,
  roundWinners,
  throwerTeam,
  throwToleranceUnits = 128,
  effectToleranceUnits = 160
}: BuildLineupClustersOptions): LineupCluster[] {
  const clusters: Array<LineupCluster & { wins: number; teamRounds: number }> = [];
  for (const grenade of grenades) {
    const existing = clusters.find((cluster) =>
      cluster.grenade === grenade.grenade &&
      distance(cluster.throwPosition, grenade.throwPosition) <= throwToleranceUnits &&
      distance(cluster.effectPosition, grenade.effectPosition) <= effectToleranceUnits
    );
    const team = throwerTeam?.(grenade.throwerIndex) ?? null;
    const winner = roundWinners?.get(grenade.roundNumber) ?? null;
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
      teamRounds: 0
    };
    target.count += 1;
    target.roundNumbers.push(grenade.roundNumber);
    target.throwerIndices.push(grenade.throwerIndex);
    target.throws.push({ roundNumber: grenade.roundNumber, tick: grenade.throwTick });
    target.throwPosition = averagePoint(target.throwPosition, grenade.throwPosition, target.count);
    target.effectPosition = averagePoint(target.effectPosition, grenade.effectPosition, target.count);
    if (counted) target.teamRounds += 1;
    if (won) target.wins += 1;
    if (!existing) clusters.push(target);
  }
  return clusters
    .map(({ wins, teamRounds, ...cluster }) => ({
      ...cluster,
      roundNumbers: [...new Set(cluster.roundNumbers)].sort((a, b) => a - b),
      throwerIndices: [...new Set(cluster.throwerIndices)].sort((a, b) => a - b),
      throws: [...cluster.throws].sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick),
      winRatePercent: teamRounds > 0 ? Math.round(wins / teamRounds * 1000) / 10 : null
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
    z: current.z + (next.z - current.z) / count
  };
}

