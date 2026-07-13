import { getCalloutTendencies, getPrimaryCalloutRegion, type TacticalRegion } from "./callout-names.js";

export interface DefaultPositionGroup {
  /** 展示名（社区叫法），如 "A1"。 */
  name: string;
  /** 归并到该 group 的原始 callout id 列表。 */
  callouts: string[];
}

export interface SideDefaults {
  /** positionGroupId -> group（有序：决定 basis 展示顺序）。 */
  groups: Record<string, DefaultPositionGroup>;
}

export interface MapDefaults {
  /** T 默认位：按开局默认展开方向划分，一个 group 可覆盖连续且战术含义一致的多个 callout。 */
  t: SideDefaults;
  /** CT 默认位：按具体防守站位划分，尽量一个 group 对应一个明确位置。 */
  ct: SideDefaults;
}

export type DefaultPositionSide = "t" | "ct";

export interface DefaultPositionGroupMatch extends DefaultPositionGroup {
  id: string;
}

export interface TacticalLocation {
  callout: string | null;
  tendencies: readonly TacticalRegion[];
  primaryRegion: TacticalRegion | null;
  positionGroupId: string | null;
  isDefaultPosition: boolean;
}

export const DEFAULT_POSITION_GROUPS: Record<string, MapDefaults> = {
  de_ancient: {
    t: {
      groups: {
        t_outside: { name: "匪口", callouts: ["Outside"] },
        a_hall: { name: "A厅", callouts: ["MainHall"] },
        mid: { name: "中路/跳台", callouts: ["TSideUpper", "Middle"] },
        b_outer: { name: "B外", callouts: ["Ruins"] },
        b_short: { name: "B小", callouts: ["TSideLower"] },
      },
    },
    ct: {
      groups: {
        a_site: { name: "A包", callouts: ["BombsiteA"] },
        donut: { name: "甜甜圈", callouts: ["SideHall"] },
        mid: { name: "中路", callouts: ["Middle"] },
        b_site: { name: "B包", callouts: ["BombsiteB"] },
        b_alley: { name: "B底线", callouts: ["Alley"] },
        vip: { name: "VIP", callouts: ["House"] },
        black_house: { name: "黑屋", callouts: ["SideEntrance"] },
      },
    },
  },
  de_anubis: {
    t: {
      groups: {
        b_long: { name: "B外", callouts: ["Ruins", "OutsideLong"] },
        mid_bridge: { name: "中桥", callouts: ["Bridge"] },
        street: { name: "匪梯", callouts: ["Street", "TStairs"] },
        canal: { name: "水下", callouts: ["Canal"] },
        t_upper: { name: "匪跳", callouts: ["TSideUpper"] },
      },
    },
    ct: {
      groups: {
        a_main: { name: "A厅", callouts: ["Main"] },
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
  },
  de_dust2: {
    t: {
      groups: {
        a_doors: { name: "A门外/A门", callouts: ["OutsideLong", "LongDoors"] },
        top_mid: { name: "中远", callouts: ["TopofMid"] },
        b1: { name: "B1", callouts: ["LowerTunnel"] },
        b_tunnels: { name: "B洞", callouts: ["OutsideTunnel", "UpperTunnel"] },
      },
    },
    ct: {
      groups: {
        a_long: { name: "A大", callouts: ["LongA"] },
        pit: { name: "大坑", callouts: ["Pit"] },
        catwalk: { name: "A小", callouts: ["Catwalk", "ShortStairs", "ExtendedA"] },
        mid_doors: { name: "中门", callouts: ["MidDoors"] },
        ct_spawn: { name: "警家", callouts: ["CTSpawn", "UnderA"] },
        b_site: { name: "B包", callouts: ["BombsiteB"] },
        b_doors: { name: "B门", callouts: ["BDoors"] },
      },
    },
  },
  de_inferno: {
    t: {
      groups: {
        banana: { name: "香蕉道", callouts: ["Banana"] },
        t_mid: { name: "匪口/中路", callouts: ["LowerMid", "TRamp", "Middle"] },
        second_mid: { name: "侧道", callouts: ["SecondMid"] },
        apartments: { name: "二楼", callouts: ["BackAlley", "Apartments", "Upstairs"] },
      },
    },
    ct: {
      groups: {
        a_site: { name: "A包", callouts: ["BombsiteA"] },
        pit: { name: "大坑", callouts: ["Pit"] },
        quad: { name: "马棚", callouts: ["Quad"] },
        arch: { name: "连接/拱门", callouts: ["Arch"] },
        library: { name: "书房", callouts: ["Library"] },
        top_mid: { name: "中路", callouts: ["TopofMid"] },
        apartments: { name: "二楼", callouts: ["Apartments"] },
        balcony: { name: "阳台", callouts: ["Balcony"] },
        b_site: { name: "B包", callouts: ["BombsiteB"] },
        ruins: { name: "教堂/警家", callouts: ["Ruins"] },
        banana: { name: "香蕉道", callouts: ["Banana"] },
      },
    },
  },
  de_mirage: {
    t: {
      groups: {
        a_ramp: { name: "A1", callouts: ["PalaceAlley", "TRamp"] },
        a_palace: { name: "A二楼", callouts: ["PalaceInterior"] },
        top_mid: { name: "匪口/中远", callouts: ["SideAlley", "TopofMid"] },
        underpass: { name: "下水道", callouts: ["Underpass"] },
        b_apps: { name: "B二楼", callouts: ["House", "BackAlley", "Apartments"] },
      },
    },
    ct: {
      groups: {
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
  },
  de_nuke: {
    t: {
      groups: {
        outside: { name: "外场", callouts: ["Outside", "Roof", "Silo"] },
        lobby: { name: "匪厅", callouts: ["Lobby", "Squeaky", "Trophy", "Vending"] },
      },
    },
    ct: {
      groups: {
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
  },
  de_overpass: {
    t: {
      groups: {
        underpass: { name: "下水道", callouts: ["Tunnels"] },
        fountain: { name: "喷泉/游乐园", callouts: ["Fountain", "Playground"] },
        b_long: { name: "B外/长管", callouts: ["Alley", "Canal"] },
        short_pipe: { name: "短管/工地", callouts: ["Pipe", "Water"] },
      },
    },
    ct: {
      groups: {
        restroom: { name: "厕所", callouts: ["Restroom", "UpperPark", "LowerPark"] },
        a_site: { name: "A包", callouts: ["BombsiteA"] },
        b_site: { name: "B包", callouts: ["BombsiteB"] },
        walkway: { name: "ABC", callouts: ["Walkway"] },
        snipers_nest: { name: "B二楼", callouts: ["SnipersNest"] },
        water: { name: "工地", callouts: ["Water"] },
        construction: { name: "B小", callouts: ["Construction"] },
        connector: { name: "下水道连接", callouts: ["Connector"] },
      },
    },
  },
};

function sideDefaults(mapName: string, side: DefaultPositionSide): SideDefaults | null {
  return DEFAULT_POSITION_GROUPS[mapName]?.[side] ?? null;
}

function calloutInGroups(defaults: SideDefaults | null, callout: string): string | null {
  if (!defaults) return null;
  for (const [positionGroupId, group] of Object.entries(defaults.groups)) {
    if (group.callouts.includes(callout)) return positionGroupId;
  }
  return null;
}

export function positionGroupOf(mapName: string, side: DefaultPositionSide, callout: string): string | null {
  return calloutInGroups(sideDefaults(mapName, side), callout);
}

export function getDefaultPositionGroup(
  mapName: string,
  side: DefaultPositionSide,
  callout: string,
): DefaultPositionGroupMatch | null {
  const defaults = sideDefaults(mapName, side);
  const id = calloutInGroups(defaults, callout);
  if (!defaults || !id) return null;
  return { id, ...defaults.groups[id] };
}

export interface PositionGroupDisplay {
  id: string;
  displayName: string;
  officialName: string | null;
  resolved: boolean;
}

/** Product-neutral display adapter. Unknown ids stay explicit instead of leaking internal ids as labels. */
export function positionGroupDisplay(mapName: string, side: DefaultPositionSide, positionGroupId: string): PositionGroupDisplay {
  const group = sideDefaults(mapName, side)?.groups[positionGroupId];
  return group
    ? { id: positionGroupId, displayName: group.name, officialName: group.callouts[0] ?? null, resolved: true }
    : { id: positionGroupId, displayName: "未映射位置", officialName: null, resolved: false };
}

/** 只组合 callout 标签与手工默认位置组；推进、争夺、终点等动态语义由 core 时间线推导。 */
export function classifyTacticalLocation(
  mapName: string,
  side: DefaultPositionSide,
  callout: string | null,
): TacticalLocation {
  if (!callout) {
    return {
      callout: null,
      tendencies: [],
      primaryRegion: null,
      positionGroupId: null,
      isDefaultPosition: false,
    };
  }
  const positionGroupId = positionGroupOf(mapName, side, callout);
  return {
    callout,
    tendencies: getCalloutTendencies(mapName, callout) ?? [],
    primaryRegion: getPrimaryCalloutRegion(mapName, callout),
    positionGroupId,
    isDefaultPosition: positionGroupId != null,
  };
}
