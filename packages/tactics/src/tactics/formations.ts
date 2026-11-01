import { calloutCn, classifyTacticalLocation, positionGroupOf, type DefaultPositionSide } from "@cs2dak/maps";
import type {
  OpeningPattern,
  OpeningPressureEvent,
  PlayerTacticalSegment,
  TacticalFormationSnapshot,
  TacticalFrameSample,
  TacticalRegionCounts,
} from "./types.js";

function emptyRegionCounts(): TacticalRegionCounts {
  return { a: 0, b: 0, mid: 0, unknown: 0 };
}

export function deriveOpeningPressure(
  segments: readonly PlayerTacticalSegment[],
  options: {
    mapName: string;
    side: DefaultPositionSide;
    startTick: number;
    endTick: number;
    minDwellSec?: number;
  },
): OpeningPressureEvent[] {
  const opposingSide: DefaultPositionSide = options.side === "t" ? "ct" : "t";
  const minDwellSec = options.minDwellSec ?? 1;
  return segments
    .filter((segment) =>
      segment.side === options.side
      && segment.startTick <= options.endTick
      && segment.endTick >= options.startTick
      && segment.durationSec >= minDwellSec
      && segment.positionGroupId == null,
    )
    .map((segment): OpeningPressureEvent | null => {
      const opposingPositionGroupId = positionGroupOf(options.mapName, opposingSide, segment.callout);
      if (!opposingPositionGroupId && !segment.primaryRegion) return null;
      return {
        playerIndex: segment.playerIndex,
        side: segment.side,
        tick: segment.startTick,
        endTick: segment.endTick,
        callout: segment.callout,
        calloutLabel: calloutCn(options.mapName, segment.callout) || segment.callout,
        primaryRegion: segment.primaryRegion,
        kind: opposingPositionGroupId ? "deep" : "forward",
        opposingPositionGroupId,
        evidence: segment.evidence,
      };
    })
    .filter((event): event is OpeningPressureEvent => event != null)
    .sort((a, b) => a.tick - b.tick || a.playerIndex - b.playerIndex);
}

export function buildFormationTimeline(
  samples: readonly TacticalFrameSample[],
  options: { mapName: string },
): TacticalFormationSnapshot[] {
  const groups = new Map<string, TacticalFrameSample[]>();
  for (const sample of samples) {
    if (!sample.alive) continue;
    const key = `${sample.tick}:${sample.side}`;
    const rows = groups.get(key) ?? [];
    rows.push(sample);
    groups.set(key, rows);
  }
  return [...groups.values()]
    .map((rows) => {
      const first = rows[0]!;
      const regionCounts = emptyRegionCounts();
      const positionGroupCounts: Record<string, number> = {};
      const playerLocations = rows.map((sample) => {
        const location = classifyTacticalLocation(options.mapName, sample.side, sample.callout);
        if (location.primaryRegion) regionCounts[location.primaryRegion] += 1;
        else regionCounts.unknown += 1;
        if (location.positionGroupId) {
          positionGroupCounts[location.positionGroupId] = (positionGroupCounts[location.positionGroupId] ?? 0) + 1;
        }
        return {
          playerIndex: sample.playerIndex,
          callout: sample.callout,
          primaryRegion: location.primaryRegion,
          positionGroupId: location.positionGroupId,
        };
      });
      return { tick: first.tick, side: first.side, regionCounts, positionGroupCounts, playerLocations };
    })
    .sort((a, b) => a.tick - b.tick || a.side.localeCompare(b.side));
}

function overlapTicks(segment: PlayerTacticalSegment, startTick: number, endTick: number): number {
  return Math.max(0, Math.min(segment.endTick, endTick) - Math.max(segment.startTick, startTick));
}

function spreadOf(counts: TacticalRegionCounts): OpeningPattern["spread"] {
  const occupied = [counts.a, counts.mid, counts.b].filter((count) => count > 0).length;
  if (occupied === 0) return "unknown";
  if (occupied === 1) return "stacked";
  if (occupied === 2) return "split";
  return "balanced";
}

export function deriveOpeningPattern(
  segments: readonly PlayerTacticalSegment[],
  options: { side: DefaultPositionSide; startTick: number; endTick: number; minDefaultDwellSec?: number },
): OpeningPattern {
  const byPlayer = new Map<number, PlayerTacticalSegment[]>();
  for (const segment of segments) {
    if (segment.side !== options.side || segment.endTick < options.startTick || segment.startTick > options.endTick) continue;
    const rows = byPlayer.get(segment.playerIndex) ?? [];
    rows.push(segment);
    byPlayer.set(segment.playerIndex, rows);
  }

  const minDefaultDwellSec = options.minDefaultDwellSec ?? 1;
  const selected = [...byPlayer.values()].map((rows) => rows.sort((a, b) => {
    const aDefault = a.positionGroupId != null && a.durationSec >= minDefaultDwellSec ? 1 : 0;
    const bDefault = b.positionGroupId != null && b.durationSec >= minDefaultDwellSec ? 1 : 0;
    const aKnown = a.primaryRegion != null ? 1 : 0;
    const bKnown = b.primaryRegion != null ? 1 : 0;
    return bDefault - aDefault
      || bKnown - aKnown
      || overlapTicks(b, options.startTick, options.endTick) - overlapTicks(a, options.startTick, options.endTick)
      || a.startTick - b.startTick;
  })[0]!);
  const regionCounts = emptyRegionCounts();
  const positionGroupCounts: Record<string, number> = {};
  for (const segment of selected) {
    if (segment.primaryRegion) regionCounts[segment.primaryRegion] += 1;
    else regionCounts.unknown += 1;
    if (segment.positionGroupId) {
      positionGroupCounts[segment.positionGroupId] = (positionGroupCounts[segment.positionGroupId] ?? 0) + 1;
    }
  }
  const spread = spreadOf(regionCounts);
  const sideLabel = options.side.toUpperCase();
  const coarseSignature = `${sideLabel}:${regionCounts.a}A-${regionCounts.mid}MID-${regionCounts.b}B:${spread}`;
  const groups = Object.entries(positionGroupCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => `${id}:${count}`)
    .join("|");
  return {
    side: options.side,
    regionCounts,
    positionGroupCounts,
    spread,
    coarseSignature,
    detailedSignature: `${sideLabel}:${groups || "-"}`,
    evidence: selected.map((segment) => segment.evidence),
  };
}
