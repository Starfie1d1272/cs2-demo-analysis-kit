import type { DemoPackage, PackageDamage } from "@cs2dak/contract";
import { decodeDelta } from "@cs2dak/contract";
import { staticLineOfSight, type TriangleBvh, type Vec3 } from "@cs2dak/maps";
import { buildDuelsSignals, type DuelRecord } from "./duels.js";
import {
  EYE_HEIGHT,
  TARGET_HEIGHT,
  VIEW_CONE_HALF_DEGREES,
  aimErrorDegrees,
  decodeDuelWindow,
  findWindowCovering,
  frameIndexForTick,
  isVisibleAt,
  smokeBlocksRay,
  tickAtFrame,
  visibleOnsetFrame,
  type VisibilityContext
} from "./duel-window.js";
import { createResolverFromPackage, type PlayerResolver } from "./resolve.js";
import { normalizeWeapon, round } from "./utils.js";

const BURST_GAP_SECONDS = 0.25;
const PRE_MOVE_START_SECONDS = 0.2; // 开枪前 200ms
const PRE_MOVE_END_SECONDS = 0.05; // 到开枪前 50ms（避开停稳瞬间）
const DAMAGE_MATCH_TICKS = 1;
/** 视为「开枪前确实在移动」的速度阈值（游戏单位/s）。低于此认为本就站定，不构成急停尝试。 */
const MOVEMENT_THRESHOLD = 100;
/** 反应时间上限：可见超过 1s 才开枪更像持续架枪/跟踪，不计入纯反应。 */
const MAX_REACTION_MS = 1000;
/** 预瞄误差「命中」阈值（度）。 */
const PREAIM_WITHIN_DEGREES = 5;
/** 急停「停稳」要求：开枪时速度需低于该比例的武器站立精准速度。 */

export interface BurstLengthBuckets {
  single: number;
  short: number;
  medium: number;
  long: number;
}

export interface WeaponCounterStrafeThreshold {
  weapon: string;
  maxSpeed: number;
  source: "weapon" | "class" | "fallback";
}

/** 命中/尝试型指标：value 为百分比（successes/attempts×100），attempts=0 时 value=null。 */
export interface RateSample {
  value: number | null;
  successes: number;
  attempts: number;
}

/** 中位型指标：value 为中位数，sampleSize 为有效样本数。 */
export interface MedianSample {
  value: number | null;
  sampleSize: number;
}

/** 预瞄误差：中位夹角 + ≤5° 命中比例。 */
export interface PreaimSample {
  medianDegrees: number | null;
  withinFiveRatio: number | null;
  withinFiveCount: number;
  sampleSize: number;
}

export interface MechanicsMetricSet {
  /** 首发命中率：combat burst 第一发命中 / combat burst 数。 */
  firstShotHit: RateSample;
  /** 扫射命中率：自动武器、burst≥5 的第 4 发起命中 / 总数；非自动武器为 null。 */
  sprayHit: RateSample | null;
  /** 急停成功率（移动后停稳口径）：开枪前在移动且开枪时已停稳 / 开枪前在移动。 */
  counterStrafe: RateSample;
  /** one tap 率：满血单发终结 / 满血无第三方击杀。 */
  oneTap: RateSample;
  /** TTK：lethal burst 第一枪到击杀的中位耗时（ms）。 */
  ttk: MedianSample;
  /** 反应时间：敌人进入有效视野到首发开枪的中位耗时（ms）。 */
  reaction: MedianSample;
  /** 预瞄误差：捕获前准星与目标的三维夹角。 */
  preaim: PreaimSample;
  // ── 射击风格（非核心枪法排行）──
  medianShotIntervalMs: number | null;
  medianBurstIntervalMs: number | null;
  burstLengthBuckets: BurstLengthBuckets;
  firingPatternRatio: { tap: number; burst: number; spray: number };
}

