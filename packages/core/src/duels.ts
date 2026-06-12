import type { DemoPackage, PackageDamage, PackageKill, ReplayPlayerTrack, Vec3 } from "@cs2dak/contract";
import { decodeDelta } from "@cs2dak/contract";
import { createResolverFromPackage, type PlayerResolver } from "./resolve.js";
import { normalizeWeapon } from "./utils.js";

const ENGAGEMENT_GAP_SECONDS = 1.5;
const CONTESTED_WINDOW_SECONDS = 1.5;
const DUEL_PAIR_WINDOW_SECONDS = 2;
const FULL_HEALTH_HP = 80;
const OUTAIMED_ANGLE_DEGREES = 60;
const BURST_GAP_MS = 250;

export type DuelClassification = "contested" | "outaimed" | "caught_off_guard" | "cleanup";

export interface DuelFact {
  id: string;
  roundNumber: number;
  tick: number;
  killerSteamId64: string;
  victimSteamId64: string;
  killerTeamKey: string;
  victimTeamKey: string;
  weapon: string;
  classification: DuelClassification;
  fullHealth: boolean;
  victimHealthBefore: number;
  killerHealthBefore: number | null;
  ttkMs: number | null;
  oneShotKill: boolean;
  killerPosition: Vec3 | null;
  victimPosition: Vec3;
}

function tickrateOf(pkg: DemoPackage): number {
  return pkg.match.tickrate || 64;
}

function ticks(seconds: number, tickrate: number): number {
  return Math.round(seconds * tickrate);
}

function msBetween(startTick: number, endTick: number, tickrate: number): number {
  return Math.round((endTick - startTick) / tickrate * 1000);
}

function pairKey(roundNumber: number, attacker: number, victim: number): string {
  return `${roundNumber}:${attacker}:${victim}`;
}

function groupDamages(pkg: DemoPackage, resolver: PlayerResolver): Map<string, PackageDamage[][]> {
  const tickrate = tickrateOf(pkg);
  const maxGap = ticks(ENGAGEMENT_GAP_SECONDS, tickrate);
  const byPair = new Map<string, PackageDamage[]>();
  for (const damage of pkg.damages) {
    if (damage.attackerIndex === null || damage.attackerIndex === damage.victimIndex) continue;
    const attackerPlayer = resolver.byIndexOrNull(damage.attackerIndex);
    const victimPlayer = resolver.byIndexOrNull(damage.victimIndex);
    if (!attackerPlayer || !victimPlayer || attackerPlayer.teamKey === victimPlayer.teamKey) continue;
    const key = pairKey(damage.roundNumber, damage.attackerIndex, damage.victimIndex);
    const list = byPair.get(key) ?? [];
    list.push(damage);
    byPair.set(key, list);
  }

  const grouped = new Map<string, PackageDamage[][]>();
  for (const [key, rows] of byPair) {
    const sorted = [...rows].sort((a, b) => a.tick - b.tick);
    const groups: PackageDamage[][] = [];
    for (const row of sorted) {
      const current = groups[groups.length - 1];
      if (!current || row.tick - current[current.length - 1].tick > maxGap) groups.push([row]);
      else current.push(row);
    }
    grouped.set(key, groups);
  }
  return grouped;
}

function groupForKill(groups: Map<string, PackageDamage[][]>, kill: PackageKill): PackageDamage[] {
  if (kill.killerIndex === null) return [];
  const rows = groups.get(pairKey(kill.roundNumber, kill.killerIndex, kill.victimIndex)) ?? [];
  return rows.find((group) => group[0].tick <= kill.tick && group[group.length - 1].tick >= kill.tick - ticks(ENGAGEMENT_GAP_SECONDS, 64)) ?? [];
}

function hasVictimResponse(pkg: DemoPackage, kill: PackageKill, tickrate: number): boolean {
  if (kill.killerIndex === null) return false;
  const window = ticks(CONTESTED_WINDOW_SECONDS, tickrate);
  const pairedWindow = ticks(DUEL_PAIR_WINDOW_SECONDS, tickrate);
  const reciprocalDamage = pkg.damages.some(
    (row) =>
      row.roundNumber === kill.roundNumber &&
      row.attackerIndex === kill.victimIndex &&
      row.victimIndex === kill.killerIndex &&
      Math.abs(row.tick - kill.tick) <= pairedWindow
  );
  if (reciprocalDamage) return true;
  if (!pkg.shots) return false;
  const track = pkg.shots.tracks.find(
    (t) => t.roundNumber === kill.roundNumber && t.playerIndex === kill.victimIndex
  );
  if (!track) return false;
  const trackTicks = decodeDelta(track.tick);
  return trackTicks.some((t) => Math.abs(t - kill.tick) <= window);
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
  const frameIndex = Math.max(0, Math.min(replayRound.frameCount - 1, rawIndex));
  return { track, frameIndex };
}

