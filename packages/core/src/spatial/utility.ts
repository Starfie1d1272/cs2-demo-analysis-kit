/**
 * Official UtilitySpatial actual-effect 派生（严格重建 SP3 v2）。设计见 rr-model.md §3.4、§14、§18。
 *
 * 解锁前提：zone 多边形标定（4/7 图）+ nav 拓扑（7 图）+ tri-BVH 静态视线（按需，分析侧）。
 *
 * 手雷归属（doc §18）：effectPosition → zoneAt（非「最近 player」proxy）。
 *
 * 5 项 actual-effect：
 * - actualSmokeIsolationSeconds      ：nav 绕路代价（屏蔽烟覆盖区后 enemy→site 多走多远）× 时长。
 * - actualSmokeSightlineDenialSeconds ：tri-BVH 判定烟切断 enemy→site 的**静态可见**枪线（需 visibility）。
 * - actualSmokeProtectedCrossings     ：队友穿越时被烟挡住敌方原本可见的枪线（需 visibility）。
 * - actualIncendiaryPathDelaySeconds  ：火落通行要道且敌人在场 × 燃烧时长 × 角色权重。
 * - actualIncendiaryDisplacementEvents：敌人火前在区、火后离开或掉血（1Hz 采样放宽窗口）。
 *
 * 无 visibility（production 不加载 207MB tri）→ 两项 LOS 指标发 null。
 *
 * ⚠️ 冻结状态（2026-06-07，SP3 v2 收尾）：本实现保持 **shadow**（不进 RR 评分），不再继续打磨。
 * 实测净 ΔRR 极小（mean 0.011 / p90 0.025 / 无人 >0.05），远小于 Trade 闭环（mean 0.033），
 * 正式进 RR 价值有限。两处「零值」为模型/启发式固有缺陷，**非 bug，不在此修**：
 *   - isolation（①）：nav 绕路假设「烟挡移动」，但烟只挡视线、人能走过去。开阔图（mirage）平行路多、
 *     144 半径封不住唯一路径 → detour 恒 0；仅 choke 图（ancient/inferno）出值。是 nav 绕路模型的固有弱点。
 *   - sightlineDenial（②）：objective 取 site 质心→最近 nav 区的 3D 点，dust2 该点常被墙挡 →
 *     staticLOS 本就 false → 无枪线可封 → 偏低。是 objective 选点启发式脆弱，非视线判定错。
 * vision-based 重构（isolation 改判「烟切断敌人对目标区的视线安全」，本质并入 sightlineDenial）
 * 推迟到权重 ramp 阶段三——职业样本到位、有校准数据后，再连同 sightlineDenial 一起重设计。
 * 见 rr-model.md §3.4 / §3.6。
 */
import type { DemoPackage } from "@cs2dak/contract";
import type { TriangleBvh, Vec3, ZoneRole } from "@cs2dak/maps";
import { staticLineOfSight, zoneAt } from "@cs2dak/maps";
import { type SpatialAssets, type AnnotatedSample, annotatePositions } from "./annotate.js";
import { inferRoundPhases, phaseAtTick } from "./phase.js";
import { isOfficialScoringPhase, type RoundPhaseModel } from "./types.js";
import {
  areasWithinRadius,
  buildNavIndex,
  nearestAreaId,
  polygonCentroid,
  segmentSphereIntersects,
  smokeDetourCost,
  type NavIndex,
  SMOKE_RADIUS,
} from "./utility-geometry.js";

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
  zoneId: string | null;
  zoneRole: ZoneRole | null;
  zoneBombsite: "a" | "b" | null;
}

export interface OfficialUtilitySpatial {
  actualIncendiaryDisplacementEvents: number;
  actualSmokeIsolationSeconds: number;
  actualIncendiaryPathDelaySeconds: number;
  /** 需 tri-BVH（visibility）；缺失为 null（不可观测，非 0）。 */
  actualSmokeProtectedCrossings: number | null;
  actualSmokeSightlineDenialSeconds: number | null;
}

const DISPLACE_BEFORE_SECONDS = 2; // 火前回看
const DISPLACE_AFTER_SECONDS = 4; // 火后回看（1Hz 采样放宽）
const FIRE_TYPES: ReadonlySet<GrenadeType> = new Set(["molotov", "incendiary"]);
const FIRE_BURN_SECONDS = 7; // 火焰缺 destroyTick 时兜底
const SMOKE_DURATION_SECONDS = 18;
const DETOUR_FULL_UNITS = 700; // nav 绕路 ≥ 此值 → 隔离系数 1.0
const SIGHTLINE_PER_ENEMY = 0.5; // 每条被封枪线的重要性

