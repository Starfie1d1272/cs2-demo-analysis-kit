import { doubleAwpAnalysisSchema, type DoubleAwpAnalysis, type TeamAwpRoundFact } from "@cs2dak/contract";

export interface DoubleAwpAnalysisOptions {
  teamKeyFor?: (matchId: string, rawTeamKey: "teamA" | "teamB") => string;
  playerKeyFor?: (matchId: string, playerIndex: number) => string;
}

function breakdown(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([key, rounds]) => ({ key, rounds })).sort((a, b) => b.rounds - a.rounds || a.key.localeCompare(b.key));
}

export function buildDoubleAwpAnalyses(rows: TeamAwpRoundFact[], options: DoubleAwpAnalysisOptions = {}): DoubleAwpAnalysis[] {
  const groups = new Map<string, TeamAwpRoundFact[]>();
  for (const row of rows) {
    const teamKey = options.teamKeyFor?.(row.matchId, row.teamKey) ?? `${row.matchId}:${row.teamKey}`;
    const key = `${teamKey}\t${row.side}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const [teamKey, side] = key.split("\t") as [string, "t" | "ct"];
    const qualified = group.filter((row) => row.economyType === "full");
    const double = qualified.filter((row) => row.roundStartAwpPlayerIndices.length >= 2);
    const comboCounts = new Map<string, { playerKeys: string[]; rounds: number }>();
    for (const row of double) {
      const playerKeys = row.roundStartAwpPlayerIndices.map((index) => options.playerKeyFor?.(row.matchId, index) ?? `${row.matchId}:player:${index}`).sort();
      const comboKey = playerKeys.join("|");
      const existing = comboCounts.get(comboKey) ?? { playerKeys, rounds: 0 };
      existing.rounds += 1;
      comboCounts.set(comboKey, existing);
    }
    const sumNullable = (pick: (row: TeamAwpRoundFact) => number | null): number | null => double.some((row) => pick(row) != null) ? double.reduce((sum, row) => sum + (pick(row) ?? 0), 0) : null;
    const status = group.every((row) => row.availability.replay === "missing") ? "unknown" : qualified.length < 6 ? "insufficient" : "ready";
    return doubleAwpAnalysisSchema.parse({
      version: "cs2-demo-analysis-kit/double-awp-analysis-2.0", teamKey, side, status,
      qualifiedRoundCount: qualified.length, doubleAwpRoundCount: double.length, eligibleRoundShare: qualified.length ? double.length / qualified.length : null,
      combinations: [...comboCounts.values()].sort((a, b) => b.rounds - a.rounds || a.playerKeys.join("|").localeCompare(b.playerKeys.join("|"))),
      mapDistribution: breakdown(double.map((row) => row.mapName)), scorePhaseDistribution: breakdown(double.map((row) => row.scorePhase)),
      economyDistribution: breakdown(double.map((row) => row.economyType)), opponentEconomyDistribution: breakdown(double.map((row) => row.opponentEconomyType)),
      wins: double.filter((row) => row.won).length, winRate: double.length ? double.filter((row) => row.won).length / double.length : null,
      openingKills: double.reduce((sum, row) => sum + row.openingKills, 0), openingDeaths: double.reduce((sum, row) => sum + row.openingDeaths, 0),
      roundStartAwpOwnerships: double.reduce((sum, row) => sum + row.roundStartAwpPlayerIndices.length, 0),
      activeAwpSeconds: sumNullable((row) => row.awpActiveSeconds), doubleAwpActiveSeconds: sumNullable((row) => row.doubleAwpActiveSeconds), awpKills: sumNullable((row) => row.awpKills), awpDamage: sumNullable((row) => row.awpDamage),
      evidence: double.slice(0, 8).map((row) => ({ matchId: row.matchId, roundNumber: row.roundNumber, reason: `${row.mapName} ${row.side.toUpperCase()} 双 AWP 长枪局`, role: "example" as const })),
      basis: ["仅按逐回合 round-start AWP ownership、存活 active time 和有效生命伤害描述双 AWP 使用；CT/T 分开。"],
      limitations: ["胜率和开局数据是条件统计，不表示双 AWP 导致结果。", ...(double.some((row) => row.awpDamage == null) ? ["当前 ZIP 缺少可用 damages 数据，AWP damage 保持 null。"] : [])],
    });
  }).sort((a, b) => a.teamKey.localeCompare(b.teamKey) || a.side.localeCompare(b.side));
}