function victimFacedKiller(pkg: DemoPackage, kill: PackageKill): boolean {
  if (!kill.killerPosition) return false;
  const replay = replayTrackAtKill(pkg, kill);
  if (!replay) return false;
  const angleScale = pkg.replay?.meta.angleScale ?? 10;
  const xAbs = decodeDelta(replay.track.x);
  const yAbs = decodeDelta(replay.track.y);
  const zAbs = decodeDelta(replay.track.z);
  const yawAbs = decodeDelta(replay.track.yaw);
  const victimPosition = {
    x: xAbs[replay.frameIndex] ?? kill.victimPosition.x,
    y: yAbs[replay.frameIndex] ?? kill.victimPosition.y,
    z: zAbs[replay.frameIndex] ?? kill.victimPosition.z
  };
  const victimYaw = (yawAbs[replay.frameIndex] ?? 0) / angleScale;
  return angleDiff(victimYaw, yawTo(kill.killerPosition, victimPosition)) <= OUTAIMED_ANGLE_DEGREES;
}

function burstForKill(pkg: DemoPackage, kill: PackageKill, tickrate: number): { tick: number }[] {
  if (kill.killerIndex === null || !pkg.shots) return [];
  const maxGap = Math.round(BURST_GAP_MS / 1000 * tickrate);
  const weaponDict = pkg.shots.weaponDict;
  const track = pkg.shots.tracks.find(
    (t) => t.roundNumber === kill.roundNumber && t.playerIndex === kill.killerIndex
  );
  if (!track) return [];
  const targetWeapon = kill.killerActiveWeapon ? normalizeWeapon(kill.killerActiveWeapon) : null;
  const trackTicks = decodeDelta(track.tick);
  const shots = trackTicks
    .map((t, i) => ({
      tick: t,
      weapon: weaponDict[track.weapon[i] ?? -1] ?? ""
    }))
    .filter((s) => s.tick <= kill.tick && (!targetWeapon || normalizeWeapon(s.weapon) === targetWeapon))
    .sort((a, b) => a.tick - b.tick);
  const bursts: { tick: number; weapon: string }[][] = [];
  for (const shot of shots) {
    const current = bursts[bursts.length - 1];
    if (!current || shot.tick - current[current.length - 1].tick >= maxGap) bursts.push([shot]);
    else current.push(shot);
  }
  return bursts[bursts.length - 1] ?? [];
}

function killerHealthBefore(pkg: DemoPackage, kill: PackageKill): number | null {
  if (kill.killerIndex === null) return null;
  const prior = pkg.damages
    .filter((row) => row.roundNumber === kill.roundNumber && row.victimIndex === kill.killerIndex && row.tick <= kill.tick)
    .sort((a, b) => b.tick - a.tick)[0];
  if (!prior) return 100;
  // v3: victimHealthAfter = victimHealthBefore - healthDamage
  return prior.victimHealthBefore - prior.healthDamage;
}

export function deriveDuels(pkg: DemoPackage): DuelFact[] {
  const resolver = createResolverFromPackage(pkg);
  const tickrate = tickrateOf(pkg);
  const damageGroups = groupDamages(pkg, resolver);
  return pkg.kills
    .filter((kill) => kill.killerIndex !== null && kill.killerIndex !== kill.victimIndex)
    .map((kill, index) => {
      const killerPlayer = resolver.byIndex(kill.killerIndex!);
      const victimPlayer = resolver.byIndex(kill.victimIndex);
      const group = groupForKill(damageGroups, kill);
      const firstDamage = group[0] ?? null;
      const victimHealthBefore = firstDamage?.victimHealthBefore ?? 100;
      const fullHealth = victimHealthBefore >= FULL_HEALTH_HP;
      const burst = burstForKill(pkg, kill, tickrate);
      const response = hasVictimResponse(pkg, kill, tickrate);
      const classification: DuelClassification = !fullHealth
        ? "cleanup"
        : response
          ? "contested"
          : victimFacedKiller(pkg, kill)
            ? "outaimed"
            : "caught_off_guard";
      return {
        id: `${kill.roundNumber}-${kill.tick}-${kill.killerIndex}-${kill.victimIndex}-${index}`,
        roundNumber: kill.roundNumber,
        tick: kill.tick,
        killerSteamId64: killerPlayer.steamId64,
        victimSteamId64: victimPlayer.steamId64,
        killerTeamKey: killerPlayer.teamKey,
        victimTeamKey: victimPlayer.teamKey,
        weapon: kill.killerActiveWeapon ?? kill.weapon,
        classification,
        fullHealth,
        victimHealthBefore,
        killerHealthBefore: killerHealthBefore(pkg, kill),
        ttkMs: burst.length > 0 ? msBetween(burst[0].tick, kill.tick, tickrate) : null,
        oneShotKill: burst.length === 1,
        killerPosition: kill.killerPosition,
        victimPosition: kill.victimPosition
      };
    })
    .sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick);
}

export function deriveOpeningDuels(pkg: DemoPackage): DuelFact[] {
  const seen = new Set<number>();
  const rows: DuelFact[] = [];
  for (const duel of deriveDuels(pkg)) {
    if (seen.has(duel.roundNumber)) continue;
    seen.add(duel.roundNumber);
    rows.push(duel);
  }
  return rows;
}
