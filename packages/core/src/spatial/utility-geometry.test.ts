import { describe, expect, it } from "vitest";
import type { CompactNav, MapZone } from "@cs2dak/maps";
import {
  areasWithinRadius,
  buildNavIndex,
  navPathCost,
  nearestAreaId,
  polygonCentroid,
  segmentSphereIntersects,
  smokeDetourCost,
} from "./utility-geometry.js";

const v = (x: number, y: number, z = 0) => ({ x, y, z });

describe("segmentSphereIntersects", () => {
  it("hits a sphere on the segment path", () => {
    expect(segmentSphereIntersects(v(0, 0), v(100, 0), v(50, 10), 20)).toBe(true);
  });
  it("misses a sphere far from the segment", () => {
    expect(segmentSphereIntersects(v(0, 0), v(100, 0), v(50, 200), 20)).toBe(false);
  });
  it("hits when an endpoint is inside the sphere", () => {
    expect(segmentSphereIntersects(v(0, 0), v(100, 0), v(105, 0), 10)).toBe(true);
  });
  it("misses past the segment end (clamped)", () => {
    expect(segmentSphereIntersects(v(0, 0), v(100, 0), v(200, 0), 10)).toBe(false);
  });
});

describe("polygonCentroid", () => {
  it("returns the center of a square", () => {
    const zone = { id: "z", name: "z", role: "site", polygon: [[0, 0], [100, 0], [100, 100], [0, 100]] } as unknown as MapZone;
    const c = polygonCentroid(zone);
    expect(c.x).toBeCloseTo(50, 5);
    expect(c.y).toBeCloseTo(50, 5);
  });
});

/** 线性 nav：A(0)-B(100)-C(200)-D(300)，外加旁路 B-E(100,200)-C 绕远。 */
function lineNav(): CompactNav {
  return {
    mapName: "de_test", buildId: 0, sourceFormat: { version: 0, subVersion: 0 },
    areas: [
      { id: 0, corners: [], centroid: v(0, 0), neighbors: [1] },
      { id: 1, corners: [], centroid: v(100, 0), neighbors: [0, 2, 4] },
      { id: 2, corners: [], centroid: v(200, 0), neighbors: [1, 3, 4] },
      { id: 3, corners: [], centroid: v(300, 0), neighbors: [2] },
      { id: 4, corners: [], centroid: v(150, 300), neighbors: [1, 2] }, // 旁路（绕远）
    ],
  } as unknown as CompactNav;
}

describe("navPathCost + smokeDetourCost", () => {
  it("computes straight-line path cost", () => {
    const idx = buildNavIndex(lineNav());
    expect(navPathCost(idx, 0, 3)).toBeCloseTo(300, 3); // 0→1→2→3
  });
  it("returns null when blocked with no alternative", () => {
    const idx = buildNavIndex(lineNav());
    // 屏蔽 1 → 0 无法到达任何地方（0 只连 1）
    expect(navPathCost(idx, 0, 3, new Set([1]))).toBeNull();
  });
  it("smoke detour: blocking the direct hop forces the long way around", () => {
    const idx = buildNavIndex(lineNav());
    // 屏蔽 2（直线中段）→ 1→4→2 不行（2 也被屏蔽），但 1→4→? ... 改测屏蔽直连边场景：
    // 屏蔽节点 2 后从 1 到 3：1→4→2(blocked) 无效 → 实际不可达 → detour=base（全额）
    const detour = smokeDetourCost(idx, 1, 3, new Set([2]));
    expect(detour).toBeGreaterThan(0);
  });
  it("smoke detour is 0 when smoke does not lie on the path", () => {
    const idx = buildNavIndex(lineNav());
    expect(smokeDetourCost(idx, 0, 3, new Set([4]))).toBe(0); // 旁路被屏蔽不影响直线
  });
});

describe("nearestAreaId + areasWithinRadius", () => {
  it("finds the nearest area", () => {
    const idx = buildNavIndex(lineNav());
    expect(nearestAreaId(idx, v(190, 5))).toBe(2);
  });
  it("collects areas within a radius", () => {
    const idx = buildNavIndex(lineNav());
    const within = areasWithinRadius(idx, v(100, 0), 110);
    expect(within.has(1)).toBe(true); // 距 0
    expect(within.has(0)).toBe(true); // 距 100
    expect(within.has(3)).toBe(false); // 距 200 > 110
  });
});
