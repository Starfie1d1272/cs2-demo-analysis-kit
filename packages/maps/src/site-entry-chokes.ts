export type SiteTarget = "a" | "b";
export type SiteEntryKind = "canonical" | "split" | "deep_wrap";

export interface SiteEntryFamilyDefinition {
  id: string;
  target: SiteTarget;
  /** 首次进入包点前可作为物理入口边界的 callout。 */
  entryCallouts: readonly string[];
  kind: SiteEntryKind;
}

export interface SiteRouteMarkerDefinition {
  id: string;
  target: SiteTarget;
  /** 比物理进包边界更早、用于区分宏观路线方向的节点。 */
  callouts: readonly string[];
  kind: SiteEntryKind;
}

export interface MapSiteSemantics {
  entries: readonly SiteEntryFamilyDefinition[];
  routeMarkers?: readonly SiteRouteMarkerDefinition[];
}

export interface ResolvedSiteEntry {
  target: SiteTarget;
  /** 真实进包边界；未命中人工入口表时保持 null。 */
  entryChokeId: string | null;
  entryCallout: string | null;
  /** 宏观路线方向；没有独立 marker 时与 entryChokeId 相同。 */
  routeFamilyId: string | null;
  routeMarkerCallout: string | null;
  kind: SiteEntryKind | null;
}

/**
 * 七图人工核实的包点入口语义。
 *
 * 这里只固化稳定地图知识，不保存 demo 频率、完整动线或战术结论。
 * Dust2/Overpass 的 routeMarkers 用于表达“路线方向早于真实进包边界”。
 */
export const SITE_ENTRY_SEMANTICS: Record<string, MapSiteSemantics> = {
  de_ancient: {
    entries: [
      entry("a_main", "a", ["MainHall"]),
      entry("a_side_hall", "a", ["SideHall"], "split"),
      entry("a_ct_spawn", "a", ["CTSpawn"], "deep_wrap"),
      entry("b_ramp", "b", ["Ramp"]),
      entry("b_side_entrance", "b", ["SideEntrance"], "split"),
      entry("b_alley", "b", ["Alley"], "deep_wrap"),
    ],
  },
  de_anubis: {
    entries: [
      entry("a_main", "a", ["Main", "Fountain"]),
      entry("a_walkway", "a", ["Walkway"], "split"),
      entry("a_heaven", "a", ["Heaven"], "deep_wrap"),
      entry("b_outside", "b", ["OutsideLong"]),
      entry("b_connector", "b", ["Connector"], "split"),
      entry("b_bricks", "b", ["Bricks"], "split"),
      entry("b_alley", "b", ["Alley"], "deep_wrap"),
    ],
  },
  de_dust2: {
    entries: [
      entry("a_short_entry", "a", ["ExtendedA"]),
      entry("a_long_entry", "a", ["ARamp"]),
      entry("b_upper_tunnel", "b", ["UpperTunnel"]),
      entry("b_mid_doors", "b", ["BDoors", "Hole"], "split"),
    ],
    routeMarkers: [
      marker("a_short_route", "a", ["ShortStairs"]),
      marker("a_long_route", "a", ["LongA"]),
    ],
  },
  de_inferno: {
    entries: [
      entry("a1", "a", ["TopofMid", "Quad"]),
      entry("a2", "a", ["Balcony"]),
      entry("a_connector", "a", ["Arch", "Library"], "split"),
      entry("b_banana", "b", ["Banana"]),
      entry("b_ruins", "b", ["Ruins"], "deep_wrap"),
    ],
  },
  de_mirage: {
    entries: [
      entry("a_ramp", "a", ["TRamp"]),
      entry("a_palace", "a", ["PalaceInterior", "Scaffolding"]),
      entry("a_connector", "a", ["Connector"], "split"),
      entry("a_jungle", "a", ["Jungle"], "deep_wrap"),
      entry("b_apartments", "b", ["Apartments", "Truck"]),
      entry("b_short", "b", ["Catwalk"], "split"),
      entry("b_market", "b", ["Shop"], "deep_wrap"),
    ],
  },
  de_nuke: {
    entries: [
      entry("a_hut", "a", ["Hut"]),
      entry("a_mini", "a", ["Mini"]),
      entry("a_squeaky", "a", ["Squeaky"]),
      entry("a_heaven", "a", ["Heaven", "Rafters"], "deep_wrap"),
      entry("b_ramp", "b", ["Ramp"]),
      entry("b_decon", "b", ["Decon"]),
      entry("b_tunnels", "b", ["Tunnels", "Observation"], "deep_wrap"),
    ],
  },
  de_overpass: {
    entries: [
      entry("a_lower_park", "a", ["LowerPark"]),
      entry("a_upper_park", "a", ["UpperPark"]),
      entry("a_bank", "a", ["Lobby", "StorageRoom", "Stairs", "BackofA"], "deep_wrap"),
      entry("b_monster", "b", ["Canal"]),
      entry("b_short", "b", ["Construction", "Bridge"]),
      entry("b_snipers_walkway", "b", ["SnipersNest", "Walkway"], "deep_wrap"),
    ],
    routeMarkers: [
      marker("b_snipers_walkway_route", "b", ["SnipersNest", "Walkway"], "deep_wrap"),
    ],
  },
};

