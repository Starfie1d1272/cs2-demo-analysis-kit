import type { DemoPackage, PackageDamage } from "@cs2dak/contract";
import { decodeDelta } from "@cs2dak/contract";
import { createResolverFromPackage } from "./resolve.js";
import { killWeaponName, normalizeWeapon, round } from "./utils.js";

const BURST_GAP_MS = 250;

const WEAPON_ACCURATE_SPEED: Record<string, number> = {
  ak47: 73,
  m4a1: 76,
  m4a1_silencer: 76,
  awp: 68,
  ssg08: 78,
  deagle: 78
};

const FIREARM_WEAPONS = new Set([
  "ak47",
  "m4a1",
  "m4a4",
  "m4a1_silencer",
  "aug",
  "sg556",
  "sg553",
  "famas",
  "galilar",
  "galil",
  "awp",
  "ssg08",
  "scar20",
  "g3sg1",
  "deagle",
  "revolver",
  "glock",
  "usp_silencer",
  "usp",
  "hkp2000",
  "p2000",
  "p250",
  "fiveseven",
  "tec9",
  "cz75a",
  "cz75",
  "elite",
  "mp9",
  "mp7",
  "mp5sd",
  "ump45",
  "p90",
  "bizon",
  "mac10",
  "nova",
  "xm1014",
  "mag7",
  "sawedoff",
  "m249",
  "negev"
]);

export interface BurstLengthBuckets {
  single: number;
  short: number;
  medium: number;
  long: number;
}

export interface PlayerMechanicsFact {
  steamId64: string;
  playerName: string;
  teamKey: string;
  weapon: string;
  burstCount: number;
  killCount: number;
  shotCount: number;
  firstShotAccuracyPercent: number | null;
  sprayAccuracyPercent: number | null;
  counterStrafeSuccessPercent: number | null;
  burstLengthBuckets: BurstLengthBuckets;
}

interface FlatShot {
  roundNumber: number;
  playerIndex: number;
  tick: number;
  weapon: string;
  vx: number;
  vy: number;
}

function tickrateOf(pkg: DemoPackage): number {
  return pkg.match.tickrate || 64;
}

function speed(shot: FlatShot): number {
  return Math.hypot(shot.vx, shot.vy);
}

function accurateSpeedForWeapon(weapon: string): number {
  return WEAPON_ACCURATE_SPEED[normalizeWeapon(weapon)] ?? 80;
}

function isFirearmWeapon(weapon: string): boolean {
  return FIREARM_WEAPONS.has(normalizeWeapon(weapon));
}

function hasDamageMatch(damages: PackageDamage[], shot: FlatShot): boolean {
  const shotWeapon = normalizeWeapon(shot.weapon);
  return damages.some(
    (damage) =>
      damage.roundNumber === shot.roundNumber &&
      damage.attackerIndex === shot.playerIndex &&
      normalizeWeapon(damage.weapon) === shotWeapon &&
      Math.abs(damage.tick - shot.tick) <= 1
  );
}

function splitBursts(shots: FlatShot[], tickrate: number): FlatShot[][] {
  const maxGap = Math.round(BURST_GAP_MS / 1000 * tickrate);
  const bursts: FlatShot[][] = [];
  for (const shot of [...shots].sort((a, b) => a.tick - b.tick)) {
    const current = bursts[bursts.length - 1];
    if (!current || shot.tick - current[current.length - 1].tick >= maxGap) bursts.push([shot]);
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

function percent(count: number, total: number): number | null {
  return total > 0 ? round(count / total * 100, 1) : null;
}

function counterStrafePercent(shots: FlatShot[]): number | null {
  if (shots.length === 0) return null;
  if (shots.every((shot) => speed(shot) === 0)) return null;
  const counterStrafeShots = shots.filter((shot) => speed(shot) <= accurateSpeedForWeapon(shot.weapon));
  return percent(counterStrafeShots.length, shots.length);
}

export function derivePlayerMechanics(pkg: DemoPackage): PlayerMechanicsFact[] {
  const resolver = createResolverFromPackage(pkg);
  if (!pkg.shots || pkg.shots.tracks.length === 0) return [];
  const tickrate = tickrateOf(pkg);
  const { weaponDict, tracks } = pkg.shots;

  const killCounts = new Map<string, number>();
  for (const kill of pkg.kills) {
    if (kill.killerIndex === null) continue;
    const killerPlayer = resolver.byIndexOrNull(kill.killerIndex);
    const victimPlayer = resolver.byIndexOrNull(kill.victimIndex);
    if (!killerPlayer || !victimPlayer || killerPlayer.teamKey === victimPlayer.teamKey) continue;
    const weapon = normalizeWeapon(killWeaponName(kill));
    if (!isFirearmWeapon(weapon)) continue;
    const key = `${kill.killerIndex}:${weapon}`;
    killCounts.set(key, (killCounts.get(key) ?? 0) + 1);
  }

  const grouped = new Map<string, FlatShot[]>();
  for (const track of tracks) {
    const trackTicks = decodeDelta(track.tick);
    for (let i = 0; i < trackTicks.length; i++) {
      const weaponIdx = track.weapon[i] ?? -1;
      const weapon = weaponIdx >= 0 ? normalizeWeapon(weaponDict[weaponIdx] ?? "") : "";
      if (!isFirearmWeapon(weapon)) continue;
      const key = `${track.playerIndex}:${weapon}`;
      const list = grouped.get(key) ?? [];
      list.push({
        roundNumber: track.roundNumber,
        playerIndex: track.playerIndex,
        tick: trackTicks[i]!,
        weapon,
        vx: track.vx[i] ?? 0,
        vy: track.vy[i] ?? 0
      });
      grouped.set(key, list);
    }
  }

  return [...grouped.entries()]
    .map(([key, shots]) => {
      const colonIdx = key.indexOf(":");
      const playerIdx = parseInt(key.slice(0, colonIdx));
      const weapon = key.slice(colonIdx + 1);
      const player = resolver.byIndexOrNull(playerIdx);
      const bursts = splitBursts(shots, tickrate);
      const firstShots = bursts.map((burst) => burst[0]!);
      const sprayShots = bursts.flatMap((burst) => burst.slice(3));
      return {
        steamId64: player?.steamId64 ?? String(playerIdx),
        playerName: player?.name ?? String(playerIdx),
        teamKey: player?.teamKey ?? "teamA",
        weapon,
        killCount: killCounts.get(key) ?? 0,
        burstCount: bursts.length,
        shotCount: shots.length,
        firstShotAccuracyPercent: percent(firstShots.filter((shot) => hasDamageMatch(pkg.damages, shot)).length, firstShots.length),
        sprayAccuracyPercent: percent(sprayShots.filter((shot) => hasDamageMatch(pkg.damages, shot)).length, sprayShots.length),
        counterStrafeSuccessPercent: counterStrafePercent(shots),
        burstLengthBuckets: bucketBursts(bursts)
      };
    })
    .sort((a, b) => b.killCount - a.killCount || b.shotCount - a.shotCount || a.playerName.localeCompare(b.playerName));
}
