import type { DemoPackage, Side, TeamKey } from "@cs2dak/contract";

export interface SideWinRateStats {
  played: number;
  won: number;
  winRate: number;
}

export type TeamSideWinRates = Record<TeamKey, Partial<Record<Side, SideWinRateStats>>>;

interface SideRoundResult {
  side: Side;
  won: boolean;
}

function aggregateSideWinRates(rows: SideRoundResult[]): Partial<Record<Side, SideWinRateStats>> {
  const groups = new Map<Side, { played: number; won: number }>();
  for (const row of rows) {
    const group = groups.get(row.side) ?? { played: 0, won: 0 };
    group.played += 1;
    if (row.won) group.won += 1;
    groups.set(row.side, group);
  }

  return Object.fromEntries(
    [...groups.entries()].map(([side, stats]) => [
      side,
      { ...stats, winRate: stats.played > 0 ? stats.won / stats.played : 0 }
    ])
  );
}

/**
 * 按 T/CT side 汇总一场比赛中两队的回合胜率。
 *
 * 取代产品从数据库行重新拼装的 half-side 聚合；产品只负责选择 DemoPackage。
 */
export function buildTeamSideWinRates(pkg: DemoPackage): TeamSideWinRates {
  return {
    teamA: aggregateSideWinRates(pkg.rounds.map((round) => ({
      side: round.teamASide,
      won: round.winnerTeamKey === "teamA"
    }))),
    teamB: aggregateSideWinRates(pkg.rounds.map((round) => ({
      side: round.teamBSide,
      won: round.winnerTeamKey === "teamB"
    })))
  };
}
