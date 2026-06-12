import type { DemoPackage, DuelWindow, PackageDamage, PackageKill, PackageShots, ReplayPlayerTrack, Vec3 } from "@cs2dak/contract";
import { decodeDelta } from "@cs2dak/contract";
import { createResolverFromPackage, type PlayerResolver } from "./resolve.js";
import { killWeaponName, normalizeWeapon, round } from "./utils.js";

const ENGAGEMENT_GAP_SECONDS = 1.5;
const CONTESTED_WINDOW_SECONDS = 1.5;
const DUEL_PAIR_WINDOW_SECONDS = 2;
const FULL_HEALTH_HP = 80;
const SUPPRESSED_ANGLE_DEGREES = 60;
const BURST_GAP_SECONDS = 0.25;
const RUNNING_SPEED_THRESHOLD = 120;

export type DuelClassification = "contested_duel" | "suppressed_kill" | "caught_off_guard";
export type DuelHpBucket = "full_hp" | "low_hp";

export interface DuelEvidenceTicks {
  engagementStartTick: number;
  engagementEndTick: number;
  killerFirstShotTick: number | null;
  victimResponseTick: number | null;
  killTick: number;
  windowStartTick?: number;
  windowEndTick?: number;
}

export interface DuelRecord {
  id: string;
  roundNumber: number;
  tick: number;
  engagementId: string;
  duelPairId: string;
  killerSteamId64: string;
  victimSteamId64: string;
  killerName: string;
  victimName: string;
  killerTeamKey: string;
  victimTeamKey: string;
  killerIndex: number;
  victimIndex: number;
  weapon: string;
  classification: DuelClassification;
  hpBucket: DuelHpBucket;
  fullHealth: boolean;
  victimHealthBefore: number;
  killerHealthBefore: number | null;
  ttkMs: number | null;
  thirdParty: boolean;
  oneShotKill: boolean;
  killerPosition: Vec3 | null;
  victimPosition: Vec3;
  facedAttacker: boolean | null;
  evidenceTicks: DuelEvidenceTicks;
}

export interface TtkDistribution {
  count: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  histogram: Array<{ minMs: number; maxMs: number; count: number }>;
}

export interface DuelSignals {
  version: "cs2-demo-analysis-kit/duel-signals-0.1";
  tickrate: number;
  records: DuelRecord[];
  ttk: {
    allFullHp: TtkDistribution;
    byWeapon: Array<{ weapon: string; distribution: TtkDistribution }>;
  };
}

interface FlatShot {
  roundNumber: number;
  playerIndex: number;
  tick: number;
  weapon: string;
  vx: number;
  vy: number;
}

interface Engagement {
  id: string;
  roundNumber: number;
  startTick: number;
  endTick: number;
  events: Array<{ tick: number; attackerIndex: number | null; victimIndex: number | null; kind: "shot" | "damage" | "kill" }>;
}

function tickrateOf(pkg: DemoPackage): number {
  return pkg.match.tickrate || pkg.manifest.tickrate || 64;
}

function ticks(seconds: number, tickrate: number): number {
  return Math.round(seconds * tickrate);
}

function msBetween(startTick: number, endTick: number, tickrate: number): number {
  return Math.max(0, round((endTick - startTick) / tickrate * 1000, 1));
}

function pct(sorted: number[], percentile: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return round(sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower), 1);
}

function distribution(values: number[]): TtkDistribution {
  const sorted = [...values].sort((a, b) => a - b);
  const buckets = [
    { minMs: 0, maxMs: 100, count: 0 },
    { minMs: 100, maxMs: 250, count: 0 },
    { minMs: 250, maxMs: 500, count: 0 },
    { minMs: 500, maxMs: 1000, count: 0 },
    { minMs: 1000, maxMs: 2000, count: 0 },
    { minMs: 2000, maxMs: Number.POSITIVE_INFINITY, count: 0 }
  ];
  for (const value of sorted) {
    const bucket = buckets.find((row) => value >= row.minMs && value < row.maxMs) ?? buckets[buckets.length - 1]!;
    bucket.count += 1;
  }
  return {
    count: sorted.length,
    median: pct(sorted, 0.5),
    p25: pct(sorted, 0.25),
    p75: pct(sorted, 0.75),
    histogram: buckets
  };
}

