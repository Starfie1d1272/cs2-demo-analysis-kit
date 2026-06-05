/**
 * Official UtilitySpatial actual-effect 派生（严格重建 SP3）。设计见 rr-model.md §3.4、§18。
 *
 * 解锁前提：zone 多边形标定（已完成 4/7 图：ancient/dust2/inferno/mirage）。
 *
 * 手雷归属（doc §18 修正）：effectPosition → zoneAt（不再用「最近 player 的 lastPlaceName」proxy）。
 *
 * 已落地的 actual-effect 指标（zone-based，检查敌我在 zone 的真实位置，而非落点 proxy）：
 * - actualIncendiaryDisplacementEvents：火焰 zone 内敌人在火前存在、火后 D 秒离开 → 计逼退。
 * - actualSmokeIsolationSeconds：烟落在 connector/mid/lane 要道且敌人在该 zone → 隔离秒数 × 角色权重。
 * - actualIncendiaryPathDelaySeconds：火落在通行要道且敌人在场 → 延迟秒数 × 角色权重。
 *
 * 仍缺（需静态视线 LOS / tri-BVH 接线，发 null）：
 * - actualSmokeProtectedCrossings（需判定「无烟则暴露」）
 * - actualSmokeSightlineDenialSeconds（需判定关键枪线被烟切断）
 */
import type { DemoPackage } from "@cs2dak/contract";
import type { Vec3, ZoneRole } from "@cs2dak/maps";
import { zoneAt } from "@cs2dak/maps";
import { type SpatialAssets, type AnnotatedSample, annotatePositions } from "./annotate.js";
import { inferRoundPhases, phaseAtTick } from "./phase.js";
import { isOfficialScoringPhase, type RoundPhaseModel } from "./types.js";

export type GrenadeType = "smoke" | "molotov" | "incendiary" | "flash" | "he" | "decoy" | "unknown";

export interface UtilityWindow {
  grenadeId: string;
  roundNumber: number;
  type: GrenadeType;
  throwerSteamId64: string | null;
  throwerTeamKey: string | null;
  effectTick: number;
  destroyTick: number;
  effectPosition: Vec3;
  /** effectPosition → zoneAt 归属（doc §18）；无 zone 资产或未命中为 null。 */
  zoneId: string | null;
  zoneRole: ZoneRole | null;
  zoneBombsite: "a" | "b" | null;
}

export interface OfficialUtilitySpatial {
  actualIncendiaryDisplacementEvents: number;
  actualSmokeIsolationSeconds: number;
  actualIncendiaryPathDelaySeconds: number;
  /** 需 LOS（tri-BVH）—— 暂发 null（不可观测，非 0）。 */
  actualSmokeProtectedCrossings: number | null;
  actualSmokeSightlineDenialSeconds: number | null;
}

const DISPLACE_AFTER_SECONDS = 3; // 火后回看窗口 D
const FIRE_TYPES: ReadonlySet<GrenadeType> = new Set(["molotov", "incendiary"]);
// 导出常缺 destroyTick（火焰几乎总是 null，烟雾才有）→ 按 CS2 标准时长兜底。
const FIRE_BURN_SECONDS = 7;
const SMOKE_DURATION_SECONDS = 18;

/** 道具有效持续秒数：有 destroyTick 用真值，否则按类型标准时长兜底。 */
function effectiveDurationSeconds(w: UtilityWindow, tickrate: number): number {
  if (w.destroyTick > w.effectTick) return (w.destroyTick - w.effectTick) / tickrate;
  if (FIRE_TYPES.has(w.type)) return FIRE_BURN_SECONDS;
  if (w.type === "smoke") return SMOKE_DURATION_SECONDS;
  return 0;
}

/** zone 角色 → actual-effect 权重（doc §16.2 displacementWeight 思路）。0 = raw only，不计 official。 */
function roleWeight(role: ZoneRole | null): number {
  switch (role) {
    case "site":
      return 1.0;
    case "lane":
    case "connector":
    case "mid":
      return 0.8;
    case "approach":
    case "backsite":
      return 0.6;
    default:
      return 0; // spawn / other → raw only
  }
}

