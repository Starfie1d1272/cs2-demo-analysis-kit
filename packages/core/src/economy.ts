import type { EconomyPoint, TeamEconomyType } from "@cs2dak/contract";

/** 单一经济类型下的回合胜负统计。 */
export interface EconomyTypeStats {
  played: number;
  won: number;
  winRate: number;
}

/** 某队按经济类型分组的转化率，键为经济类型。 */
export type EconomyConversion = Partial<Record<TeamEconomyType, EconomyTypeStats>>;

/** 一场比赛两队的经济转化率。 */
export interface MatchEconomyConversion {
  teamA: EconomyConversion;
  teamB: EconomyConversion;
}

const ECONOMY_LABELS_CN: Record<string, string> = {
  pistol: "手枪局",
  eco: "纯ECO",
  semi: "半起",
  force: "强起",
  full: "全枪全弹",
  // conversion = 长枪局，与 full 同义，不单独区分。
  conversion: "全枪全弹",
};

/**
 * 经济类型中文标签（转化率面板 / 榜单展示用）。
 * 统一了 RivalHub `economy-series.ts` 的 `economyLabelCn`。未知值原样返回。
 */
export function economyLabelCn(type: string | null | undefined): string {
  if (!type) return "";
  return ECONOMY_LABELS_CN[type.toLowerCase()] ?? type;
}

function tally(
  acc: Map<string, { played: number; won: number }>,
  type: TeamEconomyType,
  won: boolean,
): void {
  const g = acc.get(type) ?? { played: 0, won: 0 };
  g.played += 1;
  if (won) g.won += 1;
  acc.set(type, g);
}

function finalize(acc: Map<string, { played: number; won: number }>): EconomyConversion {
  const out: EconomyConversion = {};
  for (const [type, s] of acc) {
    out[type as TeamEconomyType] = {
      played: s.played,
      won: s.won,
      winRate: s.played > 0 ? s.won / s.played : 0,
    };
  }
  return out;
}

/**
 * 经济转化率：按经济类型统计每队的回合胜率。
 *
 * 直接从 kit 的 `EconomyPoint[]` 派生——每个点已含两队经济类型 + 胜方，
 * 无需另一套松散输入。统一并取代 RivalHub `economy-conversion.ts` 的等价逻辑
 * （那边按队拆开传入，这里一次产出两队）。纯函数，无副作用。
 */
export function buildEconomyConversion(points: EconomyPoint[]): MatchEconomyConversion {
  const teamA = new Map<string, { played: number; won: number }>();
  const teamB = new Map<string, { played: number; won: number }>();
  for (const p of points) {
    tally(teamA, p.teamAEconomy, p.winnerTeamKey === "teamA");
    tally(teamB, p.teamBEconomy, p.winnerTeamKey === "teamB");
  }
  return { teamA: finalize(teamA), teamB: finalize(teamB) };
}
