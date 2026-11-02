import { buildTacticalClusters, type TacticalPatternRow } from "@cs2dak/tactics";
import { formatTacticalClusterName } from "@cs2dak/presentation";
export interface ObservedMapPoolSideSummary { matchCount: number; roundCount: number; wins: number; winRatePercent: number | null }
export interface ObservedMapPoolRow { mapName: string; own: ObservedMapPoolSideSummary; opponent: ObservedMapPoolSideSummary; topOpponentPatternNames: string[] }
export function buildObservedMapPoolComparison(input: { mapNames: readonly string[]; ownRounds: readonly TacticalPatternRow[]; opponentRounds: readonly TacticalPatternRow[] }): ObservedMapPoolRow[] {
  const summarize = (rows: readonly TacticalPatternRow[]): ObservedMapPoolSideSummary => {
    const rounds = new Map<string, TacticalPatternRow>();
    for (const row of rows) rounds.set(JSON.stringify([row.matchId, row.roundNumber]), row);
    const unique = [...rounds.values()], wins = unique.filter(row => row.won).length;
    return { matchCount: new Set(unique.map(row => row.matchId)).size, roundCount: unique.length, wins, winRatePercent: unique.length ? wins / unique.length * 100 : null };
  };
  return [...new Set(input.mapNames)].map(mapName => {
    const own = input.ownRounds.filter(row => row.mapName === mapName);
    const opponent = input.opponentRounds.filter(row => row.mapName === mapName);
    return { mapName, own: summarize(own), opponent: summarize(opponent), topOpponentPatternNames: buildTacticalClusters(opponent).slice(0, 3).map(formatTacticalClusterName) };
  });
}
