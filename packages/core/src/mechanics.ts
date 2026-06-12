import type { DemoPackage, PackageDamage, PackageKill, PackageShots } from "@cs2dak/contract";
import { decodeDelta } from "@cs2dak/contract";
import { staticLineOfSight, type TriangleBvh, type Vec3 } from "@cs2dak/maps";
import { buildDuelsSignals, type DuelRecord } from "./duels.js";
import { createResolverFromPackage } from "./resolve.js";
import { killWeaponName, normalizeWeapon, round } from "./utils.js";

const BURST_GAP_SECONDS = 0.25;
const PRE_SHOT_VELOCITY_WINDOW_SECONDS = 0.2;
const DAMAGE_MATCH_TICKS = 1;
const PREAIM_SUCCESS_DEGREES = 8;

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

export interface MechanicsMetricSet {
  firstShotAccuracyPercent: number | null;
  sprayAccuracyPercent: number | null;
  counterStrafeSuccessPercent: number | null;
  oneTapRatePercent: number | null;
  medianShotIntervalMs: number | null;
  medianBurstIntervalMs: number | null;
  burstLengthBuckets: BurstLengthBuckets;
  firingPatternRatio: {
    tap: number;
    burst: number;
    spray: number;
  };
}

export interface ReactionPreaimSignals {
  audioReactionMs: number | null;
  visualReactionMs: number | null;
  preaimAngleErrorDegrees: number | null;
  preaimSuccess: boolean | null;
}

export interface PlayerMechanicsFact extends MechanicsMetricSet {
  steamId64: string;
  playerName: string;
  teamKey: string;
  weapon: string;
  burstCount: number;
  killCount: number;
  shotCount: number;
  reaction: ReactionPreaimSignals;
  counterStrafeThreshold: WeaponCounterStrafeThreshold;
}

