import type { DemoPackage, RRSignals } from "@cs2dak/contract";
import { createResolverFromPackage } from "./resolve.js";

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

export function isActiveRoundTick(pkg: DemoPackage, roundNumber: number, tick: number): boolean {
  const roundRow = pkg.rounds.find((round) => round.roundNumber === roundNumber);
  return Boolean(roundRow && tick >= roundRow.freezeEndTick && tick <= roundRow.endTick);
}

export function activeDamages(pkg: DemoPackage): DemoPackage["damages"] {
  if (pkg.rounds.length === 0) return pkg.damages;
  return pkg.damages.filter((damage) => isActiveRoundTick(pkg, damage.roundNumber, damage.tick));
}

export function nameForPlayerIndex(pkg: DemoPackage, playerIndex: number | null | undefined): string | null {
  return createResolverFromPackage(pkg).nameByIndex(playerIndex);
}

export function sumDamageForPlayer(pkg: DemoPackage, playerIndex: number): number {
  const resolver = createResolverFromPackage(pkg);
  const playerTeam = resolver.byIndex(playerIndex).teamKey;
  return activeDamages(pkg)
    .filter((damage) =>
      damage.attackerIndex === playerIndex &&
      resolver.byIndexOrNull(damage.victimIndex)?.teamKey !== playerTeam
    )
    .reduce((sum, damage) => sum + damage.healthDamage, 0);
}

export function openingKillsForPlayer(pkg: DemoPackage, playerIndex: number): number {
  return [...firstKillMap(pkg).values()].filter((kill) => kill.killerIndex === playerIndex).length;
}

export function openingDeathsForPlayer(pkg: DemoPackage, playerIndex: number): number {
  return [...firstKillMap(pkg).values()].filter((kill) => kill.victimIndex === playerIndex).length;
}

export function multiKillRounds(kills: DemoPackage["kills"], target: number): number {
  const counts = new Map<number, number>();
  for (const kill of kills) {
    counts.set(kill.roundNumber, (counts.get(kill.roundNumber) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => (target === 5 ? count >= 5 : count === target)).length;
}

export function clutchSplit(
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
