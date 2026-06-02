import { describe, it, expect } from "vitest";
import { pointInPolygon, zoneAt, type MapZones } from "./zones.js";

// 合成地图：两个不相邻方块 + 一个上层方块（测 z 过滤）
const zones: MapZones = {
  mapName: "de_test",
  version: "test-0",
  zones: [
    { id: "a_site", name: "A", role: "site", bombsite: "a", polygon: [[0, 0], [100, 0], [100, 100], [0, 100]] },
    { id: "b_site", name: "B", role: "site", bombsite: "b", polygon: [[200, 0], [300, 0], [300, 100], [200, 100]] },
    { id: "upper", name: "Upper", role: "other", polygon: [[0, 0], [100, 0], [100, 100], [0, 100]], zMin: 500, zMax: 700 },
  ],
};

describe("pointInPolygon", () => {
  it("detects inside / outside", () => {
    const square: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(-1, 5, square)).toBe(false);
  });

  it("auto-closes the polygon (last→first edge)", () => {
    const tri: Array<[number, number]> = [[0, 0], [10, 0], [5, 10]];
    expect(pointInPolygon(5, 3, tri)).toBe(true);
    expect(pointInPolygon(0, 9, tri)).toBe(false);
  });
});

describe("zoneAt", () => {
  it("resolves a point to its zone", () => {
    expect(zoneAt(zones, 50, 50)?.id).toBe("a_site");
    expect(zoneAt(zones, 250, 50)?.id).toBe("b_site");
  });

  it("returns null when no zone contains the point", () => {
    expect(zoneAt(zones, 150, 50)).toBeNull();
  });

  it("respects z-range on multi-level overlap (a_site has no z, returned first)", () => {
    // 同一 XY，z=600 仍落 a_site，因为 a_site 无 z 约束且排在前（优先级）
    expect(zoneAt(zones, 50, 50, 600)?.id).toBe("a_site");
  });

  it("uses z to pick an upper-only zone when lower zone is z-bounded", () => {
    const upperOnly: MapZones = { ...zones, zones: [zones.zones[2], zones.zones[0]] };
    // a_site 无 z 约束，永远命中；把 upper 放前面且在其 z 段内才命中 upper
    expect(zoneAt(upperOnly, 50, 50, 600)?.id).toBe("upper");
    expect(zoneAt(upperOnly, 50, 50, 100)?.id).toBe("a_site"); // 不在 upper z 段 → 落 a_site
  });
});
