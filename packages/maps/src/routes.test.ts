import { describe, it, expect } from "vitest";
import { routeIndex, furthestRouteIndex, type MapRoute } from "./routes.js";

const aPalace: MapRoute = {
  id: "a_palace",
  name: "A 大厅",
  type: "primary_entry",
  bombsite: "a",
  confidence: "high",
  zones: [
    { id: "TSpawn", nameCn: "T 出生点" },
    { id: "PalaceAlley", nameCn: "Palace 巷口" },
    { id: "TRamp", nameCn: "T 坡道" },
    { id: "PalaceInterior", nameCn: "Palace 内部" },
    { id: "BombsiteA", nameCn: "A 包点" },
  ],
};

describe("routeIndex", () => {
  it("returns advance index along the route", () => {
    expect(routeIndex(aPalace, "TSpawn")).toBe(0);
    expect(routeIndex(aPalace, "PalaceInterior")).toBe(3);
    expect(routeIndex(aPalace, "BombsiteA")).toBe(4);
  });

  it("returns -1 for callouts off the route or nullish", () => {
    expect(routeIndex(aPalace, "Apartments")).toBe(-1);
    expect(routeIndex(aPalace, null)).toBe(-1);
    expect(routeIndex(aPalace, undefined)).toBe(-1);
  });
});

describe("furthestRouteIndex", () => {
  it("takes the furthest controlled callout along the route", () => {
    expect(furthestRouteIndex(aPalace, ["TSpawn", "TRamp", "PalaceAlley"])).toBe(2);
  });

  it("ignores callouts not on the route", () => {
    expect(furthestRouteIndex(aPalace, ["Apartments", "Underpass"])).toBe(-1);
    expect(furthestRouteIndex(aPalace, ["Apartments", "PalaceInterior"])).toBe(3);
  });

  it("returns -1 for an empty set", () => {
    expect(furthestRouteIndex(aPalace, [])).toBe(-1);
  });
});
