export interface DefaultAnchor {
  /** 展示名（社区叫法），如 "A1"。 */
  name: string;
  /** 归并到该 anchor 的原始 callout id 列表。 */
  callouts: string[];
}

export interface SideDefaults {
  /** anchorId -> anchor（有序：决定 basis 展示顺序）。 */
  anchors: Record<string, DefaultAnchor>;
  /** 非 default callout 的角色（advanced/ct/terminal）；不在表内的为 other。 */
  roles: Record<string, "advanced" | "ct" | "terminal">;
}

export interface MapDefaults {
  t: SideDefaults;
  ct: SideDefaults;
}

export type DefaultPositionSide = "t" | "ct";

export type CalloutRole =
  | { kind: "default"; anchorId: string }
  | { kind: "advanced" }
  | { kind: "ct" }
  | { kind: "terminal" }
  | { kind: "other" };

export const DEFAULT_POSITIONS: Record<string, MapDefaults> = {
  de_ancient: {
    t: {
      anchors: {
        a_hall: { name: "A厅", callouts: ["MainHall", "Outside"] },
        b_ramp: { name: "B坡/B外", callouts: ["Ruins", "Ramp"] },
        b_short: { name: "B小/跳台", callouts: ["TSideLower", "TSideUpper"] },
        tunnel_water: { name: "隧道/水路", callouts: ["Tunnel", "Water"] },
      },
      roles: {
        Middle: "ct",
        TopofMid: "ct",
        SideHall: "ct",
        SideEntrance: "ct",
        Alley: "ct",
        House: "ct",
        BombsiteA: "terminal",
        BombsiteB: "terminal",
        CTSpawn: "terminal",
      },
    },
    ct: {
      anchors: {
        mid: { name: "中路", callouts: ["Middle", "TopofMid"] },
        a_site: { name: "A点", callouts: ["BombsiteA", "SideHall", "SideEntrance"] },
        b_site: { name: "B点", callouts: ["BombsiteB", "Alley", "House"] },
        ct_spawn: { name: "警家", callouts: ["CTSpawn"] },
      },
      roles: {
        Outside: "advanced",
        MainHall: "advanced",
        Ruins: "advanced",
        Ramp: "advanced",
        TSideLower: "advanced",
        TSideUpper: "advanced",
        Tunnel: "advanced",
        Water: "advanced",
        TSpawn: "terminal",
      },
    },
  },
  de_anubis: {
    t: {
      anchors: {
        a_hall: { name: "A厅", callouts: ["Main"] },
        mid: { name: "中路", callouts: ["Bridge", "Middle", "MidDoors"] },
        canal: { name: "水下", callouts: ["Canal"] },
        b_long: { name: "B外", callouts: ["Ruins", "OutsideLong"] },
        t_spawn_route: { name: "匪路", callouts: ["Street", "TSideUpper", "TStairs"] },
      },
      roles: {
        Connector: "advanced",
        Walkway: "advanced",
        PalaceInterior: "advanced",
        BackofB: "ct",
        Bricks: "ct",
        CTSideUpper: "ct",
        Alley: "ct",
        LowerTunnel: "ct",
        SnipersNest: "ct",
        Fountain: "ct",
        Heaven: "ct",
        Tunnel: "ct",
        TunnelStairs: "ct",
        BombsiteA: "terminal",
        BombsiteB: "terminal",
        CTSpawn: "terminal",
      },
    },
    ct: {
      anchors: {
        b_site: { name: "B点", callouts: ["BombsiteB", "BackofB", "PalaceInterior", "Bricks"] },
        mid: { name: "中路", callouts: ["Middle", "Connector", "MidDoors"] },
        a_site: { name: "A点", callouts: ["BombsiteA", "Walkway", "Heaven"] },
        ct_spawn: { name: "警家", callouts: ["CTSideUpper", "Alley", "LowerTunnel", "CTSpawn", "SnipersNest"] },
      },
      roles: {
        Bridge: "advanced",
        Canal: "advanced",
        Main: "advanced",
        OutsideLong: "advanced",
        Ruins: "advanced",
        Street: "advanced",
        TSideUpper: "advanced",
        TStairs: "advanced",
        Tunnel: "advanced",
        TunnelStairs: "advanced",
        TSpawn: "terminal",
      },
    },
  },
  de_dust2: {
    t: {
      anchors: {
        a_long: { name: "A大", callouts: ["OutsideLong", "LongDoors", "LongA"] },
        mid_b1: { name: "中路/B1", callouts: ["TopofMid", "Middle", "LowerTunnel"] },
        b_tunnels: { name: "B洞", callouts: ["OutsideTunnel", "UpperTunnel", "TunnelStairs"] },
      },
      roles: {
        Catwalk: "advanced",
        ShortStairs: "advanced",
        ExtendedA: "advanced",
        ARamp: "advanced",
        Pit: "advanced",
        MidDoors: "ct",
        UnderA: "ct",
        BDoors: "ct",
        Hole: "ct",
        Side: "advanced",
        BombsiteA: "terminal",
        BombsiteB: "terminal",
        CTSpawn: "terminal",
      },
    },
    ct: {
      anchors: {
        a_long: { name: "A大", callouts: ["LongA", "Pit"] },
        a_short: { name: "A小", callouts: ["Catwalk", "ShortStairs", "ExtendedA"] },
        mid: { name: "中门/警家", callouts: ["MidDoors", "UnderA", "CTSpawn"] },
        b_site: { name: "B点", callouts: ["BombsiteB", "BDoors", "Hole"] },
      },
      roles: {
        OutsideLong: "advanced",
        LongDoors: "advanced",
        TopofMid: "advanced",
        Middle: "advanced",
        LowerTunnel: "advanced",
        OutsideTunnel: "advanced",
        UpperTunnel: "advanced",
        TunnelStairs: "advanced",
        TRamp: "advanced",
        ARamp: "advanced",
        BombsiteA: "terminal",
        TSpawn: "terminal",
      },
    },
  },
  de_inferno: {
    t: {
      anchors: {
        banana: { name: "香蕉道", callouts: ["Banana"] },
        mid: { name: "中路", callouts: ["TRamp", "LowerMid", "Middle", "TopofMid"] },
        second_mid_apps: {
          name: "侧道/二楼",
          callouts: ["SecondMid", "Apartments", "BackAlley", "Underpass", "Bridge", "Upstairs", "Deck"],
        },
      },
      roles: {
        Arch: "advanced",
        Library: "advanced",
        Balcony: "advanced",
        Quad: "advanced",
        Pit: "advanced",
        Graveyard: "advanced",
        Kitchen: "advanced",
        Ruins: "ct",
        BombsiteA: "terminal",
        BombsiteB: "terminal",
        CTSpawn: "terminal",
      },
    },
    ct: {
      anchors: {
        b_site: { name: "B点", callouts: ["BombsiteB", "Banana", "Ruins"] },
        a_site: { name: "A点", callouts: ["BombsiteA", "Pit", "Quad", "Graveyard"] },
        arch_library: { name: "拱门/书房", callouts: ["Arch", "Library"] },
        ct_spawn: { name: "警家", callouts: ["CTSpawn"] },
      },
      roles: {
        TRamp: "advanced",
        LowerMid: "advanced",
        Middle: "advanced",
        TopofMid: "advanced",
        SecondMid: "advanced",
        Apartments: "advanced",
        BackAlley: "advanced",
        Underpass: "advanced",
        Bridge: "advanced",
        Upstairs: "advanced",
        Deck: "advanced",
        Balcony: "advanced",
        TSpawn: "terminal",
      },
    },
  },
  de_mirage: {
    t: {
      anchors: {
        a_ramp: { name: "A1", callouts: ["PalaceAlley", "TRamp"] },
        a_palace: { name: "A二楼", callouts: ["PalaceInterior", "Scaffolding"] },
        mid: { name: "中路", callouts: ["TopofMid", "SideAlley", "Middle"] },
        underpass: { name: "下水道", callouts: ["Underpass"] },
        b_apps: { name: "B二楼", callouts: ["House", "BackAlley", "Apartments"] },
      },
      roles: {
        Catwalk: "advanced",
        Connector: "advanced",
        Stairs: "advanced",
        Ladder: "advanced",
        Jungle: "ct",
        SnipersNest: "ct",
        Shop: "ct",
        Truck: "ct",
        BombsiteA: "terminal",
        BombsiteB: "terminal",
        CTSpawn: "terminal",
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A点", callouts: ["BombsiteA", "Stairs", "Jungle"] },
        mid: { name: "中路", callouts: ["SnipersNest", "Connector", "Catwalk", "Ladder"] },
        b_site: { name: "B点", callouts: ["BombsiteB", "Shop", "Truck"] },
      },
      roles: {
        PalaceAlley: "advanced",
        TopofMid: "advanced",
        Apartments: "advanced",
        TSpawn: "terminal",
        Underpass: "terminal",
      },
    },
  },
  de_nuke: {
    t: {
      anchors: {
        outside: { name: "外场", callouts: ["Outside", "Roof", "Silo"] },
        lobby_a: { name: "匪厅/A内", callouts: ["Lobby", "Squeaky", "Hut", "Trophy"] },
        ramp: { name: "铁板", callouts: ["Ramp"] },
        secret_b: { name: "K1/地下", callouts: ["Secret", "Tunnels", "Vending", "Control"] },
      },
      roles: {
        Mini: "advanced",
        Rafters: "advanced",
        Garage: "ct",
        Catwalk: "ct",
        Admin: "ct",
        Heaven: "ct",
        Hell: "ct",
        Decon: "ct",
        Observation: "ct",
        LockerRoom: "ct",
        BombsiteA: "terminal",
        BombsiteB: "terminal",
        CTSpawn: "terminal",
      },
    },
    ct: {
      anchors: {
        outside: { name: "外场", callouts: ["Outside", "Garage", "Catwalk"] },
        a_site: { name: "A点", callouts: ["BombsiteA", "Rafters", "Mini", "HutRoof", "Heaven", "Hell"] },
        ramp: { name: "铁板", callouts: ["Ramp", "Admin"] },
        b_site: { name: "B点", callouts: ["BombsiteB", "Control", "Decon", "Observation"] },
        ct_spawn: { name: "警家", callouts: ["CTSpawn", "LockerRoom"] },
      },
      roles: {
        Roof: "advanced",
        Silo: "advanced",
        Lobby: "advanced",
        Squeaky: "advanced",
        Hut: "advanced",
        Trophy: "advanced",
        Secret: "advanced",
        Tunnels: "advanced",
        Vending: "advanced",
        Vents: "advanced",
        TSpawn: "terminal",
      },
    },
  },
  de_overpass: {
    t: {
      anchors: {
        a_upper: { name: "A区上路", callouts: ["Fountain", "Playground", "UpperPark", "LowerPark"] },
        underpass: { name: "下水道", callouts: ["Tunnels", "Connector"] },
        canal: { name: "长管", callouts: ["Canal"] },
        b_short: { name: "B短/工地", callouts: ["Pipe", "Water", "Construction"] },
        b_outer: { name: "B外", callouts: ["Alley", "TStairs"] },
      },
      roles: {
        Restroom: "advanced",
        Walkway: "advanced",
        SnipersNest: "ct",
        UnderA: "ct",
        BackofA: "ct",
        Lobby: "ct",
        StorageRoom: "ct",
        Bridge: "advanced",
        Stairs: "ct",
        SideAlley: "advanced",
        BombsiteA: "terminal",
        BombsiteB: "terminal",
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A点", callouts: ["BombsiteA", "LowerPark", "UpperPark", "BackofA", "UnderA", "Stairs", "Restroom"] },
        b_site: { name: "B点", callouts: ["BombsiteB", "Water", "Walkway", "SnipersNest", "Construction"] },
        connector: { name: "下水道", callouts: ["Connector"] },
        bank: { name: "银行", callouts: ["Lobby", "StorageRoom"] },
      },
      roles: {
        Fountain: "advanced",
        Playground: "advanced",
        Tunnels: "advanced",
        Canal: "advanced",
        Pipe: "advanced",
        Alley: "advanced",
        TStairs: "advanced",
        Bridge: "advanced",
        SideAlley: "advanced",
        TSpawn: "terminal",
      },
    },
  },
};

function sideDefaults(mapName: string, side: DefaultPositionSide): SideDefaults | null {
  return DEFAULT_POSITIONS[mapName]?.[side] ?? null;
}

export function roleOf(mapName: string, side: DefaultPositionSide, callout: string): CalloutRole {
  const defaults = sideDefaults(mapName, side);
  if (!defaults) return { kind: "other" };

  for (const [anchorId, anchor] of Object.entries(defaults.anchors)) {
    if (anchor.callouts.includes(callout)) return { kind: "default", anchorId };
  }

  const role = defaults.roles[callout];
  return role ? { kind: role } : { kind: "other" };
}

export function anchorOf(mapName: string, side: DefaultPositionSide, callout: string): string | null {
  const role = roleOf(mapName, side, callout);
  return role.kind === "default" ? role.anchorId : null;
}