export interface PlayerMechanicsFact extends MechanicsMetricSet {
  steamId64: string;
  playerName: string;
  teamKey: string;
  weapon: string;
  burstCount: number;
  killCount: number;
  cleanKillCount: number;
  headshotKills: number;
  cleanHeadshotKills: number;
  shotCount: number;
  counterStrafeThreshold: WeaponCounterStrafeThreshold;
  // ── 跨场聚合用原始样本（presentation 按 steamId64+weapon concat 后重算中位/比例）──
  ttkSamplesMs: number[];
  reactionSamplesMs: number[];
  preaimSamplesDeg: number[];
}

export interface MechanicsSignals {
  version: "cs2-demo-analysis-kit/mechanics-signals-0.2";
  tickrate: number;
  burstGapSeconds: number;
  rows: PlayerMechanicsFact[];
  visibilityAvailable: boolean;
}

export interface MechanicsSignalsOptions {
  visibility?: TriangleBvh | null;
}

interface FlatShot {
  roundNumber: number;
  playerIndex: number;
  tick: number;
  weapon: string;
  vx: number;
  vy: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

const WEAPON_ACCURATE_SPEED: Record<string, number> = {
  ak47: 73,
  m4a1: 76,
  m4a4: 76,
  m4a1_silencer: 76,
  awp: 68,
  ssg08: 78,
  deagle: 78,
  revolver: 66
};

const WEAPON_CLASS_SPEED: Array<{ test: (weapon: string) => boolean; maxSpeed: number }> = [
  { test: (weapon) => ["glock", "usp", "usp_silencer", "hkp2000", "p2000", "p250", "fiveseven", "tec9", "cz75a", "elite"].includes(weapon), maxSpeed: 80 },
  { test: (weapon) => ["mp9", "mac10", "bizon", "ump45", "p90", "mp7", "mp5sd"].includes(weapon), maxSpeed: 85 },
  { test: (weapon) => ["nova", "xm1014", "mag7", "sawedoff"].includes(weapon), maxSpeed: 75 },
  { test: (weapon) => ["m249", "negev"].includes(weapon), maxSpeed: 60 }
];

const FIREARM_WEAPONS = new Set([
  "ak47", "m4a1", "m4a4", "m4a1_silencer", "aug", "sg556", "sg553", "famas", "galilar", "galil",
  "awp", "ssg08", "scar20", "g3sg1", "deagle", "revolver", "glock", "usp_silencer", "usp",
  "hkp2000", "p2000", "p250", "fiveseven", "tec9", "cz75a", "cz75", "elite", "mp9", "mp7",
  "mp5sd", "ump45", "p90", "bizon", "mac10", "nova", "xm1014", "mag7", "sawedoff", "m249", "negev"
]);

/** 全自动连发武器（步枪 / 冲锋枪 / 机枪）。只有这些武器统计扫射命中率。 */
const AUTO_WEAPONS = new Set([
  "ak47", "m4a1", "m4a4", "m4a1_silencer", "aug", "sg556", "sg553", "famas", "galilar", "galil",
  "mp9", "mp7", "mp5sd", "ump45", "p90", "bizon", "mac10", "m249", "negev"
]);

const ONE_TAP_CAPABLE_WEAPONS = new Set([
  "ak47", "sg556", "sg553",
  "deagle", "revolver",
  "awp", "ssg08", "scar20", "g3sg1"
]);

function tickrateOf(pkg: DemoPackage): number {
  return pkg.match.tickrate || pkg.manifest.tickrate || 64;
}

function ticks(seconds: number, tickrate: number): number {
  return Math.round(seconds * tickrate);
}

function percent(successes: number, attempts: number): number | null {
  return attempts > 0 ? round((successes / attempts) * 100, 1) : null;
}

function rate(successes: number, attempts: number): RateSample {
  return { value: percent(successes, attempts), successes, attempts };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? round((sorted[mid - 1]! + sorted[mid]!) / 2, 1) : round(sorted[mid]!, 1);
}

function planarSpeed(vx: number, vy: number): number {
  return Math.hypot(vx, vy);
}

export function counterStrafeThresholdForWeapon(weaponName: string): WeaponCounterStrafeThreshold {
  const weapon = normalizeWeapon(weaponName);
  const exact = WEAPON_ACCURATE_SPEED[weapon];
  if (exact != null) return { weapon, maxSpeed: exact, source: "weapon" };
  const klass = WEAPON_CLASS_SPEED.find((row) => row.test(weapon));
  if (klass) return { weapon, maxSpeed: klass.maxSpeed, source: "class" };
  return { weapon, maxSpeed: 80, source: "fallback" };
}

function isFirearmWeapon(weapon: string): boolean {
  return FIREARM_WEAPONS.has(normalizeWeapon(weapon));
}

function flattenShots(pkg: DemoPackage): FlatShot[] {
  const shots = pkg.shots;
  if (!shots) return [];
  const angleScale = shots.meta.angleScale || 10;
  const coordScale = shots.meta.coordScale || 1;
  const out: FlatShot[] = [];
  for (const track of shots.tracks) {
    const shotTicks = decodeDelta(track.tick);
    const x = decodeDelta(track.x);
    const y = decodeDelta(track.y);
    const z = decodeDelta(track.z);
    const yaw = decodeDelta(track.yaw);
    const pitch = decodeDelta(track.pitch);
    for (let i = 0; i < shotTicks.length; i++) {
      const weaponIdx = track.weapon[i] ?? -1;
      const weapon = normalizeWeapon(weaponIdx >= 0 ? (shots.weaponDict[weaponIdx] ?? "") : "");
      if (!isFirearmWeapon(weapon)) continue;
      out.push({
        roundNumber: track.roundNumber,
        playerIndex: track.playerIndex,
        tick: shotTicks[i]!,
        weapon,
        vx: track.vx[i] ?? 0,
        vy: track.vy[i] ?? 0,
        x: (x[i] ?? 0) / coordScale,
        y: (y[i] ?? 0) / coordScale,
        z: (z[i] ?? 0) / coordScale,
        yaw: (yaw[i] ?? 0) / angleScale,
        pitch: (pitch[i] ?? 0) / angleScale
      });
    }
  }
  return out.sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick);
}