function flattenShots(shots: PackageShots | undefined): FlatShot[] {
  if (!shots) return [];
  const rows: FlatShot[] = [];
  for (const track of shots.tracks) {
    const trackTicks = decodeDelta(track.tick);
    for (let i = 0; i < trackTicks.length; i++) {
      const weaponIdx = track.weapon[i] ?? -1;
      rows.push({
        roundNumber: track.roundNumber,
        playerIndex: track.playerIndex,
        tick: trackTicks[i]!,
        weapon: normalizeWeapon(weaponIdx >= 0 ? (shots.weaponDict[weaponIdx] ?? "") : ""),
        vx: track.vx[i] ?? 0,
        vy: track.vy[i] ?? 0
      });
    }
  }
  return rows.sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick);
}

function buildEngagements(pkg: DemoPackage, shots: FlatShot[], tickrate: number): Engagement[] {
  const maxGap = ticks(ENGAGEMENT_GAP_SECONDS, tickrate);
  const events = [
    ...shots.map((shot) => ({
      roundNumber: shot.roundNumber,
      tick: shot.tick,
      attackerIndex: shot.playerIndex,
      victimIndex: null,
      kind: "shot" as const
    })),
    ...pkg.damages.map((damage) => ({
      roundNumber: damage.roundNumber,
      tick: damage.tick,
      attackerIndex: damage.attackerIndex,
      victimIndex: damage.victimIndex,
      kind: "damage" as const
    })),
    ...pkg.kills.map((kill) => ({
      roundNumber: kill.roundNumber,
      tick: kill.tick,
      attackerIndex: kill.killerIndex,
      victimIndex: kill.victimIndex,
      kind: "kill" as const
    }))
  ].sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick);

  const out: Engagement[] = [];
  for (const event of events) {
    const current = out[out.length - 1];
    if (!current || current.roundNumber !== event.roundNumber || event.tick - current.endTick > maxGap) {
      out.push({
        id: `${event.roundNumber}:${event.tick}:${out.length}`,
        roundNumber: event.roundNumber,
        startTick: event.tick,
        endTick: event.tick,
        events: [event]
      });
    } else {
      current.endTick = Math.max(current.endTick, event.tick);
      current.events.push(event);
    }
  }
  return out;
}

function engagementForKill(engagements: Engagement[], kill: PackageKill): Engagement {
  return engagements.find((row) => row.roundNumber === kill.roundNumber && row.startTick <= kill.tick && row.endTick >= kill.tick) ?? {
    id: `${kill.roundNumber}:${kill.tick}:fallback`,
    roundNumber: kill.roundNumber,
    startTick: kill.tick,
    endTick: kill.tick,
    events: []
  };
}

function pairId(roundNumber: number, a: number, b: number): string {
  const first = Math.min(a, b);
  const second = Math.max(a, b);
  return `${roundNumber}:${first}:${second}`;
}

function yawTo(target: Vec3, from: Vec3): number {
  return Math.atan2(target.y - from.y, target.x - from.x) * 180 / Math.PI;
}

function angleDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function replayTrackAtKill(pkg: DemoPackage, kill: PackageKill): { track: ReplayPlayerTrack; frameIndex: number } | null {
  const replayRound = pkg.replay?.rounds.find((round) => round.roundNumber === kill.roundNumber);
  if (!replayRound) return null;
  const track = replayRound.players.find((player) => player.playerIndex === kill.victimIndex);
  if (!track) return null;
  const rawIndex = Math.round((kill.tick - replayRound.startTick) / replayRound.tickStep);
  return { track, frameIndex: Math.max(0, Math.min(replayRound.frameCount - 1, rawIndex)) };
}

