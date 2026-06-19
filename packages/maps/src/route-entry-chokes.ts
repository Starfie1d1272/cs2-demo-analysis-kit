export type RouteTarget = "a" | "b";

type EntryChokeAliases = Record<string, string>;

/** Stable final-entry families used to group complete observed route variants. */
export const ROUTE_ENTRY_CHOKES: Record<
  string,
  Partial<Record<RouteTarget, EntryChokeAliases>>
> = {
  de_ancient: {
    a: { MainHall: "a_main", SideHall: "a_side_hall", CTSpawn: "a_ct_spawn" },
    b: { Ramp: "b_ramp", SideEntrance: "b_side_entrance", Alley: "b_alley" },
  },
  de_anubis: {
    a: { Main: "a_main", Fountain: "a_main", Walkway: "a_walkway" },
    b: { OutsideLong: "b_outside", Connector: "b_connector", Bricks: "b_bricks" },
  },
  de_dust2: {
    a: { ARamp: "a_long", ExtendedA: "a_short" },
    b: { UpperTunnel: "b_upper_tunnel", BDoors: "b_mid_doors", Hole: "b_mid_doors" },
  },
  de_inferno: {
    a: { Arch: "a_arch", Balcony: "a_balcony", Pit: "a_pit", Quad: "a_quad", TopofMid: "a_mid" },
    b: { Banana: "b_banana", Ruins: "b_ruins" },
  },
  de_mirage: {
    a: { Connector: "a_connector", Jungle: "a_jungle", PalaceInterior: "a_palace", Scaffolding: "a_scaffolding" },
    b: { Apartments: "b_apartments", Catwalk: "b_catwalk", Truck: "b_truck" },
  },
  de_nuke: {
    a: { Hut: "a_hut", Mini: "a_mini", Rafters: "a_rafters", Squeaky: "a_squeaky", Vents: "a_vents" },
    b: { Decon: "b_decon", Observation: "b_observation", Ramp: "b_ramp", Tunnels: "b_tunnels" },
  },
  de_overpass: {
    a: { LowerPark: "a_lower_park", UpperPark: "a_upper_park" },
    b: { Canal: "b_monster", Construction: "b_short" },
  },
};

function fallbackId(target: RouteTarget, callout: string): string {
  const snake = callout
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `${target}_${snake || "unknown"}`;
}

export function routeEntryChokeId(
  mapName: string,
  target: RouteTarget,
  callouts: string[],
): string {
  const terminalCallout = callouts.at(-2);
  if (!terminalCallout) return `${target}_unknown`;
  return ROUTE_ENTRY_CHOKES[mapName]?.[target]?.[terminalCallout] ??
    fallbackId(target, terminalCallout);
}
