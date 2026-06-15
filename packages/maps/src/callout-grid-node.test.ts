import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clearCalloutGridCache, loadCalloutGrid } from "./callout-grid-node.js";
import { calloutAt } from "./callout-grid.js";

describe("callout-grid node loader", () => {
  it("loads committed callout-grid JSON for package consumers", () => {
    clearCalloutGridCache();
    const grid = loadCalloutGrid("de_mirage");
    expect(grid?.mapName).toBe("de_mirage");
    expect(Object.keys(grid?.cells ?? {}).length).toBeGreaterThan(1000);
  });

  it("package files include callout-grid assets", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "packages/maps/package.json"), "utf-8")) as { files?: string[] };
    expect(pkg.files).toContain("callout-grid");
  });

  it("real grid cells can be queried through calloutAt", () => {
    const grid = loadCalloutGrid("de_mirage");
    const firstKey = Object.keys(grid?.cells ?? {})[0];
    expect(firstKey).toBeTruthy();
    const [x, y, z] = firstKey!.split(",").map(Number);
    expect(calloutAt(grid!, { x: x!, y: y!, z: z! })?.callout).toBeTruthy();
  });
});
