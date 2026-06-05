import type { DemoPackage } from "@cs2dak/contract";

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function groupBy<T, K>(rows: T[], keyFor: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const current = grouped.get(key);
    if (current) current.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

export function normalizeWeapon(weapon: string): string {
  return weapon.trim().toLowerCase().replace(/^weapon_/, "");
}

export function isNamedWeapon(value: string): boolean {
  const normalized = normalizeWeapon(value);
  return normalized.length > 0 && !/^\d+$/.test(normalized) && !["nan", "none", "null"].includes(normalized);
}

export function nameForSteamId(pkg: DemoPackage, steamId: string | null): string | null {
  if (!steamId) return null;
  return pkg.players.find((player) => player.steamId64 === steamId)?.name ?? steamId;
}
