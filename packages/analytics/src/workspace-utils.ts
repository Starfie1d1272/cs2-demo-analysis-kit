import type { DemoPackage } from '@cs2dak/contract';

export { groupBy } from '@cs2dak/core';

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function nameForSteamId(pkg: DemoPackage, steamId: string | null): string | null {
  if (!steamId) return null;
  return pkg.players.find((player) => player.steamId64 === steamId)?.name ?? steamId;
}

export { normalizeWeapon, isNamedWeapon } from '@cs2dak/presentation';
