import ancientNav from "../map-nav/de_ancient.nav.json" with { type: "json" };
import anubisNav from "../map-nav/de_anubis.nav.json" with { type: "json" };
import dust2Nav from "../map-nav/de_dust2.nav.json" with { type: "json" };
import infernoNav from "../map-nav/de_inferno.nav.json" with { type: "json" };
import mirageNav from "../map-nav/de_mirage.nav.json" with { type: "json" };
import nukeNav from "../map-nav/de_nuke.nav.json" with { type: "json" };
import overpassNav from "../map-nav/de_overpass.nav.json" with { type: "json" };
import type { CompactNav } from "./nav.js";
import type { TriangleBvh } from "./visibility.js";
import type { ActiveDutyMap } from "./zones.js";

export interface MapGeometry {
  mapName: string;
  nav: CompactNav;
  visibility?: TriangleBvh;
  sources: {
    nav: "awpy-nav-json";
    visibility: "awpy-tri-bvh" | "missing";
  };
}

export const MAP_NAV_ASSETS: Record<ActiveDutyMap, CompactNav> = {
  de_ancient: ancientNav as CompactNav,
  de_anubis: anubisNav as CompactNav,
  de_dust2: dust2Nav as CompactNav,
  de_inferno: infernoNav as CompactNav,
  de_mirage: mirageNav as CompactNav,
  de_nuke: nukeNav as CompactNav,
  de_overpass: overpassNav as CompactNav,
};

export function getMapNav(mapName: string): CompactNav | null {
  if (mapName in MAP_NAV_ASSETS) {
    return MAP_NAV_ASSETS[mapName as ActiveDutyMap];
  }
  return null;
}

/**
 * 获取指定地图的完整几何资产（nav + visibility）。
 * visibility 在 .tri 文件可用时自动加载 BVH（Node.js 环境），
 * 浏览器环境通过 tri-assets 的 dynamic import 降级为 "missing"。
 */
export function getMapGeometry(mapName: string, triBvh?: TriangleBvh | null): MapGeometry | null {
  const nav = getMapNav(mapName);
  if (!nav) return null;
  const visibility = triBvh ?? undefined;
  return {
    mapName,
    nav,
    visibility,
    sources: {
      nav: "awpy-nav-json",
      visibility: visibility ? "awpy-tri-bvh" : "missing",
    },
  };
}