function splitBursts(shots: FlatShot[], tickrate: number): FlatShot[][] {
  const maxGap = ticks(BURST_GAP_SECONDS, tickrate);
  const bursts: FlatShot[][] = [];
  for (const shot of [...shots].sort((a, b) => a.tick - b.tick)) {
    const current = bursts[bursts.length - 1];
    if (!current || shot.tick - current[current.length - 1]!.tick > maxGap) bursts.push([shot]);
    else current.push(shot);
  }
  return bursts;
}

function bucketBursts(bursts: FlatShot[][]): BurstLengthBuckets {
  const buckets: BurstLengthBuckets = { single: 0, short: 0, medium: 0, long: 0 };
  for (const burst of bursts) {
    if (burst.length === 1) buckets.single += 1;
    else if (burst.length <= 3) buckets.short += 1;
    else if (burst.length <= 7) buckets.medium += 1;
    else buckets.long += 1;
  }
  return buckets;
}

function hasDamageMatch(damages: PackageDamage[], shot: FlatShot): boolean {
  return damages.some((damage) =>
    damage.roundNumber === shot.roundNumber &&
    damage.attackerIndex === shot.playerIndex &&
    normalizeWeapon(damage.weapon) === shot.weapon &&
    Math.abs(damage.tick - shot.tick) <= DAMAGE_MATCH_TICKS
  );
}

/** 在开枪 tick，射手视野锥 + LOS + 无烟内是否存在一名活着的敌人（用 shots.json 精确视角）。 */
function firstShotSeesEnemy(ctx: VisibilityContext, resolver: PlayerResolver, shot: FlatShot): boolean {
  const window = findWindowCovering(ctx.pkg, shot.roundNumber, shot.tick);
  if (!window) return false;
  const view = decodeDuelWindow(ctx.pkg, window);
  const frame = frameIndexForTick(view, shot.tick);
  const shooter = resolver.byIndexOrNull(shot.playerIndex);
  if (!shooter) return false;
  const eye: Vec3 = { x: shot.x, y: shot.y, z: shot.z + EYE_HEIGHT };
  for (const [index, track] of view.tracks) {
    if (index === shot.playerIndex) continue;
    const enemy = resolver.byIndexOrNull(index);
    if (!enemy || enemy.teamKey === shooter.teamKey) continue;
    if ((track.hp[frame] ?? 0) <= 0) continue;
    const target: Vec3 = { x: track.x[frame] ?? 0, y: track.y[frame] ?? 0, z: (track.z[frame] ?? 0) + TARGET_HEIGHT };
    const err = aimErrorDegrees(shot.yaw, shot.pitch, eye, target);
    if (err == null || err > VIEW_CONE_HALF_DEGREES) continue;
    if (ctx.visibility && !staticLineOfSight(ctx.visibility, eye, target)) continue;
    if (smokeBlocksRay(ctx.pkg.grenades, shot.roundNumber, shot.tick, eye, target)) continue;
    return true;
  }
  return false;
}

