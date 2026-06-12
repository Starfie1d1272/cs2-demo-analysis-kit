import type { DemoPackage, PackageDamage, PackageShot } from "@cs2dak/contract";
import { killWeaponName, normalizeWeapon } from "./utils.js";

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

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function tickrateOf(pkg: DemoPackage): number {
  return pkg.match.tickrate || 64;
}

function speed(shot: PackageShot): number {
  return Math.hypot(shot.velocity.x, shot.velocity.y);
}

function accurateSpeedForWeapon(weapon: string): number {
  return WEAPON_ACCURATE_SPEED[normalizeWeapon(weapon)] ?? 80;
}

function isFirearmWeapon(weapon: string): boolean {
  return FIREARM_WEAPONS.has(normalizeWeapon(weapon));
}

function hasDamageMatch(damages: PackageDamage[], shot: PackageShot): boolean {
  const shotWeapon = normalizeWeapon(shot.weapon);
  return damages.some(
    (damage) =>
      damage.roundNumber === shot.roundNumber &&
      damage.attackerSteamId64 === shot.steamId64 &&
      normalizeWeapon(damage.weapon) === shotWeapon &&
      Math.abs(damage.tick - shot.tick) <= 1
  );
}

function splitBursts(shots: PackageShot[], tickrate: number): PackageShot[][] {
  const maxGap = Math.round(BURST_GAP_MS / 1000 * tickrate);
  const bursts: PackageShot[][] = [];
  for (const shot of [...shots].sort((a, b) => a.tick - b.tick)) {
    const current = bursts[bursts.length - 1];
    if (!current || shot.tick - current[current.length - 1].tick >= maxGap) bursts.push([shot]);
    else current.push(shot);
  }
  return bursts;
}

function bucketBursts(bursts: PackageShot[][]): BurstLengthBuckets {
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

function counterStrafePercent(shots: PackageShot[]): number | null {
  if (shots.length === 0) return null;
  if (shots.every((shot) => speed(shot) === 0)) return null;
  const counterStrafeShots = shots.filter((shot) => speed(shot) <= accurateSpeedForWeapon(shot.weapon));
  return percent(counterStrafeShots.length, shots.length);
}

export function derivePlayerMechanics(pkg: DemoPackage): PlayerMechanicsFact[] {
  if (!pkg.shots || pkg.shots.length === 0) return [];
  const tickrate = tickrateOf(pkg);
  const playerById = new Map(pkg.players.map((player) => [player.steamId64, player]));
  const killCounts = new Map<string, number>();
  for (const kill of pkg.kills) {
    if (!kill.killerSteamId64 || kill.killerTeamKey === kill.victimTeamKey) continue;
    const weapon = normalizeWeapon(killWeaponName(kill));
    if (!isFirearmWeapon(weapon)) continue;
    const key = `${kill.killerSteamId64}:${weapon}`;
    killCounts.set(key, (killCounts.get(key) ?? 0) + 1);
  }
  const grouped = new Map<string, PackageShot[]>();
  for (const shot of pkg.shots) {
    const weapon = normalizeWeapon(shot.weapon);
    if (!isFirearmWeapon(weapon)) continue;
    const key = `${shot.steamId64}:${weapon}`;
    const list = grouped.get(key) ?? [];
    list.push({ ...shot, weapon });
    grouped.set(key, list);
  }

  return [...grouped.entries()]
    .map(([key, shots]) => {
      const [steamId64, weapon] = key.split(":");
      const player = playerById.get(steamId64);
      const bursts = splitBursts(shots, tickrate);
      const firstShots = bursts.map((burst) => burst[0]);
      const sprayShots = bursts.flatMap((burst) => burst.slice(3));
      return {
        steamId64,
        playerName: player?.name ?? steamId64,
        teamKey: player?.teamKey ?? shots[0].teamKey,
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
