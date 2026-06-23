/**
 * 赛事 bracket 的中性数据模型 —— 观看侧（从比赛结果推算）与制作器（从框架槽位）共用同一套
 * 渲染。瑞士轮按战绩组（Buchholz）成列 + 晋级/淘汰终列；淘汰赛按晋级轮次成列。
 */

export interface BracketCell {
  key: string;
  teamA: string | null;
  teamB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: "A" | "B" | null;
  date: string | null;
  /** 观看侧：点开该场的 demo entry。 */
  entryIds?: string[];
  /** 制作器：待填槽位（点击附加 demo）。 */
  empty?: boolean;
}

export interface SwissGroup {
  /** 战绩组标签，如 "1-0"。 */
  record: string;
  matches: BracketCell[];
  /** 制作器：该战绩组可继续添加比赛（携带 slot id）。 */
  addSlotId?: string;
}

export interface SwissColumn {
  round: number;
  groups: SwissGroup[];
}

export interface SwissModel {
  columns: SwissColumn[];
  advanced: { team: string; record: string }[];
  eliminated: { team: string; record: string }[];
  winsTarget: number;
  lossTarget: number;
}

export interface ElimColumn {
  round: number;
  label: string;
  matches: BracketCell[];
}

export interface ElimModel {
  columns: ElimColumn[];
}

/**
 * Bracket 渲染器所需的最小子集：一场系列赛的基本信息。
 * Studio 的 StudioSeriesRecord 与该接口兼容，无需额外适配。
 */
export interface BracketSeries {
  bracketNodeId?: string | null;
  teamAName: string;
  teamBName: string;
  scoreA?: number | null;
  scoreB?: number | null;
  status?: string;
}
