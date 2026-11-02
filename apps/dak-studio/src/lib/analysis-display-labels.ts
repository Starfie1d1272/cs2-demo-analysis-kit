import type { AnalysisPageId } from "./studio-navigation";
import type { DuelTab, EvidenceFilter } from "./analysis-theme-state";

/** Shared display names; persisted page IDs remain unchanged. */
export const ANALYSIS_PAGE_LABELS: Record<AnalysisPageId, string> = {
  analysis: "总体",
  player: "选手",
  team: "队伍",
  "event-analysis": "赛事",
  duel: "交火与协同",
  economy: "经济与转化",
  utility: "道具分析",
  lineups: "点位",
  opening: "个人开局",
  control: "覆盖场",
  patterns: "战术模式",
  roles: "位置与职责",
};

export const DUEL_TAB_LABELS: Record<DuelTab, string> = {
  records: "交火证据",
  opening: "首次交火分布",
  mechanics: "枪法机制",
};

// These names mirror DuelView's evidence options.
export const EVIDENCE_FILTER_LABELS: Record<EvidenceFilter, string> = {
  contested_duel: "正面对枪击杀",
  suppressed_kill: "先手压制",
  caught_off_guard: "无有效视野击杀",
  low_hp: "非满血",
  third_party: "补枪干扰",
  all: "全部",
};