/** 该 burst 是否为「交火 burst」：造成了敌方伤害，或首发开枪时视野内有敌人。 */
function isCombatBurst(ctx: VisibilityContext, resolver: PlayerResolver, damages: PackageDamage[], burst: FlatShot[]): boolean {
  if (burst.some((shot) => hasDamageMatch(damages, shot))) return true;
  return firstShotSeesEnemy(ctx, resolver, burst[0]!);
}

/** 开枪前 [S-200ms, S-50ms] 内，从 duels 连续轨迹（3 tick 差分）取峰值速度。无窗口/无轨迹返回 null。 */
function preMoveSpeed(ctx: VisibilityContext, shot: FlatShot, tickrate: number): number | null {
  const window = findWindowCovering(ctx.pkg, shot.roundNumber, shot.tick);
  if (!window) return null;
  const view = decodeDuelWindow(ctx.pkg, window);
  const track = view.tracks.get(shot.playerIndex);
  if (!track) return null;
  const startTick = shot.tick - ticks(PRE_MOVE_START_SECONDS, tickrate);
  const endTick = shot.tick - ticks(PRE_MOVE_END_SECONDS, tickrate);
  const k = 3;
  const dtSeconds = (k * view.tickStep) / tickrate;
  let peak = 0;
  let sampled = false;
  for (let tick = startTick; tick <= endTick; tick += view.tickStep) {
    if (tick < view.startTick) continue;
    const frame = frameIndexForTick(view, tick);
    if (frame - k < 0) continue;
    const distance = Math.hypot((track.x[frame] ?? 0) - (track.x[frame - k] ?? 0), (track.y[frame] ?? 0) - (track.y[frame - k] ?? 0));
    peak = Math.max(peak, distance / dtSeconds);
    sampled = true;
  }
  return sampled ? peak : null;
}

function trackSpeedAtShot(ctx: VisibilityContext, shot: FlatShot, tickrate: number): number | null {
  const window = findWindowCovering(ctx.pkg, shot.roundNumber, shot.tick);
  if (!window) return null;
  const view = decodeDuelWindow(ctx.pkg, window);
  const track = view.tracks.get(shot.playerIndex);
  if (!track) return null;
  const frame = frameIndexForTick(view, shot.tick);
  const dtSeconds = view.tickStep / tickrate;
  const samples: number[] = [];
  for (const prevFrame of [frame - 1, frame]) {
    const nextFrame = prevFrame + 1;
    if (prevFrame < 0 || nextFrame >= track.x.length) continue;
    const distance = Math.hypot((track.x[nextFrame] ?? 0) - (track.x[prevFrame] ?? 0), (track.y[nextFrame] ?? 0) - (track.y[prevFrame] ?? 0));
    samples.push(distance / dtSeconds);
  }
  return samples.length > 0 ? Math.min(...samples) : null;
}

/** 
 * 急停成功率（移动后停稳口径）：对每个 combat burst 第一发，若开枪前确实在移动则计一次尝试，
 * 开枪时速度已降到武器站立精准阈值内则计一次成功。只把 attempt=true 的样本放入分母。
 */
