import { describe, expect, it } from "vitest";
import { getMapGeometry, getMapNav } from "./geometry-assets.js";
import { ACTIVE_DUTY_MAPS } from "./zones.js";

describe("map geometry assets", () => {
  it("ships compact nav assets for every active duty map", () => {
    for (const mapName of ACTIVE_DUTY_MAPS) {
      const nav = getMapNav(mapName);
      expect(nav?.mapName).toBe(mapName);
      expect(nav?.areas.length, mapName).toBeGreaterThan(100);
      expect(nav?.areas.some((area) => area.neighbors.length > 0), mapName).toBe(true);
    }
  });

  it("exposes geometry with explicit visibility source status", () => {
    const geometry = getMapGeometry("de_dust2");
    expect(geometry?.nav.mapName).toBe("de_dust2");
    expect(geometry?.sources.nav).toBe("awpy-nav-json");
    expect(geometry?.sources.visibility).toBe("missing");
    expect(getMapGeometry("de_cache")).toBeNull();
  });
});
