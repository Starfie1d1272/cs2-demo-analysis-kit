/**
 * map-zones — 地图区域语义层（P4 空间分析的基础）
 *
 * 定位：把世界坐标的一个点映射到一个**有名字、有角色**的区域（A 点 / mid / banana …），
 * 供 Area（区域占有）、Utility Block（道具封锁）等空间指标使用。
 *
 * 坐标系：多边形顶点用**世界坐标 XY**（与 positions-1s / replay 的 position 同系），
 * 分辨率无关、无需 radar 标定。多层地图（nuke / vertigo）用可选 [zMin, zMax] 区分上下层。
 *
 * 边界：本文件只做「点 → 区域」的几何归属，不算任何指标，不依赖 demo 数据。
 * 真实多边形坐标由人工在 `map-zones/<map>.json` 标定（这是唯一需要人工的一步）。
 */

/** 区域角色：决定该区域在分析里的语义分类（不限定地图）。 */
export type ZoneRole =
  | "site"        // 包点（A/B）
  | "connector"   // 连接通道（mid-to-B、connector…）
  | "mid"         // 中路
  | "lane"        // 主路（banana / long / apps…）
  | "spawn"       // 出生区
  | "approach"    // 进攻方接近区
  | "backsite"    // 包点后区 / 残余空间
  | "other";

export interface MapZone {
  /** 稳定唯一 id（如 "a_site" / "banana" / "mid"）。 */
  id: string;
  /** 人类可读名（如 "A 点" / "Banana"）。 */
  name: string;
  role: ZoneRole;
  /** 该区域归属的包点（site/connector 常关联），无则 null。 */
  bombsite?: "a" | "b" | null;
  /** 世界坐标 XY 多边形顶点，首尾不必闭合（自动闭合）。至少 3 点。 */
  polygon: Array<[number, number]>;
  /** 多层地图的高度范围（含），单层地图省略。 */
  zMin?: number;
  zMax?: number;
}

export interface MapZones {
  /** 如 "de_mirage"。 */
  mapName: string;
  /** 标定版本，便于演进。 */
  version: string;
  zones: MapZone[];
}

/**
 * 射线法判断点是否在多边形内（世界坐标 XY）。多边形自动闭合。
 * 边界视为命中（<=），避免相邻区域漏判。
 */
export function pointInPolygon(x: number, y: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 把一个世界坐标点归属到一个区域。
 *  - 多层地图：先按 [zMin,zMax] 过滤再做多边形判定。
 *  - 重叠区域：返回**第一个**命中的（调用方应保证 zones 顺序 = 优先级，窄区域在前）。
 *  - 无命中：返回 null。
 */
export function zoneAt(zones: MapZones, x: number, y: number, z?: number): MapZone | null {
  for (const zone of zones.zones) {
    if (z !== undefined && (zone.zMin !== undefined || zone.zMax !== undefined)) {
      if (zone.zMin !== undefined && z < zone.zMin) continue;
      if (zone.zMax !== undefined && z > zone.zMax) continue;
    }
    if (pointInPolygon(x, y, zone.polygon)) return zone;
  }
  return null;
}

/** 当前 CS2 现役图池（train 已移除）。zone 标定与 P4 分析的优先地图。 */
export const ACTIVE_DUTY_MAPS = [
  "de_ancient",
  "de_anubis",
  "de_dust2",
  "de_inferno",
  "de_mirage",
  "de_nuke",
  "de_overpass",
] as const;
export type ActiveDutyMap = (typeof ACTIVE_DUTY_MAPS)[number];
