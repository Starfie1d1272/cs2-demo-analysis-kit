/**
 * Raw evidence 地基：位置标注 + 空间资产装载（严格重建 SP1）。
 * 设计见 docs/design/rr-model.md §3、§5（计算流程）。
 *
 * 标注优先级（doc §2.2）：manual zone polygon > callout projection > nearest nav area。
 * 当前**无 zone 多边形标定**，故落到 callout（replay place 列）+ navAreaId。
 * 这些是 official MapControl gate（SP2：solo pressure 的 nav 距离、denial 的 LOS）的输入底座。
 *
 * v3 replay 8Hz 流替代了 v2 的 positions-1s。每帧解码后转换：
 * - track.tick（差分编码 → decodeDelta）
 * - track.x/y/z（差分编码 × coordScale → 游戏单位）
 * - track.place（索引 → placeDict）
 * - track.flags（FLAG_ALIVE）
 * - track.hp（原始值）
 */
import type { DemoPackage } from "@cs2dak/contract";
import { decodeDelta, FLAG_ALIVE } from "@cs2dak/contract";
import {
  getMapNav,
  getMapRoutes,
  getMapZones,
  type CompactNav,
  type MapRoutes,
  type MapZones,
  type TriangleBvh,
  type Vec3,
  type ZoneRole,
} from "@cs2dak/maps";

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
  /** callout（replay placeDict）；缺失为 null。 */
  callout: string | null;
  /** 标定 zone id（zone > callout，doc §2.2）；无 zone 资产或未命中为 null。 */
  zoneId: string | null;
  /** zone 语义角色（site/mid/connector/lane…）；无 zone 为 null。 */
  zoneRole: ZoneRole | null;
  /** zone 关联包点；无则 null。 */
  zoneBombsite: "a" | "b" | null;
  /** 最近 nav area id；无 nav 资产为 null。 */
  navAreaId: number | null;
  /** 当前血量（火焰逼退掉血判定用）；缺失为 100。 */
  health: number;
}

/**
 * 从 replay 8Hz 流标注位置样本（v3 替代 v2 positions-1s）。
 * 返回所有存活/阵亡玩家的逐帧标注，zone/nav 判定暂缺（需 maps 包导出 zoneAt/nearestNavArea）。
 */
export function annotatePositions(pkg: DemoPackage, _assets: SpatialAssets): AnnotatedSample[] {
  const replay = pkg.replay;
  if (!replay) return [];

  const coordScale = replay.meta.coordScale;
  const placeDict = replay.placeDict ?? [];
  const samples: AnnotatedSample[] = [];

  const roundByNumber = new Map(pkg.rounds.map((r) => [r.roundNumber, r]));

  for (const round of replay.rounds) {
    const roundRow = roundByNumber.get(round.roundNumber);
    if (!roundRow) continue;
    const tickStep = round.tickStep;

    for (const track of round.players) {
      const player = pkg.players[track.playerIndex];
      if (!player) continue;

      const xs = decodeDelta(track.x);
      const ys = decodeDelta(track.y);
      const zs = decodeDelta(track.z);
      const side: string | null =
        player.teamKey === "teamA" ? roundRow.teamASide : roundRow.teamBSide;

      for (let i = 0; i < xs.length; i++) {
        const placeIdx = track.place[i] ?? -1;
        samples.push({
          roundNumber: round.roundNumber,
          tick: round.startTick + i * tickStep,
          steamId64: player.steamId64,
          teamKey: player.teamKey,
          side,
          alive: ((track.flags[i] ?? 0) & FLAG_ALIVE) !== 0,
          position: {
            x: (xs[i] ?? 0) * coordScale,
            y: (ys[i] ?? 0) * coordScale,
            z: (zs[i] ?? 0) * coordScale,
          },
          callout: placeIdx >= 0 && placeIdx < placeDict.length ? placeDict[placeIdx] : null,
          zoneId: null,
          zoneRole: null,
          zoneBombsite: null,
          navAreaId: null,
          health: track.hp[i] ?? 100,
        });
      }
    }
  }

  return samples;
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