function effectiveDurationSeconds(w: UtilityWindow, tickrate: number): number {
  if (w.destroyTick > w.effectTick) return (w.destroyTick - w.effectTick) / tickrate;
  if (FIRE_TYPES.has(w.type)) return FIRE_BURN_SECONDS;
  if (w.type === "smoke") return SMOKE_DURATION_SECONDS;
  return 0;
}

function roleWeight(role: ZoneRole | null): number {
  switch (role) {
    case "site": return 1.0;
    case "lane": case "connector": case "mid": return 0.8;
    case "approach": case "backsite": return 0.6;
    default: return 0;
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

interface SiteArea {
  bombsite: "a" | "b" | null;
  areaId: number;
  point: Vec3; // nav 质心（含 z），供 LOS/绕路使用
}

interface Sample {
  tick: number;
  pos: Vec3;
  zoneId: string | null;
  navAreaId: number | null;
  health: number;
  alive: boolean;
}

export function buildOfficialUtilitySpatial(
  pkg: DemoPackage,
  assets: SpatialAssets,
  phases?: Map<number, RoundPhaseModel>,
): Map<string, OfficialUtilitySpatial> {
  const out = new Map<string, OfficialUtilitySpatial>();
  if (!assets.zones) return out;
  const samples = annotatePositions(pkg, assets);
  if (samples.length === 0) return out;

  const windows = buildUtilityWindows(pkg, assets);
  const phaseModels = phases ?? inferRoundPhases(pkg);
  const tickrate = pkg.match?.tickrate ?? pkg.manifest?.tickrate ?? 64;
  const teamByPlayer = new Map(pkg.players.map((p) => [p.steamId64, p.teamKey]));
  const navIndex = assets.nav ? buildNavIndex(assets.nav) : null;
  const siteAreas = navIndex ? computeSiteAreas(assets, navIndex) : [];
  const bvh = assets.visibility;
  const tracks = buildTracks(samples); // round → steamId → Sample[]（升序）

  for (const w of windows) {
    if (!w.throwerSteamId64 || !w.zoneId) continue;
    const phase = phaseModels.get(w.roundNumber);
    if (phase && !isOfficialScoringPhase(phaseAtTick(phase, w.effectTick))) continue;
    const weight = roleWeight(w.zoneRole);
    if (weight <= 0) continue;

    const acc = getOrInit(out, w.throwerSteamId64, bvh != null);
    const durationSeconds = effectiveDurationSeconds(w, tickrate);
    const roundTracks = tracks.get(w.roundNumber);
    const enemies = enemySamplesAt(roundTracks, teamByPlayer, w.throwerTeamKey, w.effectTick);
    const hasTeammate = teammatePresent(roundTracks, teamByPlayer, w.throwerTeamKey, w.effectTick);

    if (w.type === "smoke") {
      const objective = nearestSite(siteAreas, w.effectPosition, navIndex);
      // ① 隔离：nav 绕路代价（拓扑敏感 — 开阔图恒 0，已知模型缺陷，见文件头冻结说明，勿当 bug 修）
      if (navIndex && objective && enemies.length > 0) {
        const blocked = areasWithinRadius(navIndex, w.effectPosition, SMOKE_RADIUS);
        const enemyArea = nearestAreaId(navIndex, clusterCentroid(enemies));
        if (enemyArea != null) {
          const detour = smokeDetourCost(navIndex, enemyArea, objective.areaId, blocked);
          const isoFactor = Math.min(1, detour / DETOUR_FULL_UNITS);
          if (isoFactor > 0) acc.actualSmokeIsolationSeconds += durationSeconds * isoFactor * weight;
        }
      }
      // ② 视线封锁：tri-BVH 判定烟切断 enemy→site 的静态可见枪线
      if (bvh && objective && hasTeammate) {
        let deniedEnemies = 0;
        for (const e of enemies) {
          if (!staticLineOfSight(bvh, e.pos, objective.point)) continue; // 静态本就不可见 → 烟无功
          if (segmentSphereIntersects(e.pos, objective.point, w.effectPosition, SMOKE_RADIUS)) deniedEnemies += 1;
        }
        if (deniedEnemies > 0) {
          acc.actualSmokeSightlineDenialSeconds =
            (acc.actualSmokeSightlineDenialSeconds ?? 0) + durationSeconds * Math.min(1, deniedEnemies * SIGHTLINE_PER_ENEMY) * weight;
        }
      }
    } else if (FIRE_TYPES.has(w.type)) {
      // ③ 路径延迟：火落要道且敌人在场
      if (enemies.length > 0) acc.actualIncendiaryPathDelaySeconds += durationSeconds * weight;
      // ④ 逼退：敌人火前在区、火后离开或掉血（放宽 1Hz 采样窗口）
      acc.actualIncendiaryDisplacementEvents += displacementCount(roundTracks, teamByPlayer, w, tickrate) * weight;
    }
  }

  // ⑤ 掩护穿越：队友穿越时被烟挡住敌方原本可见枪线（独立 pass，需 bvh）
  if (bvh) {
    for (const w of windows) {
      if (w.type !== "smoke" || !w.throwerSteamId64 || !w.zoneId) continue;
      const phase = phaseModels.get(w.roundNumber);
      if (phase && !isOfficialScoringPhase(phaseAtTick(phase, w.effectTick))) continue;
      if (roleWeight(w.zoneRole) <= 0) continue;
      const acc = getOrInit(out, w.throwerSteamId64, true);
      acc.actualSmokeProtectedCrossings =
        (acc.actualSmokeProtectedCrossings ?? 0) + protectedCrossings(tracks.get(w.roundNumber), teamByPlayer, w, bvh, tickrate);
    }
  }

  for (const acc of out.values()) round3InPlace(acc);
  return out;
}

// —— 内部辅助 ——

function computeSiteAreas(assets: SpatialAssets, navIndex: NavIndex): SiteArea[] {
  const out: SiteArea[] = [];
  for (const z of assets.zones?.zones ?? []) {
    if (z.role !== "site") continue;
    const c = polygonCentroid(z);
    // objective 选点启发式：site 质心 z=0 → 最近 nav 区。dust2 上该点常被墙挡，使 ② 视线封锁偏低。
    // 已知缺陷（见文件头冻结说明），vision-based 重构时一并改。
    const point3: Vec3 = { x: c.x, y: c.y, z: 0 };
    const areaId = nearestAreaId(navIndex, point3);
    if (areaId == null) continue;
    const centroid = navIndex.byId.get(areaId)!.centroid;
    out.push({ bombsite: z.bombsite ?? null, areaId, point: centroid });
  }
  return out;
}

function nearestSite(sites: SiteArea[], from: Vec3, navIndex: NavIndex | null): SiteArea | null {
  if (sites.length === 0 || !navIndex) return null;
  let best: SiteArea | null = null;
  let bestD = Infinity;
  for (const s of sites) {
    const dx = s.point.x - from.x, dy = s.point.y - from.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function buildTracks(samples: AnnotatedSample[]): Map<number, Map<string, Sample[]>> {
  const out = new Map<number, Map<string, Sample[]>>();
  for (const s of samples) {
    let byPlayer = out.get(s.roundNumber);
    if (!byPlayer) { byPlayer = new Map(); out.set(s.roundNumber, byPlayer); }
    const arr = byPlayer.get(s.steamId64) ?? [];
    arr.push({ tick: s.tick, pos: s.position, zoneId: s.zoneId, navAreaId: s.navAreaId, health: s.health, alive: s.alive });
    byPlayer.set(s.steamId64, arr);
  }
  for (const byPlayer of out.values()) for (const arr of byPlayer.values()) arr.sort((a, b) => a.tick - b.tick);
  return out;
}

function enemySamplesAt(
  roundTracks: Map<string, Sample[]> | undefined,
  teamByPlayer: Map<string, string>,
  throwerTeam: string | null,
  tick: number,
): Sample[] {
  const out: Sample[] = [];
  if (!roundTracks) return out;
  for (const [id, arr] of roundTracks) {
    if (throwerTeam != null && teamByPlayer.get(id) === throwerTeam) continue;
    const s = sampleAtOrBefore(arr, tick);
    if (s && s.alive) out.push(s);
  }
  return out;
}

function teammatePresent(
  roundTracks: Map<string, Sample[]> | undefined,
  teamByPlayer: Map<string, string>,
  throwerTeam: string | null,
  tick: number,
): boolean {
  if (!roundTracks || throwerTeam == null) return false;
  for (const [id, arr] of roundTracks) {
    if (teamByPlayer.get(id) !== throwerTeam) continue;
    const s = sampleAtOrBefore(arr, tick);
    if (s && s.alive) return true;
  }
  return false;
}

/** 火焰逼退：敌人在 [eff-2s,eff] 处于火 zone，且 [eff,eff+4s] 内离开该 zone 或掉血。 */
function displacementCount(
  roundTracks: Map<string, Sample[]> | undefined,
  teamByPlayer: Map<string, string>,
  w: UtilityWindow,
  tickrate: number,
): number {
  if (!roundTracks || !w.zoneId) return 0;
  const beforeLo = w.effectTick - DISPLACE_BEFORE_SECONDS * tickrate;
  const afterHi = w.effectTick + DISPLACE_AFTER_SECONDS * tickrate;
  let count = 0;
  for (const [id, arr] of roundTracks) {
    if (w.throwerTeamKey != null && teamByPlayer.get(id) === w.throwerTeamKey) continue;
    const inZoneBefore = arr.some((s) => s.tick >= beforeLo && s.tick <= w.effectTick && s.zoneId === w.zoneId);
    if (!inZoneBefore) continue;
    const hpBefore = lastBefore(arr, w.effectTick)?.health ?? 100;
    const displaced = arr.some(
      (s) => s.tick > w.effectTick && s.tick <= afterHi && (s.zoneId !== w.zoneId || s.health < hpBefore),
    );
    if (displaced) count += 1;
  }
  return count;
}

/** 掩护穿越：队友在窗口内换 zone（穿越），且某敌人本可静态看到其穿越位、但被烟挡住。 */
function protectedCrossings(
  roundTracks: Map<string, Sample[]> | undefined,
  teamByPlayer: Map<string, string>,
  w: UtilityWindow,
  bvh: TriangleBvh,
  tickrate: number,
): number {
  if (!roundTracks) return 0;
  const lo = w.effectTick;
  const hi = w.destroyTick > w.effectTick ? w.destroyTick : w.effectTick + SMOKE_DURATION_SECONDS * tickrate;
  let count = 0;
  for (const [id, arr] of roundTracks) {
    if (w.throwerTeamKey != null && teamByPlayer.get(id) !== w.throwerTeamKey) continue; // 只看队友
    const inWin = arr.filter((s) => s.tick >= lo && s.tick <= hi && s.alive);
    if (inWin.length < 2) continue;
    const crossed = inWin.some((s, i) => i > 0 && s.zoneId !== inWin[i - 1]!.zoneId);
    if (!crossed) continue;
    const mid = inWin[Math.floor(inWin.length / 2)]!;
    // 某敌人本可静态看到 mid，但烟挡住
    let protectedHere = false;
    for (const [eid, earr] of roundTracks) {
      if (teamByPlayer.get(eid) === w.throwerTeamKey) continue;
      const e = sampleAtOrBefore(earr, mid.tick);
      if (!e || !e.alive) continue;
      if (staticLineOfSight(bvh, e.pos, mid.pos) && segmentSphereIntersects(e.pos, mid.pos, w.effectPosition, SMOKE_RADIUS)) {
        protectedHere = true;
        break;
      }
    }
    if (protectedHere) count += 1;
  }
  return count;
}

function clusterCentroid(samples: Sample[]): Vec3 {
  let x = 0, y = 0, z = 0;
  for (const s of samples) { x += s.pos.x; y += s.pos.y; z += s.pos.z; }
  const n = Math.max(1, samples.length);
  return { x: x / n, y: y / n, z: z / n };
}

function sampleAtOrBefore(arr: Sample[], tick: number): Sample | null {
  let best: Sample | null = null;
  for (const s of arr) { if (s.tick > tick) break; best = s; }
  return best;
}

function lastBefore(arr: Sample[], tick: number): Sample | null {
  return sampleAtOrBefore(arr, tick);
}

function getOrInit(map: Map<string, OfficialUtilitySpatial>, id: string, losAvailable: boolean): OfficialUtilitySpatial {
  let v = map.get(id);
  if (!v) {
    v = {
      actualIncendiaryDisplacementEvents: 0,
      actualSmokeIsolationSeconds: 0,
      actualIncendiaryPathDelaySeconds: 0,
      actualSmokeProtectedCrossings: losAvailable ? 0 : null,
      actualSmokeSightlineDenialSeconds: losAvailable ? 0 : null,
    };
    map.set(id, v);
  }
  return v;
}

function round3InPlace(acc: OfficialUtilitySpatial) {
  acc.actualIncendiaryDisplacementEvents = round3(acc.actualIncendiaryDisplacementEvents);
  acc.actualSmokeIsolationSeconds = round3(acc.actualSmokeIsolationSeconds);
  acc.actualIncendiaryPathDelaySeconds = round3(acc.actualIncendiaryPathDelaySeconds);
  if (acc.actualSmokeProtectedCrossings != null) acc.actualSmokeProtectedCrossings = round3(acc.actualSmokeProtectedCrossings);
  if (acc.actualSmokeSightlineDenialSeconds != null) acc.actualSmokeSightlineDenialSeconds = round3(acc.actualSmokeSightlineDenialSeconds);
}

function normalizeType(g: string | undefined): GrenadeType {
  switch (g) {
    case "smoke": case "molotov": case "incendiary": case "flash": case "he": case "decoy": return g;
    default: return "unknown";
  }
}

function toVec3(p: Partial<Vec3> | undefined): Vec3 {
  return { x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0 };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
