import { describe, expect, it } from "vitest";
import { ACTIVE_DUTY_MAPS, SPATIAL_ASSET_MAPS } from "./map-pool.js";
import { MAP_NAV_ASSETS, getMapNav } from "./geometry-assets.js";
import { MAP_ROUTE_ASSETS, getMapRoutes } from "./route-assets.js";

describe("map pool and spatial coverage", () => {
  it("distinguishes Premier Season Five from checked-in nav/route coverage", () => {
    expect(ACTIVE_DUTY_MAPS).toEqual(["de_ancient", "de_anubis", "de_cache", "de_dust2", "de_inferno", "de_mirage", "de_nuke"]);
    expect(SPATIAL_ASSET_MAPS).toEqual(["de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_overpass"]);
    expect(Object.keys(MAP_NAV_ASSETS).sort()).toEqual([...SPATIAL_ASSET_MAPS]);
    expect(Object.keys(MAP_ROUTE_ASSETS).sort()).toEqual([...SPATIAL_ASSET_MAPS]);
    expect(getMapNav("de_cache")).toBeNull(); expect(getMapRoutes("de_cache")).toBeNull();
    expect(getMapNav("de_overpass")).not.toBeNull(); expect(getMapRoutes("de_overpass")).not.toBeNull();
  });
});