export function buildUtilityWindows(pkg: DemoPackage, assets: SpatialAssets): UtilityWindow[] {
  const out: UtilityWindow[] = [];
  for (const g of pkg.grenades ?? []) {
    const effectPosition = toVec3((g as { effectPosition?: Partial<Vec3> }).effectPosition);
    const zone = assets.zones ? zoneAt(assets.zones, effectPosition.x, effectPosition.y, effectPosition.z) : null;
    out.push({
      grenadeId: String((g as { grenadeId?: unknown }).grenadeId ?? ""),
      roundNumber: g.roundNumber,
      type: normalizeType((g as { grenade?: string }).grenade),
      throwerSteamId64: (g as { throwerSteamId64?: string | null }).throwerSteamId64 ?? null,
      throwerTeamKey: (g as { throwerTeamKey?: string | null }).throwerTeamKey ?? null,
      effectTick: (g as { effectTick?: number }).effectTick ?? (g as { throwTick?: number }).throwTick ?? 0,
      destroyTick: (g as { destroyTick?: number }).destroyTick ?? 0,
      effectPosition,
      zoneId: zone?.id ?? null,
      zoneRole: zone?.role ?? null,
      zoneBombsite: zone?.bombsite ?? null,
    });
  }
  return out;
}

export function buildOfficialUtilitySpatial(
  pkg: DemoPackage,
  assets: SpatialAssets,
  phases?: Map<number, RoundPhaseModel>,
): Map<string, OfficialUtilitySpatial> {
  const out = new Map<string, OfficialUtilitySpatial>();
  if (!assets.zones) return out; // 需 zone 标定，否则全 null
  const samples = annotatePositions(pkg, assets);
  if (samples.length === 0) return out;
  const windows = buildUtilityWindows(pkg, assets);
  const phaseModels = phases ?? inferRoundPhases(pkg);
  const tickrate = pkg.match?.tickrate ?? pkg.manifest?.tickrate ?? 64;

  // 每 (round) → 每 steamId → 排序后的 (tick, zoneId) 轨迹。
  const trackByRound = buildZoneTracks(samples);
  const teamByPlayer = new Map(pkg.players.map((p) => [p.steamId64, p.teamKey]));

  for (const w of windows) {
    if (!w.throwerSteamId64 || !w.zoneId) continue;
    const phase = phaseModels.get(w.roundNumber);
    if (phase && !isOfficialScoringPhase(phaseAtTick(phase, w.effectTick))) continue;
    const weight = roleWeight(w.zoneRole);
    if (weight <= 0) continue; // spawn/other 要道无关，raw only

    const acc = getOrInit(out, w.throwerSteamId64);
    const durationSeconds = effectiveDurationSeconds(w, tickrate);
    const tracks = trackByRound.get(w.roundNumber);
    const enemiesInZone = enemyPresenceInZone(tracks, teamByPlayer, w.throwerTeamKey, w.zoneId, w.effectTick, tickrate);

    if (w.type === "smoke") {
      // isolation：烟落要道且敌人在该 zone → 隔离秒数 × 角色权重
      if (enemiesInZone.before.size > 0) {
        acc.actualSmokeIsolationSeconds += round3(durationSeconds * weight);
      }
    } else if (FIRE_TYPES.has(w.type)) {
      // path delay：火落通行要道且敌人在场 → 延迟秒数 × 角色权重
      if (enemiesInZone.before.size > 0) {
        acc.actualIncendiaryPathDelaySeconds += round3(durationSeconds * weight);
      }
      // displacement：火前在 zone 的敌人，火后 D 秒离开 → 计逼退 × 权重
      for (const enemy of enemiesInZone.before) {
        if (enemiesInZone.leftAfter.has(enemy)) {
          acc.actualIncendiaryDisplacementEvents += round3(weight);
        }
      }
    }
  }

  for (const acc of out.values()) {
    acc.actualSmokeIsolationSeconds = round3(acc.actualSmokeIsolationSeconds);
    acc.actualIncendiaryPathDelaySeconds = round3(acc.actualIncendiaryPathDelaySeconds);
    acc.actualIncendiaryDisplacementEvents = round3(acc.actualIncendiaryDisplacementEvents);
  }
  return out;
}

