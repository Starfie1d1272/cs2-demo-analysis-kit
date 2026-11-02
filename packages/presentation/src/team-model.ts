import type { MapRoleStatusView } from "./models/map-role-view.js";

export interface TeamComparisonPlayerRow {
  teamName: string;
  steamId64: string;
  name: string;
  rr: number | null;
  adr: number | null;
  kast: number | null;
  kpr: number | null;
  dpr: number | null;
}

/** 该队某场比赛的概览（赛前侦察用，可点跳回放）。 */
export interface TeamComparisonSideMatch {
  matchId: string;
  mapName: string;
  opponent: string;
  roundsWon: number;
  roundsLost: number;
  won: boolean;
}

export interface TeamComparisonSide {
  teamKey?: string;
  teamName: string;
  matchCount: number;
  players: TeamComparisonPlayerRow[];
  weaponPreference: Array<{ weapon: string; label: string; kills: number; sharePercent: number }>;
  economyWinRate: Array<{ economyType: string; rounds: number; wins: number; winRatePercent: number | null }>;
  /** 该队在 cohort 内打过的比赛（按场次自然序）。 */
  matches: TeamComparisonSideMatch[];
}

export interface TeamComparisonModel {
  /** 0.2：服务"赛前侦察"——两队各自跨全部己方比赛聚合，无需互相交手；去掉旧的噪声 evidence，改 per-team 比赛列表。 */
  version: "cs2-demo-analysis-kit/team-comparison-0.2";
  teams: [TeamComparisonSide, TeamComparisonSide] | [];
  radar: Array<{ metric: string; label: string; a: number | null; b: number | null; delta: number | null }>;
  /** cohort 内全部队伍（按场次降序），供 UI 选 A/B 两队。 */
  availableTeams: Array<{ key?: string; name: string; label?: string; matches: number }>;
}

/** 队伍总览只编排已有跨场事实；不推导强弱项、因果或对策。 */
export interface TeamOverviewModel {
  version: "cs2-demo-analysis-kit/team-overview-0.2";
  teamName: string;
  matchCount: number;
  wins: number;
  losses: number;
  roundsWon: number;
  roundsLost: number;
  maps: Array<{ mapName: string; matches: number; wins: number; losses: number; roundsWon: number; roundsLost: number }>;
  roster: TeamComparisonPlayerRow[];
  weaponPreference: TeamComparisonSide["weaponPreference"];
  economyWinRate: TeamComparisonSide["economyWinRate"];
  matches: TeamComparisonSideMatch[];
  /** Declaration-neutral map/side responsibility summary; consumers may render the full matrices separately. */
  roleMatrixSummary: Array<{ mapName: string; side: "t" | "ct"; status: MapRoleStatusView; positionConcentration: number | null; unstableCoverage: boolean }>;
}
