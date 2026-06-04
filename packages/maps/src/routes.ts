/**
 * map-routes — 进攻动线（T 方从匪家到包点的推进路径）
 *
 * 定位：一条动线 = 一串**有序的 CS2 callout 区域名**（= positions-1s 的
 * `lastPlaceName` 取值），从 T 出生区指向某个包点。控制进度 / 道具拖延都沿这条
 * 一维序列度量。
 *
 * 边界：动线**只引用 callout 名字，不含任何坐标**——区域归属由导出器写进
 * `lastPlaceName`，本层不做几何。需要把一个 callout 再切细（如 Palace 分上下）时
 * 才回到 `zones.ts` 的多边形层。本文件只定义结构 + 沿线定位，不算指标（指标在 core）。
 *
 * 数据：每张图一个 `packages/maps/map-routes/<map>.json`，由 `scripts/extract-routes.ts`
 * 从真实 demo 的 T 方开局转移半自动挖出、人工确认。
 */

/** 动线上的一个命名区域。 */
export interface RouteZone {
  /** `lastPlaceName` 原始取值（如 "TSpawn" / "PalaceAlley" / "BombsiteA"）。 */
  id: string;
  /** 中文名（如 "T 出生点" / "Palace 巷口"）。 */
  nameCn: string;
}

/** 动线类型——区分进攻线 vs 控制/入侵线。 */
export type RouteType =
  | "primary_entry"    // 主进攻线：A厅、B坡、Dust2 B洞 —— 直插包点的干道
  | "secondary_entry"  // 副进攻线：A小、B侧门、Inferno二楼 —— 次要/split 进点路径
  | "mid_connector"    // 中路 connector：中路→拱门/甜甜圈/连接 —— 价值在夹击与压缩防守
  | "lurk_lane"        // 单挂牵制线：控VIP/黑屋 —— 终点是控制区而非包点
  | "rotation_cut";    // 断回防线：入侵警家/切轮转路线 —— 切断CT回防通道

/** 可信度——数据支撑程度。 */
export type RouteConfidence = "high" | "medium" | "low";

/** 一条进攻动线：从 T 出生区到某包点的有序 callout 序列。 */
export interface MapRoute {
  /** 稳定唯一 id（如 "a_main" / "b_ramp"）。 */
  id: string;
  /** 人类可读名（如 "A 厅" / "B 坡"）。 */
  name: string;
  /** 动线类型。 */
  type: RouteType;
  /** 该动线指向的包点。 */
  bombsite: "a" | "b";
  /** 可信度标签。 */
  confidence: RouteConfidence;
  /**
   * 推进顺序的 callout 序列（T 出生区 → 包点）。
   * 第一个元素通常为 TSpawn、最后一个为 BombsiteA / BombsiteB。
   */
  zones: RouteZone[];
}

export interface MapRoutes {
  /** 如 "de_mirage"。 */
  mapName: string;
  /** 标定版本，便于演进。 */
  version: string;
  routes: MapRoute[];
}

/** 提取动线上所有 zone id（供兼容字符串 API 使用）。 */
function zoneIds(route: MapRoute): string[] {
  return route.zones.map((z) => z.id);
}

/**
 * callout 在动线上的位置下标（0 = 起点/T 出生侧，越大越靠近包点），
 * 不在该动线上返回 -1。
 */
export function routeIndex(route: MapRoute, placeName: string | null | undefined): number {
  if (!placeName) return -1;
  return zoneIds(route).indexOf(placeName);
}

/**
 * 一组当前被某方占有的 callout，沿该动线推进到的**最远下标**（-1 = 一个都不在线上）。
 * 这是「区域控制进度」的核心原语：进攻方连续占有到 banana 顶 = 进度 = 该 callout 的下标。
 */
export function furthestRouteIndex(
  route: MapRoute,
  controlledPlaceNames: Iterable<string>,
): number {
  let best = -1;
  const ids = zoneIds(route);
  for (const pl of controlledPlaceNames) {
    const i = ids.indexOf(pl);
    if (i > best) best = i;
  }
  return best;
}
