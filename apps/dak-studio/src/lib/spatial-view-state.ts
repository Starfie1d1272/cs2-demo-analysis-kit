import type { RadarFieldMode } from "@cs2dak/presentation/radar-field";

export interface OpeningPageState {
  mapName: string | null;
  side: "t" | "ct";
  recentMatchCount: 3 | 5 | 10 | 0;
  hiddenRoundKeys: string[];
  timeSeconds: number;
  speed: number;
  trailOpacity: number;
  showTrails: boolean;
  showGrenades: boolean;
}

export const emptyOpeningPageState = (): OpeningPageState => ({
  mapName: null, side: "t", recentMatchCount: 5, hiddenRoundKeys: [], timeSeconds: 30,
  speed: 2, trailOpacity: 0.5, showTrails: true, showGrenades: true,
});

export interface ControlPageState {
  mapName: string | null;
  economy: "gun" | "all";
  mode: RadarFieldMode;
  second: number;
  level: "upper" | "lower";
}

export const emptyControlPageState = (): ControlPageState => ({
  mapName: null, economy: "gun", mode: "ctVis", second: 20, level: "upper",
});