interface ZoneTrack {
  ticks: number[]; // 升序
  zoneByTick: Map<number, string | null>;
}

function buildZoneTracks(samples: AnnotatedSample[]): Map<number, Map<string, ZoneTrack>> {
  const out = new Map<number, Map<string, ZoneTrack>>();
  for (const s of samples) {
    let byPlayer = out.get(s.roundNumber);
    if (!byPlayer) {
      byPlayer = new Map();
      out.set(s.roundNumber, byPlayer);
    }
    let track = byPlayer.get(s.steamId64);
    if (!track) {
      track = { ticks: [], zoneByTick: new Map() };
      byPlayer.set(s.steamId64, track);
    }
    if (!track.zoneByTick.has(s.tick)) track.ticks.push(s.tick);
    track.zoneByTick.set(s.tick, s.zoneId);
  }
  for (const byPlayer of out.values()) {
    for (const track of byPlayer.values()) track.ticks.sort((a, b) => a - b);
  }
  return out;
}

interface EnemyPresence {
  /** 火/烟生效前最后一帧在该 zone 的敌人。 */
  before: Set<string>;
  /** before 集合中、生效后 D 秒内离开该 zone 的敌人。 */
  leftAfter: Set<string>;
}

function enemyPresenceInZone(
  tracks: Map<string, ZoneTrack> | undefined,
  teamByPlayer: Map<string, string>,
  throwerTeam: string | null,
  zoneId: string,
  effectTick: number,
  tickrate: number,
): EnemyPresence {
  const before = new Set<string>();
  const leftAfter = new Set<string>();
  if (!tracks) return { before, leftAfter };
  const afterLimit = effectTick + DISPLACE_AFTER_SECONDS * tickrate;

  for (const [steamId, track] of tracks) {
    if (throwerTeam != null && teamByPlayer.get(steamId) === throwerTeam) continue; // 只看敌人
    const zoneBefore = zoneAtOrBefore(track, effectTick);
    if (zoneBefore !== zoneId) continue;
    before.add(steamId);
    // 火后 D 秒内是否离开该 zone
    const left = track.ticks.some((t) => t > effectTick && t <= afterLimit && track.zoneByTick.get(t) !== zoneId);
    if (left) leftAfter.add(steamId);
  }
  return { before, leftAfter };
}

function zoneAtOrBefore(track: ZoneTrack, tick: number): string | null {
  let best: string | null = null;
  for (const t of track.ticks) {
    if (t > tick) break;
    best = track.zoneByTick.get(t) ?? null;
  }
  return best;
}

function getOrInit(map: Map<string, OfficialUtilitySpatial>, id: string): OfficialUtilitySpatial {
  let v = map.get(id);
  if (!v) {
    v = {
      actualIncendiaryDisplacementEvents: 0,
      actualSmokeIsolationSeconds: 0,
      actualIncendiaryPathDelaySeconds: 0,
      actualSmokeProtectedCrossings: null,
      actualSmokeSightlineDenialSeconds: null,
    };
    map.set(id, v);
  }
  return v;
}

function normalizeType(g: string | undefined): GrenadeType {
  switch (g) {
    case "smoke":
    case "molotov":
    case "incendiary":
    case "flash":
    case "he":
    case "decoy":
      return g;
    default:
      return "unknown";
  }
}

function toVec3(p: Partial<Vec3> | undefined): Vec3 {
  return { x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0 };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
