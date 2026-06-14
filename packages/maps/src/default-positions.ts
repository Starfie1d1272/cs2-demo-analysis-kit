export interface DefaultAnchor {
  /** 展示名（社区叫法），如 "A1"。 */
  name: string;
  /** 归并到该 anchor 的原始 callout id 列表。 */
  callouts: string[];
}

export interface SideDefaults {
  /** anchorId -> anchor（有序：决定 basis 展示顺序）。 */
  anchors: Record<string, DefaultAnchor>;
}

export interface MapDefaults {
  t: SideDefaults;
  ct: SideDefaults;
  /** 双方会争夺或推进经过的区域，不作为开局默认停挂点。 */
  contested: string[];
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
        t_outside: { name: "匪口", callouts: ["Outside"] },
        a_hall: { name: "A厅", callouts: ["MainHall"] },
        b_outer: { name: "B外", callouts: ["Ruins"] },
        b_short: { name: "B小", callouts: ["TSideLower"] },
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A包/甜甜圈", callouts: ["BombsiteA", "SideHall"] },
        mid: { name: "中路/中远", callouts: ["Middle", "TopofMid"] },
        b_site: { name: "B包/底线/VIP", callouts: ["BombsiteB", "Alley", "House"] },
        black_house: { name: "黑屋", callouts: ["SideEntrance"] },
      },
    },
    contested: ["Middle", "TSideUpper", "SideEntrance", "Ramp", "MainHall"],
  },
  de_anubis: {
    t: {
      anchors: {
        b_long: { name: "B外", callouts: ["Ruins", "OutsideLong"] },
        mid_bridge: { name: "中桥", callouts: ["Bridge"] },
        street_stairs: { name: "街道/匪梯", callouts: ["Street", "TStairs"] },
        canal: { name: "水下", callouts: ["Canal"] },
        t_upper: { name: "匪跳", callouts: ["TSideUpper"] },
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A包/A连/天堂", callouts: ["BombsiteA", "Walkway", "Heaven"] },
        mid: { name: "中路/中门/黑屋", callouts: ["Middle", "MidDoors", "Connector"] },
        b_site: { name: "B包/B连", callouts: ["BombsiteB", "PalaceInterior", "BackofB", "Bricks"] },
        ct_spawn: { name: "警家", callouts: ["CTSideUpper", "Alley", "LowerTunnel"] },
      },
    },
    contested: ["Main", "MidDoors", "Middle", "Canal", "PalaceInterior", "Connector", "Walkway"],
  },
  de_dust2: {
    t: {
      anchors: {
        a_doors: { name: "A门外/A门", callouts: ["OutsideLong", "LongDoors"] },
        top_mid: { name: "中远", callouts: ["TopofMid"] },
        b1: { name: "B1", callouts: ["LowerTunnel"] },
        b_tunnels: { name: "B洞", callouts: ["OutsideTunnel", "UpperTunnel"] },
      },
    },
    ct: {
      anchors: {
        a_long: { name: "A大/大坑", callouts: ["LongA", "Pit"] },
        a_short: { name: "A小", callouts: ["Catwalk", "ShortStairs", "ExtendedA"] },
        mid: { name: "中门/警家", callouts: ["MidDoors", "UnderA", "CTSpawn"] },
        b_site: { name: "B包/B门", callouts: ["BombsiteB", "BDoors"] },
      },
    },
    contested: ["LongA", "Catwalk", "Middle", "TunnelStairs", "BDoors", "ARamp"],
  },
  de_inferno: {
    t: {
      anchors: {
        banana: { name: "香蕉道", callouts: ["Banana"] },
        mid: { name: "匪口/中路", callouts: ["TRamp", "LowerMid", "Middle"] },
        second_mid: { name: "侧道", callouts: ["SecondMid"] },
        t_apps: { name: "匪二楼", callouts: ["BackAlley", "Upstairs"] },
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A包/大坑/马棚", callouts: ["BombsiteA", "Pit", "Quad"] },
        arch_library: { name: "拱门/书房", callouts: ["Arch", "Library"] },
        b_site: { name: "B包/教堂", callouts: ["BombsiteB", "Ruins"] },
        ct_spawn: { name: "警家", callouts: ["CTSpawn"] },
      },
    },
    contested: ["Banana", "Apartments", "Balcony", "TopofMid", "Arch"],
  },
  de_mirage: {
    t: {
      anchors: {
        a_ramp: { name: "A1", callouts: ["PalaceAlley", "TRamp"] },
        a_palace: { name: "A二楼", callouts: ["PalaceInterior"] },
        mid_spawn: { name: "匪口/中远", callouts: ["SideAlley", "TopofMid"] },
        underpass: { name: "下水道", callouts: ["Underpass"] },
        b_apps: { name: "匪二楼/B二楼", callouts: ["House", "BackAlley"] },
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A包/跳台/Jungle", callouts: ["BombsiteA", "Stairs", "Jungle"] },
        mid: { name: "VIP/拱门/B小/黑屋", callouts: ["SnipersNest", "Connector", "Catwalk", "Ladder"] },
        b_site: { name: "B包/超市/白车", callouts: ["BombsiteB", "Shop", "Truck"] },
      },
    },
    contested: ["Middle", "Underpass", "Connector", "Catwalk", "PalaceInterior", "Apartments"],
  },
  de_nuke: {
    t: {
      anchors: {
        outside: { name: "外场准备", callouts: ["Outside", "Roof", "Silo"] },
        lobby: { name: "匪厅", callouts: ["Lobby"] },
        squeaky: { name: "铁门", callouts: ["Squeaky"] },
        trophy_link: { name: "奖杯/链接", callouts: ["Trophy", "Vending"] },
      },
    },
    ct: {
      anchors: {
        outside: { name: "外场/大仓", callouts: ["Outside", "Garage"] },
        a_site: { name: "A包/三楼/正门", callouts: ["BombsiteA", "Rafters", "Mini", "Heaven", "Hell"] },
        ramp: { name: "铁板", callouts: ["Ramp", "Admin"] },
        b_site: { name: "B包/控制室/死门", callouts: ["BombsiteB", "Control", "Decon", "Observation"] },
      },
    },
    contested: ["Outside", "Hut", "Ramp", "Secret", "Tunnels", "Control", "Vending"],
  },
  de_overpass: {
    t: {
      anchors: {
        fountain: { name: "喷泉/游乐园", callouts: ["Fountain", "Playground"] },
        underpass: { name: "下水道", callouts: ["Tunnels"] },
        canal: { name: "匪家B外/长管", callouts: ["Alley", "Canal"] },
        short_pipe: { name: "匪楼梯/短管", callouts: ["TStairs", "Pipe"] },
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A厕所/A包", callouts: ["LowerPark", "UpperPark", "BombsiteA", "Restroom"] },
        b_site: { name: "B包/ABC/B二楼", callouts: ["BombsiteB", "Walkway", "SnipersNest"] },
        construction: { name: "工地/B小", callouts: ["Water", "Construction"] },
        connector: { name: "下水道连接", callouts: ["Connector"] },
      },
    },
    contested: ["Restroom", "Tunnels", "Canal", "Pipe", "Water", "Construction", "UpperPark", "LowerPark"],
  },
};

