import type { DemoPackage, RRSignals } from "@cs2dak/contract";

export type BuyDeltaBuckets = NonNullable<RRSignals["combat"]["killsByBuyDelta"]>;
export type ManStateBuckets = NonNullable<RRSignals["combat"]["killsByManState"]>;
export type ObjectiveBuckets = RRSignals["objective"];
export type UtilityBuckets = RRSignals["utility"];

export const BUY_DELTA_EVEN_THRESHOLD = 1000;

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function formatClock(seconds: number): string {
  const clamped = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(clamped / 60);
  const remainder = clamped % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function getOrInit<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
  const next = create();
  map.set(key, next);
  return next;
}

export function groupBy<T, K>(rows: T[], keyFor: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const bucket = out.get(key) ?? [];
    bucket.push(row);
    out.set(key, bucket);
  }
  return out;
}

export function zeroBuyDelta(): BuyDeltaBuckets {
  return { disadvantage: 0, even: 0, advantage: 0 };
}

export function zeroManState(): ManStateBuckets {
  return { manDown: 0, even: 0, manUp: 0 };
}

export function firstKillMap(pkg: DemoPackage): Map<number, DemoPackage["kills"][number]> {
  const firstKillByRound = new Map<number, DemoPackage["kills"][number]>();
  for (const kill of [...pkg.kills].sort((a, b) => a.tick - b.tick)) {
    if (!firstKillByRound.has(kill.roundNumber)) {
      firstKillByRound.set(kill.roundNumber, kill);
    }
  }
  return firstKillByRound;
}

export function sumDamageForPlayer(pkg: DemoPackage, steamId64: string): number {
  return pkg.damages
    .filter((damage) => damage.attackerSteamId64 === steamId64 && damage.attackerTeamKey !== damage.victimTeamKey)
    .reduce((sum, damage) => sum + damage.healthDamage, 0);
}

export function openingKillsForPlayer(pkg: DemoPackage, steamId64: string): number {
  return [...firstKillMap(pkg).values()].filter((kill) => kill.killerSteamId64 === steamId64).length;
}

export function openingDeathsForPlayer(pkg: DemoPackage, steamId64: string): number {
  return [...firstKillMap(pkg).values()].filter((kill) => kill.victimSteamId64 === steamId64).length;
}

export function multiKillRounds(kills: DemoPackage["kills"], target: number): number {
  const counts = new Map<number, number>();
  for (const kill of kills) {
    counts.set(kill.roundNumber, (counts.get(kill.roundNumber) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => (target === 5 ? count >= 5 : count === target)).length;
}

export function clutchSplit(
  statsCount: number | undefined,
  statsWon: number | undefined,
  clutches: DemoPackage["clutches"],
  opponentCount: number
) {
  const rows = clutches.filter((row) => row.opponentCount === opponentCount);
  return {
    count: statsCount ?? rows.length,
    won: statsWon ?? rows.filter((row) => row.won).length
  };
}

export function clutchSplitV2(
  count: number | undefined,
  won: number | undefined,
  rows: DemoPackage["clutches"],
  opponentCount: number
) {
  const filtered = rows.filter((row) => row.opponentCount === opponentCount);
  return {
    count: count ?? filtered.length,
    won: won ?? filtered.filter((row) => row.won).length
  };
}

export function normalizeWeapon(weapon: string): string {
  return weapon.toLowerCase().replace(/^weapon_/, "");
}

export function isNamedWeapon(value: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(value);
}

export function isUtilityWeapon(weapon: string): boolean {
  return ["hegrenade", "inferno", "molotov", "incgrenade"].includes(normalizeWeapon(weapon));
}

export function killWeaponName(kill: DemoPackage["kills"][number]): string {
  const active = kill.killerActiveWeapon ? normalizeWeapon(kill.killerActiveWeapon) : "";
  return isNamedWeapon(active) ? active : normalizeWeapon(kill.weapon);
}

export function nameForSteamId(pkg: DemoPackage, steamId: string | null): string | null {
  if (!steamId) {
    return null;
  }
  return pkg.players.find((player) => player.steamId64 === steamId)?.name ?? steamId;
}