function entry(
  id: string,
  target: SiteTarget,
  entryCallouts: readonly string[],
  kind: SiteEntryKind = "canonical",
): SiteEntryFamilyDefinition {
  return { id, target, entryCallouts, kind };
}

function marker(
  id: string,
  target: SiteTarget,
  callouts: readonly string[],
  kind: SiteEntryKind = "canonical",
): SiteRouteMarkerDefinition {
  return { id, target, callouts, kind };
}

function lastMatch<T extends { callouts?: readonly string[]; entryCallouts?: readonly string[] }>(
  definitions: readonly T[],
  path: readonly string[],
): { definition: T; callout: string; index: number } | null {
  let best: { definition: T; callout: string; index: number } | null = null;
  for (const definition of definitions) {
    const aliases = definition.entryCallouts ?? definition.callouts ?? [];
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const callout = path[index];
      if (callout && aliases.includes(callout) && (!best || index > best.index)) {
        best = { definition, callout, index };
        break;
      }
    }
  }
  return best;
}

export function resolveSiteEntry(
  mapName: string,
  target: SiteTarget,
  callouts: readonly string[],
): ResolvedSiteEntry {
  const semantics = SITE_ENTRY_SEMANTICS[mapName];
  const siteCallout = target === "a" ? "BombsiteA" : "BombsiteB";
  const siteIndex = callouts.indexOf(siteCallout);
  const prefix = siteIndex >= 0 ? callouts.slice(0, siteIndex) : callouts;
  const entryMatch = lastMatch(
    semantics?.entries.filter((definition) => definition.target === target) ?? [],
    prefix,
  );
  const routeMatch = lastMatch(
    semantics?.routeMarkers?.filter((definition) => definition.target === target) ?? [],
    prefix,
  );
  const entryDefinition = entryMatch?.definition;
  const routeDefinition = routeMatch?.definition;
  return {
    target,
    entryChokeId: entryDefinition?.id ?? null,
    entryCallout: entryMatch?.callout ?? null,
    routeFamilyId: routeDefinition?.id ?? entryDefinition?.id ?? null,
    routeMarkerCallout: routeMatch?.callout ?? entryMatch?.callout ?? null,
    kind: routeDefinition?.kind ?? entryDefinition?.kind ?? null,
  };
}

export function siteEntryChokeId(
  mapName: string,
  target: SiteTarget,
  callouts: readonly string[],
): string | null {
  return resolveSiteEntry(mapName, target, callouts).entryChokeId;
}
