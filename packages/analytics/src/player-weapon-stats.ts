import { displayWeaponName } from '@cs2dak/presentation';
import type { PlayerWeaponStat } from './insights.js';

export interface PlayerWeaponCountRow {
  matchId: string;
  steamId64: string;
  weapon: string;
  kills: number;
  headshots: number;
}

/** Aggregate weapon counts against participation, independently of mechanics coverage. */
export function buildPlayerWeaponStatsFromRows(
  rows: readonly PlayerWeaponCountRow[],
  options: { steamIds: readonly string[]; eligibleMatchIds: readonly string[] },
): PlayerWeaponStat[] {
  const players = new Set(options.steamIds);
  const matches = new Set(options.eligibleMatchIds);
  const selected = rows.filter((row) => players.has(row.steamId64));
  for (const row of selected) {
    if (!matches.has(row.matchId))
      throw new Error(`Missing participation for weapon row: ${row.matchId}`);
  }
  const weapons = new Map<string, { kills: number; headshots: number }>();
  for (const row of selected) {
    const aggregate = weapons.get(row.weapon) ?? { kills: 0, headshots: 0 };
    aggregate.kills += row.kills;
    aggregate.headshots += row.headshots;
    weapons.set(row.weapon, aggregate);
  }
  return [...weapons]
    .map(([weapon, row]) => ({
      weapon,
      label: displayWeaponName(weapon),
      kills: row.kills,
      headshotPercent: row.kills > 0 ? Math.round((row.headshots / row.kills) * 1000) / 10 : null,
      killsPerMatch: Math.round((row.kills / matches.size) * 100) / 100,
    }))
    .sort((a, b) => b.kills - a.kills || a.label.localeCompare(b.label));
}
