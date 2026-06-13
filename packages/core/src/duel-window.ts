import type { DemoPackage, DuelWindow, PackageGrenade } from "@cs2dak/contract";
import { decodeDelta } from "@cs2dak/contract";
import { staticLineOfSight, type TriangleBvh, type Vec3 } from "@cs2dak/maps";

/**
 * duels.json 满 tick 窗口的可见性原语。
 *
 * 围绕 kill/damage 锚点的连续逐 tick 流（x/y/z/yaw/pitch/hp/flash）让我们能在
 * 交火窗口内严格计算「敌人何时进入有效视野」「开枪前是否完成停稳」「预瞄误差」，
 * 而不必依赖全局 8Hz replay 或静态 LOS 退化口径。该模块只解码 + 几何判定，不做指标聚合。
 */

/** 眼睛相对脚底坐标的 z 偏移（游戏单位）。LOS 与视野锥都从眼睛发射。 */
export const EYE_HEIGHT = 64;
/** 目标取胸口高度，略低于眼睛，减少擦边遮挡误判。 */
export const TARGET_HEIGHT = 56;
/** 有效视野锥半角（度）。CS2 FOV 约 90°，取 40° 半角作为「能交火/已捕获目标」的判定锥。 */
export const VIEW_CONE_HALF_DEGREES = 40;
/** CS2 烟雾半径约 144 游戏单位，用于射线-球遮挡判定。 */
export const SMOKE_RADIUS = 144;

const SMOKE_TYPES = new Set(["smoke", "smokegrenade"]);

export interface DecodedTrack {
  playerIndex: number;
  x: number[];
  y: number[];
  z: number[];
  yaw: number[];
  pitch: number[];
  hp: number[];
  flash: number[];
}

export interface DuelWindowView {
  window: DuelWindow;
  startTick: number;
  tickStep: number;
  frameCount: number;
  tracks: Map<number, DecodedTrack>;
}

const viewCache = new WeakMap<DuelWindow, DuelWindowView>();

function decodeTrack(window: DuelWindow, track: DuelWindow["players"][number], coordScale: number, angleScale: number): DecodedTrack {
  const scale = (arr: number[], by: number) => arr.map((value) => value / by);
  return {
    playerIndex: track.playerIndex,
    x: scale(decodeDelta(track.x), coordScale),
    y: scale(decodeDelta(track.y), coordScale),
    z: scale(decodeDelta(track.z), coordScale),
    yaw: scale(decodeDelta(track.yaw), angleScale),
    pitch: scale(decodeDelta(track.pitch), angleScale),
    hp: [...track.hp],
    flash: [...track.flash]
  };
}

/** 解码一个 duel 窗口的全部玩家轨迹（按 pkg 内 window 实例记忆化）。 */
export function decodeDuelWindow(pkg: DemoPackage, window: DuelWindow): DuelWindowView {
  const cached = viewCache.get(window);
  if (cached) return cached;
  const coordScale = pkg.duels?.meta.coordScale ?? 1;
  const angleScale = pkg.duels?.meta.angleScale ?? 10;
  const tracks = new Map<number, DecodedTrack>();
  for (const track of window.players) tracks.set(track.playerIndex, decodeTrack(window, track, coordScale, angleScale));
  const view: DuelWindowView = {
    window,
    startTick: window.startTick,
    tickStep: window.tickStep,
    frameCount: window.frameCount,
    tracks
  };
  viewCache.set(window, view);
  return view;
}

/** 找到覆盖 (round, tick) 的 duel 窗口；窗口同回合内已合并，故至多一个。 */
export function findWindowCovering(pkg: DemoPackage, roundNumber: number, tick: number): DuelWindow | null {
  if (!pkg.duels) return null;
  return pkg.duels.windows.find((window) =>
    window.roundNumber === roundNumber &&
    window.startTick <= tick &&
    window.startTick + window.tickStep * Math.max(0, window.frameCount - 1) >= tick
  ) ?? null;
}

/** tick → 最近帧索引（夹在 [0, frameCount-1]）。 */
export function frameIndexForTick(view: DuelWindowView, tick: number): number {
  const raw = Math.round((tick - view.startTick) / view.tickStep);
  return Math.max(0, Math.min(view.frameCount - 1, raw));
}

export function tickAtFrame(view: DuelWindowView, frame: number): number {
  return view.startTick + frame * view.tickStep;
}

function forwardVector(yawDeg: number, pitchDeg: number): Vec3 {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cosPitch = Math.cos(pitch);
  return { x: cosPitch * Math.cos(yaw), y: cosPitch * Math.sin(yaw), z: -Math.sin(pitch) };
}

