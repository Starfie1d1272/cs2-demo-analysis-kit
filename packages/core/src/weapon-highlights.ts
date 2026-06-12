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
  const statsMap = new Map(pkg.playerStats.map((row) => [row.playerIndex, row]));

  return pkg.players.map((player, playerIdx) => {
    const stats = statsMap.get(playerIdx);
    const kills = pkg.kills.filter((kill) => kill.killerIndex === playerIdx);
    const weaponCounts = new Map<string, PlayerWeaponHighlightFacts["weapons"][number]>();
    for (const kill of kills) {
      const weapon = killWeaponName(kill);
      const row = weaponCounts.get(weapon) ?? {
        weapon,
        kills: 0,
        headshotKills: 0,
        tradeKills: 0,
        noScopeKills: 0,
        throughSmokeKills: 0,
        wallbangKills: 0,
        penetratedObjects: 0
      };
      row.kills += 1;
      if (kill.headshot) row.headshotKills += 1;
      if (kill.tradeKill) row.tradeKills += 1;
      if (kill.noScope) row.noScopeKills += 1;
      if (kill.throughSmoke) row.throughSmokeKills += 1;
      if ((kill.penetratedObjects ?? 0) > 0) row.wallbangKills += 1;
      row.penetratedObjects += kill.penetratedObjects ?? 0;
      weaponCounts.set(weapon, row);
    }

    return playerWeaponHighlightFactsSchema.parse({
      steamId64: player.steamId64,
      totalKills: kills.length,
      weapons: [...weaponCounts.values()]
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
