import { describe, expect, it } from "vitest";
import {
  buildTriangleBvh,
  parseAwpyTri,
  staticLineOfSight,
  type Triangle,
} from "./visibility.js";

const wall: Triangle = {
  a: { x: 0, y: -10, z: -10 },
  b: { x: 0, y: 10, z: -10 },
  c: { x: 0, y: 0, z: 10 },
};

describe("static line of sight", () => {
  it("reads awpy little-endian triangle streams", () => {
    const values = [-1, -2, -3, 1, 2, 3, 4, 5, 6];
    const buffer = new ArrayBuffer(values.length * 4);
    const view = new DataView(buffer);
    values.forEach((value, index) => view.setFloat32(index * 4, value, true));

    expect(parseAwpyTri(buffer)).toEqual([
      {
        a: { x: -1, y: -2, z: -3 },
        b: { x: 1, y: 2, z: 3 },
        c: { x: 4, y: 5, z: 6 },
      },
    ]);
  });

  it("reports whether static collision geometry blocks a segment", () => {
    const bvh = buildTriangleBvh([wall]);
    expect(staticLineOfSight(bvh, { x: -5, y: 0, z: 0 }, { x: 5, y: 0, z: 0 })).toBe(false);
    expect(staticLineOfSight(bvh, { x: -5, y: 20, z: 0 }, { x: 5, y: 20, z: 0 })).toBe(true);
  });
});
