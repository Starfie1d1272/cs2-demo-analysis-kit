import ancientZones from "../map-zones/de_ancient.json" with { type: "json" };
import dust2Zones from "../map-zones/de_dust2.json" with { type: "json" };
import infernoZones from "../map-zones/de_inferno.json" with { type: "json" };
import mirageZones from "../map-zones/de_mirage.json" with { type: "json" };
// legacy zone 资产：不是当前控图/战术语义真相源；控图优先用 callout grid。
// 其余 3 图不再主动补 zone，除非旧 shadow spatial 路径明确需要。
// import anubisZones from "../map-zones/de_anubis.json" with { type: "json" };
// import nukeZones from "../map-zones/de_nuke.json" with { type: "json" };
// import overpassZones from "../map-zones/de_overpass.json" with { type: "json" };
import type { MapZones } from "./zones.js";
import type { ActiveDutyMap } from "./zones.js";

/** legacy 手标 zone 多边形。未标定的图 getMapZones 返回 null。 */
export const MAP_ZONE_ASSETS: Partial<Record<ActiveDutyMap, MapZones>> = {
  de_ancient: ancientZones as unknown as MapZones,
  de_dust2: dust2Zones as unknown as MapZones,
  de_inferno: infernoZones as unknown as MapZones,
  de_mirage: mirageZones as unknown as MapZones,
};

export function getMapZones(mapName: string): MapZones | null {
  return (MAP_ZONE_ASSETS as Record<string, MapZones | undefined>)[mapName] ?? null;
}
