import type { DuelInsightsModel } from "@cs2dak/contract";
import type { UtilityValueSummary } from "@cs2dak/analytics";

/** Restrict already-computed rows to resolved identities without changing their facts. */
export function projectDuelPlayer(model: DuelInsightsModel, steamIds: readonly string[]): DuelInsightsModel {
  const ids = new Set(steamIds);
  const involvesPlayer = (row: DuelInsightsModel["duelRows"][number]) => ids.has(row.killerSteamId64) || ids.has(row.victimSteamId64);
  return { ...model, duelRows: model.duelRows.filter(involvesPlayer), openingRows: model.openingRows.filter(involvesPlayer), mechanicsRows: model.mechanicsRows.filter(row => ids.has(row.steamId64)) };
}

export function projectUtilityPlayer(summary: UtilityValueSummary, playerKey: string): UtilityValueSummary {
  return { ...summary, players: summary.players.filter(row => row.id === playerKey), bestFlashes: summary.bestFlashes.filter(row => row.playerId === playerKey), bestDamageRounds: summary.bestDamageRounds.filter(row => row.playerId === playerKey) };
}
