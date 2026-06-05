import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CALLOUT_NAME_CN } from "./callout-names.js";
import { getMapRoutes } from "./route-assets.js";
import { ACTIVE_DUTY_MAPS } from "./zones.js";
import type { MapRoute, MapRoutes } from "./routes.js";

const ROUTE_TYPES = new Set([
  "primary_entry",
  "secondary_entry",
  "mid_connector",
  "lurk_lane",
  "rotation_cut",
]);
const ROUTE_CONFIDENCE = new Set(["high", "medium", "low"]);

function loadRoutes(mapName: string): MapRoutes {
  const path = fileURLToPath(new URL(`../map-routes/${mapName}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as MapRoutes;
}

function expectedBombsite(route: MapRoute): string {
  return route.bombsite === "a" ? "BombsiteA" : "BombsiteB";
}

describe("map route assets", () => {
  it("provides at least one confirmed route for every active duty map", () => {
    for (const mapName of ACTIVE_DUTY_MAPS) {
      expect(loadRoutes(mapName).routes, mapName).not.toHaveLength(0);
    }
  });

  it("exposes confirmed Dust2 routes through the public route asset helper", () => {
    const dust2 = getMapRoutes("de_dust2");
    expect(dust2?.mapName).toBe("de_dust2");
    expect(dust2?.routes.map((route) => route.id)).toEqual([
      "a_long",
      "a_short",
      "b_tunnels",
      "b_mid_lower",
    ]);
    expect(getMapRoutes("de_cache")).toBeNull();
  });

  it("keeps route metadata and callout references internally consistent", () => {
    for (const mapName of ACTIVE_DUTY_MAPS) {
      const asset = loadRoutes(mapName);
      const callouts = CALLOUT_NAME_CN[mapName];
      const ids = asset.routes.map((route) => route.id);

      expect(asset.mapName).toBe(mapName);
      expect(new Set(ids).size, `${mapName} route ids`).toBe(ids.length);

      for (const route of asset.routes) {
        const zoneIds = route.zones.map((zone) => zone.id);

        expect(ROUTE_TYPES.has(route.type), `${mapName}/${route.id} type`).toBe(true);
        expect(ROUTE_CONFIDENCE.has(route.confidence), `${mapName}/${route.id} confidence`).toBe(true);
        expect(zoneIds[0], `${mapName}/${route.id} start`).toBe("TSpawn");
        expect(zoneIds.at(-1), `${mapName}/${route.id} end`).toBe(expectedBombsite(route));
        expect(new Set(zoneIds).size, `${mapName}/${route.id} repeated zones`).toBe(zoneIds.length);

        for (const zone of route.zones) {
          expect(zone.id in callouts, `${mapName}/${route.id}/${zone.id}`).toBe(true);
          expect(zone.nameCn, `${mapName}/${route.id}/${zone.id} name`).toBe(
            callouts[zone.id as keyof typeof callouts],
          );
        }
      }
    }
  });
});
