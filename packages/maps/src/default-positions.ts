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
  /** T 默认位：按开局默认展开方向划分，一个 anchor 可覆盖连续且战术含义一致的多个 callout。 */
  t: SideDefaults;
  /** CT 默认位：按具体防守站位划分，尽量一个 anchor 对应一个明确位置。 */
  ct: SideDefaults;
  /** 双方会争夺或推进经过的区域，与 T/CT 默认位正交，允许重合。 */
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
        mid: { name: "中路/跳台", callouts: ["TSideUpper", "Middle"] },
        b_outer: { name: "B外", callouts: ["Ruins"] },
        b_short: { name: "B小", callouts: ["TSideLower"] },
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A包", callouts: ["BombsiteA"] },
        donut: { name: "甜甜圈", callouts: ["SideHall"] },
        mid: { name: "中路", callouts: ["Middle"] },
        b_site: { name: "B包", callouts: ["BombsiteB"] },
        b_alley: { name: "B底线", callouts: ["Alley"] },
        vip: { name: "VIP", callouts: ["House"] },
        black_house: { name: "黑屋", callouts: ["SideEntrance"] },
      },
    },
    contested: ["MainHall", "Middle", "TSideUpper", "SideEntrance", "Ramp"],
  },
  de_anubis: {
    t: {
      anchors: {
        b_long: { name: "B外", callouts: ["Ruins", "OutsideLong"] },
        mid_bridge: { name: "中桥", callouts: ["Bridge"] },
        street: { name: "街道", callouts: ["Street", "TStairs"] },
        canal: { name: "水下", callouts: ["Canal"] },
        t_upper: { name: "匪跳", callouts: ["TSideUpper"] },
      },
    },
    ct: {
      anchors: {
        a_main: { name: "A厅前压", callouts: ["Main"] },
        a_site: { name: "A包", callouts: ["BombsiteA"] },
        a_connector: { name: "A连", callouts: ["Walkway"] },
        a_heaven: { name: "天堂", callouts: ["Heaven"] },
        mid: { name: "中路", callouts: ["Middle"] },
        mid_doors: { name: "中门", callouts: ["MidDoors"] },
        connector: { name: "黑屋", callouts: ["Connector"] },
        b_site: { name: "B包", callouts: ["BombsiteB"] },
        back_b: { name: "B包台上", callouts: ["BackofB"] },
        b_bricks: { name: "B连阳光房", callouts: ["Bricks"] },
        b_connector: { name: "B连", callouts: ["PalaceInterior"] },
      },
    },
    contested: ["Main", "Walkway", "MidDoors", "Middle", "Connector", "Canal", "PalaceInterior"],
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
        a_long: { name: "A大", callouts: ["LongA"] },
        pit: { name: "大坑", callouts: ["Pit"] },
        catwalk: { name: "A小", callouts: ["Catwalk"] },
        short_stairs: { name: "A小楼梯", callouts: ["ShortStairs"] },
        extended_a: { name: "A小过点", callouts: ["ExtendedA"] },
        mid_doors: { name: "中门", callouts: ["MidDoors"] },
        under_a: { name: "沙地/警家", callouts: ["UnderA"] },
        ct_spawn: { name: "警家", callouts: ["CTSpawn"] },
        b_site: { name: "B包", callouts: ["BombsiteB"] },
        b_doors: { name: "B门", callouts: ["BDoors"] },
      },
    },
    contested: ["LongDoors", "LongA", "Catwalk", "Middle", "TunnelStairs", "BDoors", "ARamp"],
  },
  de_inferno: {
    t: {
      anchors: {
        banana: { name: "香蕉道", callouts: ["Banana"] },
        t_mid: { name: "匪口/中路", callouts: ["LowerMid", "TRamp", "Middle"] },
        second_mid: { name: "侧道", callouts: ["SecondMid"] },
        apartments: { name: "二楼", callouts: ["BackAlley", "Apartments", "Upstairs"] },
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A包", callouts: ["BombsiteA"] },
        pit: { name: "大坑", callouts: ["Pit"] },
        quad: { name: "马棚", callouts: ["Quad"] },
        arch: { name: "拱门", callouts: ["Arch"] },
        library: { name: "书房", callouts: ["Library"] },
        top_mid: { name: "中路", callouts: ["TopofMid"] },
        apartments: { name: "二楼", callouts: ["Apartments"] },
        balcony: { name: "阳台", callouts: ["Balcony"] },
        b_site: { name: "B包", callouts: ["BombsiteB"] },
        ruins: { name: "教堂/警家", callouts: ["Ruins"] },
        banana: { name: "香蕉道", callouts: ["Banana"] },
      },
    },
    contested: ["Banana", "Apartments", "Balcony", "TopofMid", "Arch"],
  },
  de_mirage: {
    t: {
      anchors: {
        a_ramp: { name: "A1", callouts: ["PalaceAlley", "TRamp"] },
        a_palace: { name: "A二楼", callouts: ["PalaceInterior"] },
        top_mid: { name: "匪口/中远", callouts: ["SideAlley", "TopofMid"] },
        underpass: { name: "下水道", callouts: ["Underpass"] },
        b_apps: { name: "B二楼", callouts: ["House", "BackAlley", "Apartments"] },
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A包", callouts: ["BombsiteA"] },
        stairs: { name: "跳台", callouts: ["Stairs"] },
        jungle: { name: "Jungle", callouts: ["Jungle"] },
        vip: { name: "VIP", callouts: ["SnipersNest"] },
        connector: { name: "拱门", callouts: ["Connector"] },
        catwalk: { name: "B小", callouts: ["Catwalk"] },
        ladder: { name: "黑屋", callouts: ["Ladder"] },
        b_site: { name: "B包", callouts: ["BombsiteB"] },
        truck: { name: "白车", callouts: ["Truck"] },
        market: { name: "超市", callouts: ["Shop"] },
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
        trophy: { name: "奖杯房", callouts: ["Trophy"] },
        vending: { name: "链接", callouts: ["Vending"] },
      },
    },
    ct: {
      anchors: {
        outside: { name: "外场", callouts: ["Outside"] },
        garage: { name: "大仓", callouts: ["Garage"] },
        mini: { name: "正门", callouts: ["Mini"] },
        a_site: { name: "A包", callouts: ["BombsiteA"] },
        rafters: { name: "三楼横梁", callouts: ["Rafters"] },
        heaven: { name: "三楼", callouts: ["Heaven"] },
        hut: { name: "黄房", callouts: ["Hut"] },
        ramp: { name: "铁板", callouts: ["Ramp"] },
        admin: { name: "铁板三楼下", callouts: ["Admin"] },
      },
    },
    contested: ["Outside", "Hut", "Ramp", "Secret", "Tunnels", "Control", "Vending"],
  },
  de_overpass: {
    t: {
      anchors: {
        underpass: { name: "下水道", callouts: ["Tunnels"] },
        fountain: { name: "喷泉/游乐园", callouts: ["Fountain", "Playground"] },
        b_long: { name: "B外/长管", callouts: ["Alley", "Canal"] },
        short_pipe: { name: "短管", callouts: ["Pipe"] },
      },
    },
    ct: {
      anchors: {
        lower_park: { name: "A小厕所", callouts: ["LowerPark"] },
        upper_park: { name: "A大厕所", callouts: ["UpperPark"] },
        restroom: { name: "厕所", callouts: ["Restroom"] },
        a_site: { name: "A包", callouts: ["BombsiteA"] },
        b_site: { name: "B包", callouts: ["BombsiteB"] },
        walkway: { name: "ABC", callouts: ["Walkway"] },
        snipers_nest: { name: "B二楼", callouts: ["SnipersNest"] },
        water: { name: "工地", callouts: ["Water"] },
        construction: { name: "B小", callouts: ["Construction"] },
        connector: { name: "下水道连接", callouts: ["Connector"] },
      },
    },
    contested: [
      "Fountain",
      "LowerPark",
      "UpperPark",
      "Restroom",
      "Tunnels",
      "Connector",
      "Canal",
      "Pipe",
      "Water",
      "Construction",
    ],
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