function normalize(v: Vec3): Vec3 | null {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-6) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** 准星视线方向与目标方向的三维夹角（度）。yaw+pitch 都参与。null = 重合/无法定义。 */
export function aimErrorDegrees(yawDeg: number, pitchDeg: number, eye: Vec3, target: Vec3): number | null {
  const aim = forwardVector(yawDeg, pitchDeg);
  const toTarget = normalize({ x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z });
  if (!toTarget) return null;
  const cos = Math.max(-1, Math.min(1, dot(aim, toTarget)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** 目标是否落在视野锥内（半角 VIEW_CONE_HALF_DEGREES）。 */
function insideViewCone(yawDeg: number, pitchDeg: number, eye: Vec3, target: Vec3): boolean {
  const err = aimErrorDegrees(yawDeg, pitchDeg, eye, target);
  return err != null && err <= VIEW_CONE_HALF_DEGREES;
}

function pointToSegmentDistance(point: Vec3, a: Vec3, b: Vec3): number {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ap = { x: point.x - a.x, y: point.y - a.y, z: point.z - a.z };
  const denom = dot(ab, ab);
  const t = denom < 1e-6 ? 0 : Math.max(0, Math.min(1, dot(ap, ab) / denom));
  const closest = { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
  return Math.hypot(point.x - closest.x, point.y - closest.y, point.z - closest.z);
}

/** 在 tick 时刻，是否有生效中的烟雾遮挡 from→to 视线。 */
export function smokeBlocksRay(grenades: PackageGrenade[] | undefined, roundNumber: number, tick: number, from: Vec3, to: Vec3): boolean {
  if (!grenades || grenades.length === 0) return false;
  for (const grenade of grenades) {
    if (grenade.roundNumber !== roundNumber) continue;
    if (!SMOKE_TYPES.has(grenade.grenade)) continue;
    const active = grenade.effectTick <= tick && (grenade.destroyTick == null || tick <= grenade.destroyTick);
    if (!active) continue;
    if (pointToSegmentDistance(grenade.effectPosition, from, to) <= SMOKE_RADIUS) return true;
  }
  return false;
}

export interface VisibilityContext {
  pkg: DemoPackage;
  visibility?: TriangleBvh | null;
}

/**
 * attacker 在 frame 是否对 victim 有「有效可见」：双方存活、attacker 未被闪、
 * victim 落在 attacker 视野锥内、静态 LOS 通透（有 .tri 时）、且无烟雾遮挡。
 * 缺 .tri 时跳过 LOS（只保留 hp/flash/锥/烟），由调用方决定是否信任。
 */
export function isVisibleAt(
  ctx: VisibilityContext,
  view: DuelWindowView,
  attackerIndex: number,
  victimIndex: number,
  frame: number
): boolean {
  const attacker = view.tracks.get(attackerIndex);
  const victim = view.tracks.get(victimIndex);
  if (!attacker || !victim) return false;
  if ((attacker.hp[frame] ?? 0) <= 0 || (victim.hp[frame] ?? 0) <= 0) return false;
  if ((attacker.flash[frame] ?? 0) > 0) return false;
  const eye: Vec3 = { x: attacker.x[frame] ?? 0, y: attacker.y[frame] ?? 0, z: (attacker.z[frame] ?? 0) + EYE_HEIGHT };
  const target: Vec3 = { x: victim.x[frame] ?? 0, y: victim.y[frame] ?? 0, z: (victim.z[frame] ?? 0) + TARGET_HEIGHT };
  if (!insideViewCone(attacker.yaw[frame] ?? 0, attacker.pitch[frame] ?? 0, eye, target)) return false;
  if (ctx.visibility && !staticLineOfSight(ctx.visibility, eye, target)) return false;
  const tick = tickAtFrame(view, frame);
  if (smokeBlocksRay(ctx.pkg.grenades, view.window.roundNumber, tick, eye, target)) return false;
  return true;
}

/**
 * 从 fromFrame 向前回溯，返回「当前连续可见段」的起始帧。
 * - fromFrame 本身不可见 → null（prefire / 未捕获目标，调用方判 prefire）。
 * - 可见段一直延伸到窗口起点（frame 0）→ 返回 0，但调用方应视为左截断（窗口外早已可见）。
 */
export function visibleOnsetFrame(
  ctx: VisibilityContext,
  view: DuelWindowView,
  attackerIndex: number,
  victimIndex: number,
  fromFrame: number
): number | null {
  if (!isVisibleAt(ctx, view, attackerIndex, victimIndex, fromFrame)) return null;
  let onset = fromFrame;
  while (onset > 0 && isVisibleAt(ctx, view, attackerIndex, victimIndex, onset - 1)) onset -= 1;
  return onset;
}