export interface MechanicsSignals {
  version: "cs2-demo-analysis-kit/mechanics-signals-0.1";
  tickrate: number;
  burstGapSeconds: number;
  velocityWindowSeconds: number;
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

function tickrateOf(pkg: DemoPackage): number {
  return pkg.match.tickrate || pkg.manifest.tickrate || 64;
}

function ticks(seconds: number, tickrate: number): number {
  return Math.round(seconds * tickrate);
}

function percent(count: number, total: number): number | null {
  return total > 0 ? round(count / total * 100, 1) : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? round((sorted[mid - 1]! + sorted[mid]!) / 2, 1) : round(sorted[mid]!, 1);
}

function speed(shot: FlatShot): number {
  return Math.hypot(shot.vx, shot.vy);
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

function flattenShots(shots: PackageShots | undefined, angleScale = 10, coordScale = 1): FlatShot[] {
  if (!shots) return [];
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

function shotsBeforeKillBoundary(shots: FlatShot[], kills: PackageKill[]): FlatShot[] {
  return shots.filter((shot) => {
    const nextKill = kills
      .filter((kill) =>
        kill.roundNumber === shot.roundNumber &&
        kill.killerIndex === shot.playerIndex &&
        normalizeWeapon(killWeaponName(kill)) === shot.weapon &&
        kill.tick >= shot.tick
      )
      .sort((a, b) => a.tick - b.tick)[0];
    return !nextKill || shot.tick <= nextKill.tick;
  });
}

function counterStrafePercent(shots: FlatShot[], tickrate: number): number | null {
  if (shots.length === 0) return null;
  if (shots.every((shot) => shot.vx === 0 && shot.vy === 0)) return null;
  const preWindow = ticks(PRE_SHOT_VELOCITY_WINDOW_SECONDS, tickrate);
  let eligible = 0;
  let success = 0;
  for (const shot of shots) {
    const sameTrack = shots.filter((row) =>
      row.roundNumber === shot.roundNumber &&
      row.playerIndex === shot.playerIndex &&
      row.tick >= shot.tick - preWindow &&
      row.tick <= shot.tick
    );
    const reference = sameTrack.length > 0
      ? sameTrack.reduce((best, row) => speed(row) > speed(best) ? row : best, sameTrack[0]!)
      : shot;
    const threshold = counterStrafeThresholdForWeapon(shot.weapon).maxSpeed;
    eligible += 1;
    if (speed(reference) <= threshold) success += 1;
  }
  return percent(success, eligible);
}

function firingPatternRatio(buckets: BurstLengthBuckets, total: number): MechanicsMetricSet["firingPatternRatio"] {
  if (total <= 0) return { tap: 0, burst: 0, spray: 0 };
  return {
    tap: round(buckets.single / total * 100, 1),
    burst: round((buckets.short + buckets.medium) / total * 100, 1),
    spray: round(buckets.long / total * 100, 1)
  };
}

function medianShotIntervalMs(shots: FlatShot[], tickrate: number): number | null {
  const intervals: number[] = [];
  const sorted = [...shots].sort((a, b) => a.tick - b.tick);
  for (let i = 1; i < sorted.length; i++) {
    intervals.push((sorted[i]!.tick - sorted[i - 1]!.tick) / tickrate * 1000);
  }
  return median(intervals);
}

function medianBurstIntervalMs(bursts: FlatShot[][], tickrate: number): number | null {
  const intervals: number[] = [];
  for (let i = 1; i < bursts.length; i++) {
    intervals.push((bursts[i]![0]!.tick - bursts[i - 1]![bursts[i - 1]!.length - 1]!.tick) / tickrate * 1000);
  }
  return median(intervals);
}

function angleTo(target: Vec3, from: Vec3): number {
  return Math.atan2(target.y - from.y, target.x - from.x) * 180 / Math.PI;
}

function angleDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function firstVisibleTickFromDuelWindow(pkg: DemoPackage, duel: DuelRecord, visibility?: TriangleBvh | null): number | null {
  if (!visibility || !pkg.duels) return null;
  const window = pkg.duels.windows.find((row) =>
    row.roundNumber === duel.roundNumber &&
    row.startTick <= duel.tick &&
    row.startTick + row.tickStep * Math.max(0, row.frameCount - 1) >= duel.tick
  );
  if (!window) return null;
  const killer = window.players.find((player) => player.playerIndex === duel.killerIndex);
  const victim = window.players.find((player) => player.playerIndex === duel.victimIndex);
  if (!killer || !victim) return null;
  const coordScale = pkg.duels.meta.coordScale || 1;
  const kx = decodeDelta(killer.x);
  const ky = decodeDelta(killer.y);
  const kz = decodeDelta(killer.z);
  const vx = decodeDelta(victim.x);
  const vy = decodeDelta(victim.y);
  const vz = decodeDelta(victim.z);
  for (let i = 0; i < window.frameCount; i++) {
    const start = { x: (kx[i] ?? 0) / coordScale, y: (ky[i] ?? 0) / coordScale, z: (kz[i] ?? 0) / coordScale + 64 };
    const end = { x: (vx[i] ?? 0) / coordScale, y: (vy[i] ?? 0) / coordScale, z: (vz[i] ?? 0) / coordScale + 64 };
    if (staticLineOfSight(visibility, start, end)) return window.startTick + i * window.tickStep;
  }
  return null;
}

function preaimErrorFromDuelWindow(pkg: DemoPackage, duel: DuelRecord, visibleTick: number | null): number | null {
  if (!pkg.duels || visibleTick == null) return null;
  const window = pkg.duels.windows.find((row) => row.roundNumber === duel.roundNumber && row.startTick <= visibleTick && row.startTick + row.tickStep * Math.max(0, row.frameCount - 1) >= visibleTick);
  if (!window) return null;
  const killer = window.players.find((player) => player.playerIndex === duel.killerIndex);
  const victim = window.players.find((player) => player.playerIndex === duel.victimIndex);
  if (!killer || !victim) return null;
  const frameIndex = Math.max(0, Math.min(window.frameCount - 1, Math.floor((visibleTick - window.startTick) / window.tickStep) - 1));
  const coordScale = pkg.duels.meta.coordScale || 1;
  const angleScale = pkg.duels.meta.angleScale || 10;
  const kx = decodeDelta(killer.x);
  const ky = decodeDelta(killer.y);
  const vx = decodeDelta(victim.x);
  const vy = decodeDelta(victim.y);
  const yaw = decodeDelta(killer.yaw);
  const from = { x: (kx[frameIndex] ?? 0) / coordScale, y: (ky[frameIndex] ?? 0) / coordScale, z: 0 };
  const target = { x: (vx[frameIndex] ?? 0) / coordScale, y: (vy[frameIndex] ?? 0) / coordScale, z: 0 };
  return round(angleDelta((yaw[frameIndex] ?? 0) / angleScale, angleTo(target, from)), 1);
}

function aggregateReaction(pkg: DemoPackage, duels: DuelRecord[], tickrate: number, visibility?: TriangleBvh | null): ReactionPreaimSignals {
  const visual = duels
    .map((duel) => {
      const firstVisibleTick = firstVisibleTickFromDuelWindow(pkg, duel, visibility) ?? duel.evidenceTicks.windowStartTick ?? null;
      if (firstVisibleTick == null || duel.evidenceTicks.killerFirstShotTick == null) return null;
      return Math.max(0, (duel.evidenceTicks.killerFirstShotTick - firstVisibleTick) / tickrate * 1000);
    })
    .filter((value): value is number => value != null);
  const audio = duels
    .map((duel) => {
      if (duel.evidenceTicks.victimResponseTick == null || duel.evidenceTicks.killerFirstShotTick == null) return null;
      return Math.max(0, (duel.evidenceTicks.victimResponseTick - duel.evidenceTicks.killerFirstShotTick) / tickrate * 1000);
    })
    .filter((value): value is number => value != null);
  const preaimErrors = duels
    .map((duel) => {
      const firstVisibleTick = firstVisibleTickFromDuelWindow(pkg, duel, visibility) ?? null;
      return preaimErrorFromDuelWindow(pkg, duel, firstVisibleTick) ?? (duel.facedAttacker === true ? 0 : duel.facedAttacker === false ? 90 : null);
    })
    .filter((value): value is number => value != null);
  return {
    audioReactionMs: median(audio),
    visualReactionMs: median(visual),
    preaimAngleErrorDegrees: median(preaimErrors),
    preaimSuccess: preaimErrors.length > 0 ? median(preaimErrors)! <= PREAIM_SUCCESS_DEGREES : null
  };
}

export function buildMechanicsSignals(
  pkg: DemoPackage,
  duels: DuelRecord[] = buildDuelsSignals(pkg).records,
  options: MechanicsSignalsOptions = {}
): MechanicsSignals {
  const resolver = createResolverFromPackage(pkg);
  const tickrate = tickrateOf(pkg);
  const angleScale = pkg.shots?.meta.angleScale ?? 10;
  const coordScale = pkg.shots?.meta.coordScale ?? 1;
  const shots = flattenShots(pkg.shots, angleScale, coordScale);
  const killCounts = new Map<string, { kills: number; oneTaps: number }>();
  for (const duel of duels) {
    const weapon = normalizeWeapon(duel.weapon);
    const key = `${duel.killerIndex}:${weapon}`;
    const current = killCounts.get(key) ?? { kills: 0, oneTaps: 0 };
    current.kills += 1;
    if (duel.oneShotKill) current.oneTaps += 1;
    killCounts.set(key, current);
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
    const boundedShots = shotsBeforeKillBoundary(playerShots, pkg.kills);
    const bursts = splitBursts(boundedShots, tickrate);
    const firstShots = bursts.map((burst) => burst[0]!).filter(Boolean);
    const sprayShots = bursts.flatMap((burst) => burst.slice(1));
    const buckets = bucketBursts(bursts);
    const kills = killCounts.get(key) ?? { kills: 0, oneTaps: 0 };
    const playerDuels = duels.filter((duel) => duel.killerIndex === playerIdx && normalizeWeapon(duel.weapon) === weapon);
    return {
      steamId64: player.steamId64,
      playerName: player.name,
      teamKey: player.teamKey,
      weapon,
      killCount: kills.kills,
      burstCount: bursts.length,
      shotCount: boundedShots.length,
      firstShotAccuracyPercent: percent(firstShots.filter((shot) => hasDamageMatch(pkg.damages, shot)).length, firstShots.length),
      sprayAccuracyPercent: percent(sprayShots.filter((shot) => hasDamageMatch(pkg.damages, shot)).length, sprayShots.length),
      counterStrafeSuccessPercent: counterStrafePercent(boundedShots, tickrate),
      oneTapRatePercent: percent(kills.oneTaps, kills.kills),
      medianShotIntervalMs: medianShotIntervalMs(boundedShots, tickrate),
      medianBurstIntervalMs: medianBurstIntervalMs(bursts, tickrate),
      burstLengthBuckets: buckets,
      firingPatternRatio: firingPatternRatio(buckets, bursts.length),
      reaction: aggregateReaction(pkg, playerDuels, tickrate, options.visibility),
      counterStrafeThreshold: counterStrafeThresholdForWeapon(weapon)
    };
  }).filter((row): row is PlayerMechanicsFact => row != null);

  return {
    version: "cs2-demo-analysis-kit/mechanics-signals-0.1",
    tickrate,
    burstGapSeconds: BURST_GAP_SECONDS,
    velocityWindowSeconds: PRE_SHOT_VELOCITY_WINDOW_SECONDS,
    rows: rows.sort((a, b) => b.killCount - a.killCount || b.shotCount - a.shotCount || a.playerName.localeCompare(b.playerName)),
    visibilityAvailable: options.visibility != null
  };
}

export function derivePlayerMechanics(pkg: DemoPackage, options: MechanicsSignalsOptions = {}): PlayerMechanicsFact[] {
  return buildMechanicsSignals(pkg, buildDuelsSignals(pkg).records, options).rows;
}
