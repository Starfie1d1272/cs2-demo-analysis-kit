import mirageZones from "../map-zones/de_mirage.json" with { type: "json" };
// 其余 6 图待标定完成后逐个启用
// import ancientZones from "../map-zones/de_ancient.json" with { type: "json" };
// import anubisZones from "../map-zones/de_anubis.json" with { type: "json" };
// import dust2Zones from "../map-zones/de_dust2.json" with { type: "json" };
// import infernoZones from "../map-zones/de_inferno.json" with { type: "json" };
// import nukeZones from "../map-zones/de_nuke.json" with { type: "json" };
// import overpassZones from "../map-zones/de_overpass.json" with { type: "json" };
import type { MapZones } from "./zones.js";
import type { ActiveDutyMap } from "./zones.js";

export const MAP_ZONE_ASSETS: Partial<Record<ActiveDutyMap, MapZones>> = {
  de_mirage: mirageZones as unknown as MapZones,
  // de_ancient: ancientZones as MapZones,
  // de_anubis: anubisZones as MapZones,
  // de_dust2: dust2Zones as MapZones,
  // de_inferno: infernoZones as MapZones,
  // de_nuke: nukeZones as MapZones,
  // de_overpass: overpassZones as MapZones,
};

export function getMapZones(mapName: string): MapZones | null {
  return (MAP_ZONE_ASSETS as Record<string, MapZones | undefined>)[mapName] ?? null;
}
