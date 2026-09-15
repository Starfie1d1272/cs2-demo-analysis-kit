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

/**
 * Phase-specific damage window for mechanics/duel consumers. Performance
 * facts deliberately do not use this filter: the frozen v3 damage section is
 * the canonical input for aggregate player damage.
 */
export function activePhaseDamages(pkg: DemoPackage): DemoPackage["damages"] {
  if (pkg.rounds.length === 0) return pkg.damages;
  const roundsByNumber = new Map(pkg.rounds.map((r) => [r.roundNumber, r]));
  return pkg.damages.filter((damage) => {
    const roundRow = roundsByNumber.get(damage.roundNumber);
    return Boolean(roundRow && damage.tick >= roundRow.freezeEndTick && damage.tick <= roundRow.endTick);
  });
}

/** @deprecated Use activePhaseDamages; this name remains for package users. */
export function activeDamages(pkg: DemoPackage): DemoPackage["damages"] {
  return activePhaseDamages(pkg);
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

/** Compatibility name; weapon attribution is always sourced from kill.weapon. */
export function killWeaponName(kill: DemoPackage["kills"][number]): string {
  return normalizeWeapon(kill.weapon);
}

export function nameForSteamId(pkg: DemoPackage, steamId: string | null): string | null {
  if (!steamId) {
    return null;
  }
  return pkg.players.find((player) => player.steamId64 === steamId)?.name ?? steamId;
}
