import {
  playerWeaponHighlightFactsSchema,
  type DemoPackage,
  type PlayerWeaponHighlightFacts
} from "@cs2dak/contract";
import { normalizeDemoPackage } from "./normalize.js";
import { killWeaponName } from "./utils.js";

export function derivePlayerWeaponHighlights(input: unknown): PlayerWeaponHighlightFacts[] {
  return buildPlayerWeaponHighlights(normalizeDemoPackage(input));
}

export function buildPlayerWeaponHighlights(pkg: DemoPackage): PlayerWeaponHighlightFacts[] {
  const statsBySteamId = new Map(pkg.playerStats.map((row) => [row.steamId64, row]));

  return pkg.players.map((player) => {
    const stats = statsBySteamId.get(player.steamId64);
    const kills = pkg.kills.filter((kill) => kill.killerSteamId64 === player.steamId64);
    const weaponCounts = new Map<string, number>();
    for (const kill of kills) {
      const weapon = killWeaponName(kill);
      weaponCounts.set(weapon, (weaponCounts.get(weapon) ?? 0) + 1);
    }

    return playerWeaponHighlightFactsSchema.parse({
      steamId64: player.steamId64,
      totalKills: kills.length,
      weapons: [...weaponCounts.entries()]
        .map(([weapon, count]) => ({ weapon, kills: count }))
        .sort((a, b) => b.kills - a.kills || a.weapon.localeCompare(b.weapon)),
      highlights: {
        wallbangKills: stats?.wallbangKillCount ?? kills.filter((kill) => (kill.penetratedObjects ?? 0) > 0).length,
        noScopeKills: stats?.noScopeKillCount ?? kills.filter((kill) => kill.noScope).length,
        throughSmokeKills: kills.filter((kill) => kill.throughSmoke).length,
        collateralKills: stats?.collateralKillCount ?? null
      }
    });
  });
}
