import type { CoachPlaybookItem } from './coach-playbook';

export const PLAYBOOK_KIND_LABELS: Record<CoachPlaybookItem['kind'], string> = {
  default: '默认布局',
  protocol: '应对预案',
  play: '执行战术',
};
