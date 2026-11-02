import { FLAG_ALIVE, type TeamKey } from "@cs2dak/contract";
import { findNavPath, nearestNavArea, pointInPolygon, type CalloutGrid, type CompactNav, type Vec3 } from "@cs2dak/maps";
import { replayCalloutAt, replayPointAt, replayTickAt, type ReplayRoundContext, type ReplayRoundTrack } from "../tactics/replay-round-context.js";

export interface SpatialPlayerSample {
  playerIndex: number;
  track: ReplayRoundTrack;
  point: Vec3;
  callout: string | null;
  navAreaId: number | null;
}

export interface TeamSpatialFrame {
  tick: number;
  teamKey: TeamKey;
  side: "t" | "ct";
  players: SpatialPlayerSample[];
  components: number[][];
}

const COMPONENT_DISTANCE = 800;
const SAME_CALLOUT_DISTANCE = 1200;
const MAX_NAV_HOPS = 10;
const navConnectivityCache = new WeakMap<CompactNav, Map<string, boolean>>();

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function finitePoint(point: Vec3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function navConnected(nav: CompactNav, first: number, second: number): boolean {
  const key = first < second ? `${first}:${second}` : `${second}:${first}`;
  const cache = navConnectivityCache.get(nav) ?? new Map<string, boolean>();
  if (!navConnectivityCache.has(nav)) navConnectivityCache.set(nav, cache);
  const cached = cache.get(key);
  if (cached != null) return cached;
  const forward = findNavPath(nav, first, second);
  const reverse = forward.length === 0 ? findNavPath(nav, second, first) : forward;
  const connected = reverse.length > 0 && reverse.length <= MAX_NAV_HOPS;
  cache.set(key, connected);
  return connected;
}

function areConnected(first: SpatialPlayerSample, second: SpatialPlayerSample, nav: CompactNav | null): boolean {
  const straight = distance(first.point, second.point);
  if (straight > COMPONENT_DISTANCE && !(first.callout && first.callout === second.callout && straight <= SAME_CALLOUT_DISTANCE)) return false;
  if (!nav || first.navAreaId == null || second.navAreaId == null) return true;
  return navConnected(nav, first.navAreaId, second.navAreaId);
}

function components(players: readonly SpatialPlayerSample[], nav: CompactNav | null): number[][] {
  const remaining = new Set(players.map((player) => player.playerIndex));
  const byIndex = new Map(players.map((player) => [player.playerIndex, player]));
  const groups: number[][] = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value as number;
    remaining.delete(first);
    const group = [first];
    for (let cursor = 0; cursor < group.length; cursor += 1) {
      const current = byIndex.get(group[cursor]!)!;
      for (const candidate of [...remaining]) {
        if (!areConnected(current, byIndex.get(candidate)!, nav)) continue;
        remaining.delete(candidate);
        group.push(candidate);
      }
    }
    groups.push(group.sort((a, b) => a - b));
  }
  return groups.sort((a, b) => b.length - a.length || a[0]! - b[0]!);
}

/** Build once per extraction; preserve the exact nav ordering and fallback semantics. */
export function createNavAreaLookup(nav: CompactNav | null): (point: Vec3) => number | null {
  if (!nav) return () => null;
  const cellSize = 256;
  const cells = new Map<string, Array<{ area: CompactNav["areas"][number]; polygon: Array<[number, number]> }>>();
  for (const area of nav.areas) {
    if (!area.corners.length) continue;
    const xs = area.corners.map(p => p.x), ys = area.corners.map(p => p.y);
    const minX = Math.floor(Math.min(...xs) / cellSize), maxX = Math.floor(Math.max(...xs) / cellSize);
    const minY = Math.floor(Math.min(...ys) / cellSize), maxY = Math.floor(Math.max(...ys) / cellSize);
    if (![minX, maxX, minY, maxY].every(Number.isFinite) || (maxX - minX + 1) * (maxY - minY + 1) > 10000) {
      return point => nearestNavArea(nav, point)?.id ?? null;
    }
    const polygon = area.corners.map(p => [p.x, p.y] as [number, number]);
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      const key = `${x}:${y}`; const bucket = cells.get(key) ?? []; bucket.push({ area, polygon }); cells.set(key, bucket);
    }
  }
  return point => {
    const candidates = cells.get(`${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`) ?? [];
    let best: CompactNav["areas"][number] | undefined;
    let bestZ = Infinity;
    for (const {area, polygon} of candidates) {
      if (!pointInPolygon(point.x, point.y, polygon)) continue;
      const z = Math.abs(point.z - area.centroid.z);
      if (z < bestZ) { best = area; bestZ = z; }
    }
    return (best ?? nearestNavArea(nav, point))?.id ?? null;
  };
}

/** Builds only the current round's short-lived spatial samples; never persist this structure. */
export function buildRoundSpatialFrames(
  context: ReplayRoundContext,
  grid: CalloutGrid | null,
  nav: CompactNav | null,
  navAreaAt: (point: Vec3) => number | null = createNavAreaLookup(nav),
): TeamSpatialFrame[] {
  const frames: TeamSpatialFrame[] = [];
  for (let frameIndex = 0; frameIndex < context.frameCount; frameIndex += 1) {
    const tick = replayTickAt(context, frameIndex);
    if (tick < context.round.freezeEndTick || tick > context.round.endTick) continue;
    for (const side of ["t", "ct"] as const) {
      const teamKey: TeamKey = context.round.teamASide === side ? "teamA" : "teamB";
      const players = context.tracks
        .filter((track) => track.side === side && ((track.flags[frameIndex] ?? 0) & FLAG_ALIVE) !== 0)
        .map((track) => {
          const point = replayPointAt(track, frameIndex);
          if (!finitePoint(point)) return null;
          return {
            playerIndex: track.playerIndex,
            track,
            point,
            callout: replayCalloutAt(context, track, frameIndex, grid),
            navAreaId: navAreaAt(point),
          };
        }).filter((player): player is SpatialPlayerSample => player != null);
      if (players.length > 0) frames.push({ tick, teamKey, side, players, components: components(players, nav) });
    }
  }
  return frames;
}

export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function rounded(value: number | null, digits = 3): number | null {
  return value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits;
}