function counterStrafeRate(ctx: VisibilityContext, combatBursts: FlatShot[][], weapon: string, tickrate: number): RateSample {
  const threshold = counterStrafeThresholdForWeapon(weapon).maxSpeed;
  let attempts = 0;
  let successes = 0;
  for (const burst of combatBursts) {
    const shot = burst[0]!;
    const pre = preMoveSpeed(ctx, shot, tickrate);
    if (pre == null || pre <= MOVEMENT_THRESHOLD) continue; // 本就站定，不是急停尝试
    attempts += 1;
    const shotSpeed = trackSpeedAtShot(ctx, shot, tickrate) ?? planarSpeed(shot.vx, shot.vy);
    if (shotSpeed <= threshold) successes += 1;
  }
  return rate(successes, attempts);
}

function isCleanGunfightKill(duel: DuelRecord): boolean {
  return !duel.thirdParty && !duel.throughSmoke && duel.penetratedObjects <= 0;
}

function isOneTapEligible(duel: DuelRecord): boolean {
  return ONE_TAP_CAPABLE_WEAPONS.has(normalizeWeapon(duel.weapon));
}

function isCleanBurstForMechanics(burst: FlatShot[], duels: DuelRecord[]): boolean {
  const first = burst[0]!;
  const last = burst[burst.length - 1]!;
  return !duels.some((duel) => {
    const firstShotTick = duel.evidenceTicks.killerFirstShotTick;
    if (firstShotTick == null) return false;
    return duel.roundNumber === first.roundNumber
      && normalizeWeapon(duel.weapon) === first.weapon
      && firstShotTick >= first.tick
      && firstShotTick <= last.tick
      && !isCleanGunfightKill(duel);
  });
}

function firingPatternRatio(buckets: BurstLengthBuckets, total: number): MechanicsMetricSet["firingPatternRatio"] {
  if (total <= 0) return { tap: 0, burst: 0, spray: 0 };
  return {
    tap: round((buckets.single / total) * 100, 1),
    burst: round(((buckets.short + buckets.medium) / total) * 100, 1),
    spray: round((buckets.long / total) * 100, 1)
  };
}

function medianShotIntervalMs(shots: FlatShot[], tickrate: number): number | null {
  const intervals: number[] = [];
  const sorted = [...shots].sort((a, b) => a.tick - b.tick);
  for (let i = 1; i < sorted.length; i++) intervals.push(((sorted[i]!.tick - sorted[i - 1]!.tick) / tickrate) * 1000);
  return median(intervals);
}

function medianBurstIntervalMs(bursts: FlatShot[][], tickrate: number): number | null {
  const intervals: number[] = [];
  for (let i = 1; i < bursts.length; i++) {
    intervals.push(((bursts[i]![0]!.tick - bursts[i - 1]![bursts[i - 1]!.length - 1]!.tick) / tickrate) * 1000);
  }
  return median(intervals);
}

/**
 * 反应时间 + 预瞄误差的原始样本：对每条击杀 duel，从击杀者首发反向找当前连续可见段的 onset。
 * 反应 = onset → 首发；预瞄 = onset 前 1~3 帧准星与目标三维夹角。
 * prefire（首发时不可见）、左截断（可见段延伸到窗口起点）、>1s 跟踪 均剔除。
 * 返回原始数组而非聚合值，以便 presentation 跨场 concat 后再算中位/比例。
 */
function reactionAndPreaimSamples(ctx: VisibilityContext, duels: DuelRecord[], tickrate: number): { reactionMs: number[]; preaimErrors: number[] } {
  const reactionMs: number[] = [];
  const preaimErrors: number[] = [];
  for (const duel of duels) {
    const shotTick = duel.evidenceTicks.killerFirstShotTick;
    if (shotTick == null) continue;
    const window = findWindowCovering(ctx.pkg, duel.roundNumber, duel.tick);
    if (!window) continue;
    const view = decodeDuelWindow(ctx.pkg, window);
    const shotFrame = reactionAnchorFrame(ctx, view, duel.killerIndex, duel.victimIndex, shotTick);
    const onset = visibleOnsetFrame(ctx, view, duel.killerIndex, duel.victimIndex, shotFrame);
    if (onset == null || onset === 0) continue; // prefire 或 左截断
    const elapsed = ((shotTick - tickAtFrame(view, onset)) / tickrate) * 1000;
    if (elapsed < 0 || elapsed > MAX_REACTION_MS) continue; // 跟踪/异常
    reactionMs.push(round(elapsed, 1));
    const error = preaimErrorAtOnset(view, duel.killerIndex, duel.victimIndex, onset);
    if (error != null) preaimErrors.push(error);
  }
  return { reactionMs, preaimErrors };
}