function duelWindowForKill(pkg: DemoPackage, kill: PackageKill): DuelWindow | null {
  return pkg.duels?.windows.find((window) =>
    window.roundNumber === kill.roundNumber &&
    window.anchors.some((anchor) => anchor.tick === kill.tick || Math.abs(anchor.tick - kill.tick) <= 2)
  ) ?? null;
}

function victimFrameInDuelWindow(pkg: DemoPackage, kill: PackageKill): { position: Vec3; yaw: number; moving: boolean } | null {
  const window = duelWindowForKill(pkg, kill);
  if (!window) return null;
  const track = window.players.find((player) => player.playerIndex === kill.victimIndex);
  if (!track) return null;
  const index = Math.max(0, Math.min(window.frameCount - 1, Math.round((kill.tick - window.startTick) / window.tickStep)));
  const x = decodeDelta(track.x);
  const y = decodeDelta(track.y);
  const z = decodeDelta(track.z);
  const yaw = decodeDelta(track.yaw);
  const prevIndex = Math.max(0, index - 1);
  const dt = Math.max(1, index - prevIndex);
  const distance = Math.hypot((x[index] ?? 0) - (x[prevIndex] ?? 0), (y[index] ?? 0) - (y[prevIndex] ?? 0));
  const tickrate = pkg.duels?.meta.sampleRate ?? tickrateOf(pkg);
  return {
    position: {
      x: (x[index] ?? kill.victimPosition.x) / (pkg.duels?.meta.coordScale ?? 1),
      y: (y[index] ?? kill.victimPosition.y) / (pkg.duels?.meta.coordScale ?? 1),
      z: (z[index] ?? kill.victimPosition.z) / (pkg.duels?.meta.coordScale ?? 1)
    },
    yaw: (yaw[index] ?? 0) / (pkg.duels?.meta.angleScale ?? 10),
    moving: distance / dt * tickrate > RUNNING_SPEED_THRESHOLD
  };
}

function victimFacingState(pkg: DemoPackage, kill: PackageKill): { faced: boolean | null; moving: boolean } {
  if (!kill.killerPosition) return { faced: null, moving: false };
  const fromDuel = victimFrameInDuelWindow(pkg, kill);
  if (fromDuel) {
    return {
      faced: angleDiff(fromDuel.yaw, yawTo(kill.killerPosition, fromDuel.position)) <= SUPPRESSED_ANGLE_DEGREES,
      moving: fromDuel.moving
    };
  }
  const replay = replayTrackAtKill(pkg, kill);
  if (!replay) return { faced: null, moving: false };
  const angleScale = pkg.replay?.meta.angleScale ?? 10;
  const coordScale = pkg.replay?.meta.coordScale ?? 1;
  const xAbs = decodeDelta(replay.track.x);
  const yAbs = decodeDelta(replay.track.y);
  const zAbs = decodeDelta(replay.track.z);
  const yawAbs = decodeDelta(replay.track.yaw);
  const prevIndex = Math.max(0, replay.frameIndex - 1);
  const position = {
    x: (xAbs[replay.frameIndex] ?? kill.victimPosition.x) / coordScale,
    y: (yAbs[replay.frameIndex] ?? kill.victimPosition.y) / coordScale,
    z: (zAbs[replay.frameIndex] ?? kill.victimPosition.z) / coordScale
  };
  const distance = Math.hypot(
    (xAbs[replay.frameIndex] ?? 0) - (xAbs[prevIndex] ?? 0),
    (yAbs[replay.frameIndex] ?? 0) - (yAbs[prevIndex] ?? 0)
  ) / coordScale;
  const moving = distance * (pkg.replay?.meta.sampleRate ?? 8) > RUNNING_SPEED_THRESHOLD;
  const yaw = (yawAbs[replay.frameIndex] ?? 0) / angleScale;
  return { faced: angleDiff(yaw, yawTo(kill.killerPosition, position)) <= SUPPRESSED_ANGLE_DEGREES, moving };
}

