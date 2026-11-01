import type { DefaultPositionSide, TacticalRegion } from "@cs2dak/maps";

export interface TacticalFrameSample {
  tick: number;
  playerIndex: number;
  side: DefaultPositionSide;
  alive: boolean;
  callout: string | null;
}

export interface TacticalEvidenceRef {
  type: "position" | "dwell" | "transition";
  tick: number;
  endTick?: number;
  playerIndices?: number[];
  callouts?: string[];
}

export interface PlayerTacticalSegment {
  playerIndex: number;
  side: DefaultPositionSide;
  startTick: number;
  endTick: number;
  durationSec: number;
  callout: string;
  tendencies: readonly TacticalRegion[];
  primaryRegion: TacticalRegion | null;
  positionGroupId: string | null;
  evidence: TacticalEvidenceRef;
}

export interface TacticalRegionCounts {
  a: number;
  b: number;
  mid: number;
  unknown: number;
}

export interface TacticalFormationSnapshot {
  tick: number;
  side: DefaultPositionSide;
  regionCounts: TacticalRegionCounts;
  positionGroupCounts: Record<string, number>;
  playerLocations: Array<{
    playerIndex: number;
    callout: string | null;
    primaryRegion: TacticalRegion | null;
    positionGroupId: string | null;
  }>;
}

export interface OpeningPattern {
  side: DefaultPositionSide;
  regionCounts: TacticalRegionCounts;
  positionGroupCounts: Record<string, number>;
  spread: "stacked" | "split" | "balanced" | "unknown";
  coarseSignature: string;
  detailedSignature: string;
  evidence: TacticalEvidenceRef[];
}

export interface OpeningPressureEvent {
  playerIndex: number;
  side: DefaultPositionSide;
  tick: number;
  endTick: number;
  callout: string;
  calloutLabel: string;
  primaryRegion: TacticalRegion | null;
  kind: "forward" | "deep";
  opposingPositionGroupId: string | null;
  evidence: TacticalEvidenceRef;
}
