export type RadarFieldBaseView =
  | "ctVis" | "tVis"
  | "ctAim" | "tAim"
  | "ctPres" | "tPres"
  | "ctSound" | "tSound";

/** Counts and geometry needed to compose a radar frame; calculation metadata stays with the producer. */
export interface RadarFieldView {
  scope: {
    kind: "league" | "team";
    team: string | null;
    roundCount: number;
  };
  grid: {
    cellSize: number;
    cells: ReadonlyArray<readonly [number, number, number]>;
  };
  maxSec: number;
  denomCt: ArrayLike<number>;
  denomT: ArrayLike<number>;
  fields: Record<RadarFieldBaseView, ReadonlyArray<ArrayLike<number>>>;
}