function victimResponseTick(shots: FlatShot[], kill: PackageKill, tickrate: number): number | null {
  if (kill.killerIndex === null) return null;
  const window = ticks(CONTESTED_WINDOW_SECONDS, tickrate);
  return shots.find((shot) =>
    shot.roundNumber === kill.roundNumber &&
    shot.playerIndex === kill.victimIndex &&
    Math.abs(shot.tick - kill.tick) <= window
  )?.tick ?? null;
}

function burstForKill(shots: FlatShot[], kill: PackageKill, tickrate: number): FlatShot[] {
  if (kill.killerIndex === null) return [];
  const maxGap = ticks(BURST_GAP_SECONDS, tickrate);
  const targetWeapon = normalizeWeapon(killWeaponName(kill));
  const prior = shots
    .filter((shot) =>
      shot.roundNumber === kill.roundNumber &&
      shot.playerIndex === kill.killerIndex &&
      shot.tick <= kill.tick &&
      (!targetWeapon || shot.weapon === targetWeapon)
    )
    .sort((a, b) => a.tick - b.tick);
  const bursts: FlatShot[][] = [];
  for (const shot of prior) {
    const current = bursts[bursts.length - 1];
    if (!current || shot.tick - current[current.length - 1]!.tick > maxGap) bursts.push([shot]);
    else current.push(shot);
  }
  return bursts[bursts.length - 1] ?? [];
}

function victimHealthBefore(pkg: DemoPackage, kill: PackageKill): number {
  const direct = pkg.damages
    .filter((row) =>
      row.roundNumber === kill.roundNumber &&
      row.victimIndex === kill.victimIndex &&
      row.tick <= kill.tick &&
      (kill.killerIndex === null || row.attackerIndex === kill.killerIndex)
    )
    .sort((a, b) => a.tick - b.tick)[0];
  return direct?.victimHealthBefore ?? 100;
}

function killerHealthBefore(pkg: DemoPackage, kill: PackageKill): number | null {
  if (kill.killerIndex === null) return null;
  const prior = pkg.damages
    .filter((row) => row.roundNumber === kill.roundNumber && row.victimIndex === kill.killerIndex && row.tick <= kill.tick)
    .sort((a, b) => b.tick - a.tick)[0];
  return prior ? Math.max(0, prior.victimHealthBefore - prior.healthDamage) : 100;
}

function hasThirdPartyImpact(pkg: DemoPackage, kill: PackageKill, engagement: Engagement): boolean {
  if (kill.killerIndex === null) return true;
  const pairedWindow = ticks(DUEL_PAIR_WINDOW_SECONDS, tickrateOf(pkg));
  return pkg.damages.some((damage) =>
    damage.roundNumber === kill.roundNumber &&
    damage.victimIndex === kill.victimIndex &&
    damage.attackerIndex !== null &&
    damage.attackerIndex !== kill.killerIndex &&
    Math.abs(damage.tick - kill.tick) <= pairedWindow &&
    damage.tick >= engagement.startTick &&
    damage.tick <= engagement.endTick
  );
}

function isEnemyKill(pkg: DemoPackage, resolver: PlayerResolver, kill: PackageKill): kill is PackageKill & { killerIndex: number } {
  if (kill.killerIndex === null || kill.killerIndex === kill.victimIndex) return false;
  const killer = resolver.byIndexOrNull(kill.killerIndex);
  const victim = resolver.byIndexOrNull(kill.victimIndex);
  return Boolean(killer && victim && killer.teamKey !== victim.teamKey);
}

/** buildDuelsSignals 是 pkg 的纯函数；duel/mechanics/presentation 多处消费，按 pkg 实例记忆化避免重复构建 engagement。 */
const duelSignalsCache = new WeakMap<DemoPackage, DuelSignals>();

