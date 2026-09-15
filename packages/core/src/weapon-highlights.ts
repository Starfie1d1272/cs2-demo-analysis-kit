import {
  playerWeaponHighlightFactsSchema,
  type DemoPackage,
  type PlayerWeaponHighlightFacts
} from "@cs2dak/contract";
import { normalizeDemoPackage } from "./normalize.js";
import {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  type PlayerRoundPerformanceFacts,
} from "./performance-facts.js";

export function derivePlayerWeaponHighlights(input: unknown, performanceFacts?: PlayerRoundPerformanceFacts): PlayerWeaponHighlightFacts[] {
  return buildPlayerWeaponHighlights(normalizeDemoPackage(input), performanceFacts);
}

export function buildPlayerWeaponHighlights(
  pkg: DemoPackage,
  performanceFacts: PlayerRoundPerformanceFacts = buildPlayerRoundPerformanceFacts(pkg),
): PlayerWeaponHighlightFacts[] {
  const performanceBySteamId = aggregatePlayerRoundPerformanceFacts(performanceFacts);
  const playerStatsByIndex = new Map(pkg.playerStats.map((row) => [row.playerIndex, row]));

  return pkg.players.map((player, playerIdx) => {
    const stats = playerStatsByIndex.get(playerIdx);
    const summary = performanceBySteamId.get(player.steamId64);

    return playerWeaponHighlightFactsSchema.parse({
      steamId64: player.steamId64,
      totalKills: summary?.kills ?? 0,
      weapons: summary?.weapons.slice().sort((a, b) => b.kills - a.kills || a.weapon.localeCompare(b.weapon)) ?? [],
      highlights: {
        wallbangKills: summary?.weapons.reduce((sum, weapon) => sum + weapon.wallbangKills, 0) ?? 0,
        noScopeKills: summary?.weapons.reduce((sum, weapon) => sum + weapon.noScopeKills, 0) ?? 0,
        throughSmokeKills: summary?.weapons.reduce((sum, weapon) => sum + weapon.throughSmokeKills, 0) ?? 0,
        collateralKills: stats?.collateralKillCount ?? null
      }
    });
  });
}
