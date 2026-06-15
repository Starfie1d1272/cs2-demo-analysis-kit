import { describe, expect, it } from "vitest";
import { clearCalloutGridBrowserCache, loadCalloutGridBrowser } from "./callout-grid-browser.js";
import type { CalloutGrid } from "./callout-grid.js";

const sampleGrid: CalloutGrid = {
  mapName: "de_test",
  gridSize: 10,
  origin: [0, 0, 0],
  maxCoord: [10, 10, 10],
  dims: [1, 1, 1],
  vocabulary: ["A"],
  confidence: 0.51,
  minSamples: 3,
  cells: { "0,0,0": [0, 1, 3] },
};

describe("callout-grid browser loader", () => {
  it("loads a map from explicit URL and caches the promise", async () => {
    clearCalloutGridBrowserCache();
    const calls: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(JSON.stringify(sampleGrid), { status: 200 });
    };

    await expect(loadCalloutGridBrowser("de_test", { urls: { de_test: "/assets/de_test.json" }, fetchImpl })).resolves.toEqual(sampleGrid);
    await expect(loadCalloutGridBrowser("de_test", { urls: { de_test: "/assets/de_test.json" }, fetchImpl })).resolves.toEqual(sampleGrid);
    expect(calls).toEqual(["/assets/de_test.json"]);
  });

  it("returns null for missing assets", async () => {
    clearCalloutGridBrowserCache();
    const fetchImpl = async () => new Response("", { status: 404 });
    await expect(loadCalloutGridBrowser("de_missing", { baseUrl: "/callout-grid", fetchImpl })).resolves.toBeNull();
  });
});
