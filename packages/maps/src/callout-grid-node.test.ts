import { describe, expect, it } from "vitest";
import { clearCalloutGridCache, loadCalloutGrid } from "./callout-grid-node.js";
import { calloutAt } from "./callout-grid.js";

describe("callout-grid node loader", () => {
  it("loads committed callout-grid cells that can be queried through calloutAt", () => {
    clearCalloutGridCache();
    const grid = loadCalloutGrid("de_mirage");
    expect(grid?.mapName).toBe("de_mirage");
    expect(Object.keys(grid?.cells ?? {}).length).toBeGreaterThan(1000);
    const firstKey = Object.keys(grid?.cells ?? {})[0];
    expect(firstKey).toBeTruthy();
    const [x, y, z] = firstKey!.split(",").map(Number);
    expect(calloutAt(grid!, { x: x!, y: y!, z: z! })?.callout).toBeTruthy();
  });
});
