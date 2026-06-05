/**
 * Raw evidence 地基：位置标注 + 空间资产装载（严格重建 SP1）。
 * 设计见 docs/design/rr-model.md §3、§5（计算流程）。
 *
 * 标注优先级（doc §2.2）：manual zone polygon > callout projection > nearest nav area。
 * 当前**无 zone 多边形标定**，故落到 callout（positions 的 lastPlaceName）+ navAreaId。
 * 这些是 official MapControl gate（SP2：solo pressure 的 nav 距离、denial 的 LOS）的输入底座。
 */
import type { DemoPackage } from "@cs2dak/contract";
import {
  getMapNav,
  getMapRoutes,
  getMapZones,
  nearestNavArea,
  zoneAt,
  type CompactNav,
  type MapRoutes,
  type MapZones,
  type TriangleBvh,
  type Vec3,
  type ZoneRole,
} from "@cs2dak/maps";

type PositionRow = NonNullable<DemoPackage["positions1s"]>[number];

export interface SpatialAssets {
  mapName: string;
  routes: MapRoutes | null;
  zones: MapZones | null;
  nav: CompactNav | null;
  /** 静态视线 BVH；Node 下经 tri-assets 装载，浏览器降级为 null。 */
  visibility: TriangleBvh | null;
  available: {
    routes: boolean;
    zones: boolean;
    nav: boolean;
    visibility: boolean;
  };
}

export function loadSpatialAssets(mapName: string, triBvh?: TriangleBvh | null): SpatialAssets {
  const routes = getMapRoutes(mapName);
  const zones = getMapZones(mapName);
  const nav = getMapNav(mapName);
  const visibility = triBvh ?? null;
  return {
    mapName,
    routes,
    zones,
    nav,
    visibility,
    available: {
      routes: routes != null,
      zones: zones != null,
      nav: nav != null,
      visibility: visibility != null,
    },
  };
}

export interface AnnotatedSample {
  roundNumber: number;
  tick: number;
  steamId64: string;
  teamKey: string;
  side: string | null;
  alive: boolean;
  position: Vec3;
  /** callout（positions 的 lastPlaceName）；缺失为 null。 */
  callout: string | null;
  /** 标定 zone id（zone > callout，doc §2.2）；无 zone 资产或未命中为 null。 */
  zoneId: string | null;
  /** zone 语义角色（site/mid/connector/lane…）；无 zone 为 null。 */
  zoneRole: ZoneRole | null;
  /** zone 关联包点；无则 null。 */
  zoneBombsite: "a" | "b" | null;
  /** 最近 nav area id；无 nav 资产为 null。 */
  navAreaId: number | null;
}

/**
 * 给每条 1Hz 位置样本附上 callout + navAreaId。
 * 无 positions → 空数组；无 nav → navAreaId 全 null（official 降级，见 evidenceQuality）。
 */
export function annotatePositions(pkg: DemoPackage, assets: SpatialAssets): AnnotatedSample[] {
  const rows = pkg.positions1s ?? [];
  const out: AnnotatedSample[] = [];
  for (const row of rows) {
    const position = toVec3(row);
    const zone = assets.zones ? zoneAt(assets.zones, position.x, position.y, position.z) : null;
    out.push({
      roundNumber: row.roundNumber,
      tick: row.tick,
      steamId64: row.steamId64,
      teamKey: row.teamKey,
      side: (row as { side?: string }).side ?? null,
      alive: (row as { alive?: boolean }).alive ?? true,
      position,
      callout: (row as { lastPlaceName?: string | null }).lastPlaceName ?? null,
      zoneId: zone?.id ?? null,
      zoneRole: zone?.role ?? null,
      zoneBombsite: zone?.bombsite ?? null,
      navAreaId: assets.nav ? (nearestNavArea(assets.nav, position)?.id ?? null) : null,
    });
  }
  return out;
}

/** 按 (round, tick) 分组的标注样本，供逐帧 gate 消费。 */
export function groupSamplesByRoundTick(
  samples: AnnotatedSample[],
): Map<number, Map<number, AnnotatedSample[]>> {
  const out = new Map<number, Map<number, AnnotatedSample[]>>();
  for (const s of samples) {
    let byTick = out.get(s.roundNumber);
    if (!byTick) {
      byTick = new Map();
      out.set(s.roundNumber, byTick);
    }
    const arr = byTick.get(s.tick) ?? [];
    arr.push(s);
    byTick.set(s.tick, arr);
  }
  return out;
}

function toVec3(row: PositionRow): Vec3 {
  const p = (row as { position?: Partial<Vec3> }).position ?? {};
  return { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 };
}
