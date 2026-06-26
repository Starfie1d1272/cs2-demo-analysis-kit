import type { DemoPackage } from "@cs2dak/contract";
export { groupBy } from "@cs2dak/core";

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