export function buildDuelsSignals(input: DemoPackage): DuelSignals {
  const cached = duelSignalsCache.get(input);
  if (cached) return cached;
  const pkg = input;
  const resolver = createResolverFromPackage(pkg);
  const tickrate = tickrateOf(pkg);
  const shots = flattenShots(pkg.shots);
  const engagements = buildEngagements(pkg, shots, tickrate);
  const records = pkg.kills
    .filter((kill) => isEnemyKill(pkg, resolver, kill))
    .map((kill, index): DuelRecord => {
      const killer = resolver.byIndex(kill.killerIndex!);
      const victim = resolver.byIndex(kill.victimIndex);
      const engagement = engagementForKill(engagements, kill);
      const responseTick = victimResponseTick(shots, kill, tickrate);
      const facing = victimFacingState(pkg, kill);
      const classification: DuelClassification = responseTick != null
        ? "contested_duel"
        : facing.faced === true && !facing.moving
          ? "suppressed_kill"
          : "caught_off_guard";
      const burst = burstForKill(shots, kill, tickrate);
      const hp = victimHealthBefore(pkg, kill);
      const hpBucket: DuelHpBucket = hp >= FULL_HEALTH_HP ? "full_hp" : "low_hp";
      const thirdParty = hasThirdPartyImpact(pkg, kill, engagement);
      const window = duelWindowForKill(pkg, kill);
      const ttkMs = hpBucket === "full_hp" && !thirdParty && burst.length > 0
        ? msBetween(burst[0]!.tick, kill.tick, tickrate)
        : null;
      return {
        id: `${kill.roundNumber}-${kill.tick}-${kill.killerIndex}-${kill.victimIndex}-${index}`,
        roundNumber: kill.roundNumber,
        tick: kill.tick,
        engagementId: engagement.id,
        duelPairId: pairId(kill.roundNumber, kill.killerIndex!, kill.victimIndex),
        killerSteamId64: killer.steamId64,
        victimSteamId64: victim.steamId64,
        killerName: killer.name,
        victimName: victim.name,
        killerTeamKey: killer.teamKey,
        victimTeamKey: victim.teamKey,
        killerIndex: kill.killerIndex!,
        victimIndex: kill.victimIndex,
        weapon: killWeaponName(kill),
        classification,
        hpBucket,
        fullHealth: hpBucket === "full_hp",
        victimHealthBefore: hp,
        killerHealthBefore: killerHealthBefore(pkg, kill),
        ttkMs,
        thirdParty,
        oneShotKill: burst.length === 1,
        killerPosition: kill.killerPosition,
        victimPosition: kill.victimPosition,
        facedAttacker: facing.faced,
        evidenceTicks: {
          engagementStartTick: engagement.startTick,
          engagementEndTick: engagement.endTick,
          killerFirstShotTick: burst[0]?.tick ?? null,
          victimResponseTick: responseTick,
          killTick: kill.tick,
          windowStartTick: window?.startTick,
          windowEndTick: window ? window.startTick + window.tickStep * Math.max(0, window.frameCount - 1) : undefined
        }
      };
    })
    .sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick);

  const fullHpTtk = records
    .filter((record) => record.hpBucket === "full_hp" && !record.thirdParty && record.ttkMs != null)
    .map((record) => record.ttkMs!);
  const weaponKeys = [...new Set(records.map((record) => normalizeWeapon(record.weapon)))].sort();
  const signals: DuelSignals = {
    version: "cs2-demo-analysis-kit/duel-signals-0.1",
    tickrate,
    records,
    ttk: {
      allFullHp: distribution(fullHpTtk),
      byWeapon: weaponKeys.map((weapon) => ({
        weapon,
        distribution: distribution(records
          .filter((record) => normalizeWeapon(record.weapon) === weapon && record.hpBucket === "full_hp" && !record.thirdParty && record.ttkMs != null)
          .map((record) => record.ttkMs!))
      }))
    }
  };
  duelSignalsCache.set(input, signals);
  return signals;
}

export function deriveDuels(pkg: DemoPackage): DuelRecord[] {
  return buildDuelsSignals(pkg).records;
}

export function deriveOpeningDuels(pkg: DemoPackage): DuelRecord[] {
  const seen = new Set<number>();
  const rows: DuelRecord[] = [];
  for (const duel of deriveDuels(pkg)) {
    if (seen.has(duel.roundNumber)) continue;
    seen.add(duel.roundNumber);
    rows.push(duel);
  }
  return rows;
}

