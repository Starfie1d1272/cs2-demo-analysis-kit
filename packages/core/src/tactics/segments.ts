import { classifyTacticalLocation } from "@cs2dak/maps";
import type { PlayerTacticalSegment, TacticalFrameSample } from "./types.js";

export interface BuildSegmentsOptions {
  mapName: string;
  tickrate: number;
  maxGapTicks?: number;
}

export function buildPlayerTacticalSegments(
  samples: readonly TacticalFrameSample[],
  options: BuildSegmentsOptions,
): PlayerTacticalSegment[] {
  const byPlayer = new Map<number, TacticalFrameSample[]>();
  for (const sample of samples) {
    const rows = byPlayer.get(sample.playerIndex) ?? [];
    rows.push(sample);
    byPlayer.set(sample.playerIndex, rows);
  }

  const segments: PlayerTacticalSegment[] = [];
  for (const rows of byPlayer.values()) {
    rows.sort((a, b) => a.tick - b.tick);
    let active: TacticalFrameSample | null = null;
    let endTick = 0;
    const close = (): void => {
      if (!active?.callout) return;
      const location = classifyTacticalLocation(options.mapName, active.side, active.callout);
      segments.push({
        playerIndex: active.playerIndex,
        side: active.side,
        startTick: active.tick,
        endTick,
        durationSec: Math.max(0, (endTick - active.tick) / options.tickrate),
        callout: active.callout,
        tendencies: location.tendencies,
        primaryRegion: location.primaryRegion,
        defaultAnchorId: location.defaultAnchorId,
        evidence: {
          type: "dwell",
          tick: active.tick,
          endTick,
          playerIndices: [active.playerIndex],
          callouts: [active.callout],
        },
      });
      active = null;
    };

    for (const sample of rows) {
      if (!sample.alive || !sample.callout) {
        close();
        continue;
      }
      const gapExceeded = active != null
        && options.maxGapTicks != null
        && sample.tick - endTick > options.maxGapTicks;
      const changed = active != null
        && (active.callout !== sample.callout || active.side !== sample.side);
      if (gapExceeded || changed) close();
      if (!active) active = sample;
      endTick = sample.tick;
    }
    close();
  }

  return segments.sort((a, b) => a.startTick - b.startTick || a.playerIndex - b.playerIndex);
}

