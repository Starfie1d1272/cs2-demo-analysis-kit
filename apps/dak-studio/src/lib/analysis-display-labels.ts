import type { AnalysisPageId } from './studio-navigation';
import type { DuelTab, EvidenceFilter } from './analysis-theme-state';

/** Shared display names; persisted page IDs remain unchanged. */
export const ANALYSIS_PAGE_LABELS: Record<AnalysisPageId, string> = {
  analysis: '总体',
  player: '选手',
  team: '队伍',
  'event-analysis': '赛事',
  duel: '交火与协同',
  economy: '经济与转化',
  utility: '道具分析',
  lineups: '点位',
  opening: '个人开局',
  control: '覆盖场',
  patterns: '战术模式',
  roles: '位置与职责',
};

export const DUEL_TAB_LABELS: Record<DuelTab, string> = {
  records: '交火证据',
  opening: '首次交火分布',
  mechanics: '枪法机制',
};

export const EVIDENCE_FILTERS: Array<{
  key: EvidenceFilter;
  label: string;
  description: string;
}> = [
  {
    key: 'contested_duel',
    label: '正面对枪击杀',
    description: '受害者造成伤害，或可见击杀者时开火',
  },
  {
    key: 'suppressed_kill',
    label: '先手压制',
    description: '受害者死前获得过有效可见机会但没有有效还手',
  },
  {
    key: 'caught_off_guard',
    label: '无有效视野击杀',
    description: '受害者死前没有获得有效可见机会',
  },
  {
    key: 'low_hp',
    label: '非满血',
    description: '受害者死亡前血量低于 80，保留证据但不进满血击杀耗时分布',
  },
  {
    key: 'third_party',
    label: '补枪干扰',
    description: '第三方在 ±2s 内造成关键伤害，击杀耗时不计入分布',
  },
  { key: 'all', label: '全部', description: '保留全部证据队列' },
];