function reactionAnchorFrame(
  ctx: VisibilityContext,
  view: ReturnType<typeof decodeDuelWindow>,
  killerIndex: number,
  victimIndex: number,
  shotTick: number
): number {
  const shotFrame = frameIndexForTick(view, shotTick);
  if (isVisibleAt(ctx, view, killerIndex, victimIndex, shotFrame)) return shotFrame;

  // 一枪终结时 firstShotTick == killTick，duels 帧里的 victim HP 已经落到 0。
  // 这不是 prefire；用上一帧的存活状态判断开枪前最后一次有效可见。
  const victim = view.tracks.get(victimIndex);
  if (shotFrame > 0 && (victim?.hp[shotFrame] ?? 0) <= 0) return shotFrame - 1;
  return shotFrame;
}

function preaimSampleFrom(preaimErrors: number[]): PreaimSample {
  const withinFiveCount = preaimErrors.filter((value) => value <= PREAIM_WITHIN_DEGREES).length;
  return {
    medianDegrees: median(preaimErrors),
    withinFiveRatio: percent(withinFiveCount, preaimErrors.length),
    withinFiveCount,
    sampleSize: preaimErrors.length
  };
}

function preaimErrorAtOnset(view: ReturnType<typeof decodeDuelWindow>, killerIndex: number, victimIndex: number, onset: number): number | null {
  const killer = view.tracks.get(killerIndex);
  const victim = view.tracks.get(victimIndex);
  if (!killer || !victim) return null;
  const samples: number[] = [];
  for (const frame of [onset - 1, onset - 2, onset - 3]) {
    if (frame < 0) continue;
    const eye: Vec3 = { x: killer.x[frame] ?? 0, y: killer.y[frame] ?? 0, z: (killer.z[frame] ?? 0) + EYE_HEIGHT };
    const target: Vec3 = { x: victim.x[frame] ?? 0, y: victim.y[frame] ?? 0, z: (victim.z[frame] ?? 0) + TARGET_HEIGHT };
    const error = aimErrorDegrees(killer.yaw[frame] ?? 0, killer.pitch[frame] ?? 0, eye, target);
    if (error != null) samples.push(error);
  }
  return median(samples);
}

