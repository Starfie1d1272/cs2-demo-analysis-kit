import { describe, expect, it } from "vitest";
import { deriveCompactNav, findNavPath, nearestNavArea, type AwpyNav } from "./nav.js";

const source: AwpyNav = {
  version: 35,
  sub_version: 1,
  is_analyzed: true,
  areas: {
    1: {
      area_id: 1,
      hull_index: 0,
      dynamic_attribute_flags: 0,
      corners: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 10, y: 10, z: 0 },
        { x: 0, y: 10, z: 0 },
      ],
      connections: [2],
      ladders_above: [],
      ladders_below: [],
    },
    2: {
      area_id: 2,
      hull_index: 0,
      dynamic_attribute_flags: 0,
      corners: [
        { x: 10, y: 0, z: 0 },
        { x: 20, y: 0, z: 0 },
        { x: 20, y: 10, z: 0 },
        { x: 10, y: 10, z: 0 },
      ],
      connections: [3],
      ladders_above: [],
      ladders_below: [],
    },
    3: {
      area_id: 3,
      hull_index: 0,
      dynamic_attribute_flags: 0,
      corners: [
        { x: 20, y: 0, z: 0 },
        { x: 30, y: 0, z: 0 },
        { x: 30, y: 10, z: 0 },
        { x: 20, y: 10, z: 0 },
      ],
      connections: [],
      ladders_above: [],
      ladders_below: [],
    },
  },
};

describe("nav graph", () => {
  it("derives compact areas and follows directed adjacency", () => {
    const nav = deriveCompactNav("de_test", 123, source);
    expect(nav.areas).toHaveLength(3);
    expect(findNavPath(nav, 1, 3)).toEqual([1, 2, 3]);
    expect(findNavPath(nav, 3, 1)).toEqual([]);
  });

  it("maps a world point to its containing or nearest nav area", () => {
    const nav = deriveCompactNav("de_test", 123, source);
    expect(nearestNavArea(nav, { x: 4, y: 4, z: 2 })?.id).toBe(1);
    expect(nearestNavArea(nav, { x: 18, y: 5, z: 2 })?.id).toBe(2);
    expect(nearestNavArea(nav, { x: 34, y: 5, z: 2 })?.id).toBe(3);
  });
});
