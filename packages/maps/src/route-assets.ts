import ancientRoutes from "../map-routes/de_ancient.json" with { type: "json" };
import anubisRoutes from "../map-routes/de_anubis.json" with { type: "json" };
import dust2Routes from "../map-routes/de_dust2.json" with { type: "json" };
import infernoRoutes from "../map-routes/de_inferno.json" with { type: "json" };
import mirageRoutes from "../map-routes/de_mirage.json" with { type: "json" };
import nukeRoutes from "../map-routes/de_nuke.json" with { type: "json" };
import overpassRoutes from "../map-routes/de_overpass.json" with { type: "json" };
import type { MapRoutes } from "./routes.js";
import type { ActiveDutyMap } from "./zones.js";

export const MAP_ROUTE_ASSETS: Record<ActiveDutyMap, MapRoutes> = {
  de_ancient: ancientRoutes as MapRoutes,
  de_anubis: anubisRoutes as MapRoutes,
  de_dust2: dust2Routes as MapRoutes,
  de_inferno: infernoRoutes as MapRoutes,
  de_mirage: mirageRoutes as MapRoutes,
  de_nuke: nukeRoutes as MapRoutes,
  de_overpass: overpassRoutes as MapRoutes,
};

export function getMapRoutes(mapName: string): MapRoutes | null {
  return (MAP_ROUTE_ASSETS as Record<string, MapRoutes | undefined>)[mapName] ?? null;
}