function sideDefaults(mapName: string, side: DefaultPositionSide): SideDefaults | null {
  return DEFAULT_POSITIONS[mapName]?.[side] ?? null;
}

function calloutInAnchors(defaults: SideDefaults | null, callout: string): string | null {
  if (!defaults) return null;
  for (const [anchorId, anchor] of Object.entries(defaults.anchors)) {
    if (anchor.callouts.includes(callout)) return anchorId;
  }
  return null;
}

function isTerminalFor(side: DefaultPositionSide, callout: string): boolean {
  if (side === "t") return callout === "BombsiteA" || callout === "BombsiteB" || callout === "CTSpawn";
  return callout === "TSpawn";
}

export function isContested(mapName: string, callout: string): boolean {
  return DEFAULT_POSITIONS[mapName]?.contested.includes(callout) ?? false;
}

export function roleOf(mapName: string, side: DefaultPositionSide, callout: string): CalloutRole {
  const defaults = sideDefaults(mapName, side);
  if (!defaults) return { kind: "other" };

  const ownAnchorId = calloutInAnchors(defaults, callout);
  if (ownAnchorId) return { kind: "default", anchorId: ownAnchorId };

  if (isTerminalFor(side, callout)) return { kind: "terminal" };
  if (isContested(mapName, callout)) return { kind: "advanced" };

  const otherSide = side === "t" ? "ct" : "t";
  const otherAnchorId = calloutInAnchors(sideDefaults(mapName, otherSide), callout);
  if (otherAnchorId) return side === "t" ? { kind: "ct" } : { kind: "advanced" };

  return { kind: "other" };
}

export function anchorOf(mapName: string, side: DefaultPositionSide, callout: string): string | null {
  const role = roleOf(mapName, side, callout);
  return role.kind === "default" ? role.anchorId : null;
}
