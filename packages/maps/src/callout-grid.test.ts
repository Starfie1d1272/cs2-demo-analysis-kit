import { describe, expect, it } from "vitest";
import { calloutAt, calloutNear, type CalloutGrid } from "./callout-grid.js";

function grid(cells: CalloutGrid["cells"], vocabulary = ["A", "B", "Mid"]): CalloutGrid {
  return {
    mapName: "de_test",
    gridSize: 10,
    origin: [-100, -100, -100],
    maxCoord: [100, 100, 100],
    dims: [20, 20, 20],
    vocabulary,
    confidence: 0.51,
    minSamples: 3,
    cells,
  };
}

describe("callout-grid", () => {
  it("floors negative world coordinates to the same grid convention as generation", () => {
    const g = grid({ "-10,20,0": [0, 0.9, 12] });
    expect(calloutAt(g, { x: -1, y: 29.9, z: 0 })?.callout).toBe("A");
  });

  it("returns null for empty cells", () => {
    expect(calloutAt(grid({}), { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it("guards vocabulary index overflow", () => {
    expect(calloutAt(grid({ "0,0,0": [9, 0.9, 12] }), { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it("returns exact hits before nearby candidates", () => {
    const g = grid({
      "0,0,0": [0, 0.6, 5],
      "10,0,0": [1, 0.99, 50],
    });
    expect(calloutNear(g, { x: 1, y: 1, z: 1 })).toMatchObject({
      callout: "A",
      source: "exact",
      distance: 0,
      offset: [0, 0, 0],
    });
  });

  it("finds nearby cells for sparse effect positions", () => {
    const g = grid({
      "10,0,0": [1, 0.7, 20],
      "0,20,0": [2, 0.95, 100],
    });
    expect(calloutNear(g, { x: 1, y: 1, z: 1 }, { horizontalRadius: 25, verticalRadius: 10 })).toMatchObject({
      callout: "B",
      source: "nearby",
      offset: [10, 0, 0],
    });
  });

  it("prefers same z or lower z before upper z for equal-distance candidates", () => {
    const g = grid({
      "0,0,-10": [0, 0.7, 10],
      "0,0,10": [1, 0.99, 100],
    });
    expect(calloutNear(g, { x: 0, y: 0, z: 0 }, { horizontalRadius: 0, verticalRadius: 10 })?.callout).toBe("A");
  });

  it("does not bridge Nuke-style stacked floors outside vertical radius", () => {
    const g = grid({
      "0,0,0": [0, 0.8, 20],
      "0,0,120": [1, 0.9, 30],
    });
    expect(calloutNear(g, { x: 0, y: 0, z: 90 }, { horizontalRadius: 0, verticalRadius: 20 })).toBeNull();
    expect(calloutNear(g, { x: 0, y: 0, z: 90 }, { horizontalRadius: 0, verticalRadius: 40 })?.callout).toBe("B");
  });
});
