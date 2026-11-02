import type { RadarFieldMode } from "@cs2dak/presentation/radar-field";

export const OPENING_WINDOW_SECONDS = 30;
export const OPENING_SPEEDS = [1, 2, 4] as const;
export const OPENING_OPACITY_MIN = 0.1;
export const OPENING_OPACITY_MAX = 1;

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