export function buildMechanicsSignals(
  pkg: DemoPackage,
  duels: DuelRecord[] = buildDuelsSignals(pkg).records,
  options: MechanicsSignalsOptions = {}
): MechanicsSignals {
  const resolver = createResolverFromPackage(pkg);
  const tickrate = tickrateOf(pkg);
  const ctx: VisibilityContext = { pkg, visibility: options.visibility };
  const shots = flattenShots(pkg);
  const allZeroVelocity = shots.length > 0 && shots.every((shot) => shot.vx === 0 && shot.vy === 0);

  // duels 按 killerIndex + weapon 归并，供 TTK / one tap / 反应 / 预瞄 join。
  const duelsByKey = new Map<string, DuelRecord[]>();
  for (const duel of duels) {
    const key = `${duel.killerIndex}:${normalizeWeapon(duel.weapon)}`;
    const list = duelsByKey.get(key) ?? [];
    list.push(duel);
    duelsByKey.set(key, list);
  }

  const grouped = new Map<string, FlatShot[]>();
  for (const shot of shots) {
    const key = `${shot.playerIndex}:${shot.weapon}`;
    const list = grouped.get(key) ?? [];
    list.push(shot);
    grouped.set(key, list);
  }

  const rows = [...grouped.entries()].map(([key, playerShots]): PlayerMechanicsFact | null => {
    const colonIdx = key.indexOf(":");
    const playerIdx = parseInt(key.slice(0, colonIdx), 10);
    const weapon = key.slice(colonIdx + 1);
    const player = resolver.byIndexOrNull(playerIdx);
    if (!player) return null;

    const bursts = splitBursts(playerShots, tickrate);
    const combatBursts = bursts.filter((burst) => isCombatBurst(ctx, resolver, pkg.damages, burst));
    const buckets = bucketBursts(bursts);
    const playerDuels = duelsByKey.get(key) ?? [];
    const cleanPlayerDuels = playerDuels.filter(isCleanGunfightKill);
    const cleanCombatBursts = combatBursts.filter((burst) => isCleanBurstForMechanics(burst, playerDuels));

    // 首发命中率（combat burst 第一发）
    const firstShotHit = rate(
      cleanCombatBursts.filter((burst) => hasDamageMatch(pkg.damages, burst[0]!)).length,
      cleanCombatBursts.length
    );

    // 扫射命中率（仅自动武器、burst≥5 的第 4 发起）
    let sprayHit: RateSample | null = null;
    if (AUTO_WEAPONS.has(weapon)) {
      const sprayShots = cleanCombatBursts.filter((burst) => burst.length >= 5).flatMap((burst) => burst.slice(3));
      sprayHit = rate(sprayShots.filter((shot) => hasDamageMatch(pkg.damages, shot)).length, sprayShots.length);
    }

    // 急停成功率（移动后停稳）；导出器无 velocity 时整体置空
    const counterStrafe = allZeroVelocity ? rate(0, 0) : counterStrafeRate(ctx, cleanCombatBursts, weapon, tickrate);

    // one tap 率（满血单发终结 / 满血无第三方击杀）
    const cleanFullHp = cleanPlayerDuels.filter((duel) => duel.victimHealthBefore === 100);
    const oneTapCandidates = cleanFullHp.filter(isOneTapEligible);
    const oneTap = rate(oneTapCandidates.filter((duel) => duel.oneShotKill).length, oneTapCandidates.length);

    // TTK 中位（lethal burst 第一枪 → 击杀）
    const ttkSamples = cleanPlayerDuels
      .map((duel) => duel.ttkMs)
      .filter((value): value is number => value != null);
    const ttk: MedianSample = { value: median(ttkSamples), sampleSize: ttkSamples.length };

    const { reactionMs, preaimErrors } = reactionAndPreaimSamples(ctx, cleanPlayerDuels, tickrate);
    const reaction: MedianSample = { value: median(reactionMs), sampleSize: reactionMs.length };
    const preaim = preaimSampleFrom(preaimErrors);

    return {
      steamId64: player.steamId64,
      playerName: player.name,
      teamKey: player.teamKey,
      weapon,
      killCount: playerDuels.length,
      cleanKillCount: cleanPlayerDuels.length,
      headshotKills: playerDuels.filter((duel) => duel.headshot).length,
      cleanHeadshotKills: cleanPlayerDuels.filter((duel) => duel.headshot).length,
      burstCount: bursts.length,
      shotCount: playerShots.length,
      firstShotHit,
      sprayHit,
      counterStrafe,
      oneTap,
      ttk,
      reaction,
      preaim,
      medianShotIntervalMs: medianShotIntervalMs(playerShots, tickrate),
      medianBurstIntervalMs: medianBurstIntervalMs(bursts, tickrate),
      burstLengthBuckets: buckets,
      firingPatternRatio: firingPatternRatio(buckets, bursts.length),
      counterStrafeThreshold: counterStrafeThresholdForWeapon(weapon),
      ttkSamplesMs: ttkSamples,
      reactionSamplesMs: reactionMs,
      preaimSamplesDeg: preaimErrors
    };
  }).filter((row): row is PlayerMechanicsFact => row != null);

  return {
    version: "cs2-demo-analysis-kit/mechanics-signals-0.2",
    tickrate,
    burstGapSeconds: BURST_GAP_SECONDS,
    rows: rows.sort((a, b) => b.killCount - a.killCount || b.shotCount - a.shotCount || a.playerName.localeCompare(b.playerName)),
    visibilityAvailable: options.visibility != null
  };
}

export function derivePlayerMechanics(pkg: DemoPackage, options: MechanicsSignalsOptions = {}): PlayerMechanicsFact[] {
  return buildMechanicsSignals(pkg, buildDuelsSignals(pkg, options).records, options).rows;
}
