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

/** 淘汰赛 bracket 中单个节点的元数据（双败 / GSL lane-aware 布局用）。 */
export interface ElimNode {
  id: string;
  round: number;
  lane: "winner" | "loser" | "grand" | "single";
  label: string;
  nextWinNodeId?: string | null;
  nextLossNodeId?: string | null;
}

export interface ElimModel {
  columns: ElimColumn[];
  /**
   * Lane-aware 节点元数据（可选）。**存在性决定渲染模式**：
   * - 非空 → SVG lane-aware 布局（双败 / GSL），含晋级连线与 lane 分隔
   * - undefined / [] → DOM 列布局（单败 / 旧资产 / 制作器），以 MatchBox 列展示
   *
   * 未来考虑改为显式 `renderMode?: "dom" | "svg-lane"` 以消除隐式联合类型。
   */
  nodes?: ElimNode[];
}

