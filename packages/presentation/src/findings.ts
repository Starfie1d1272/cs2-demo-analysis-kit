import type { EvidenceRef } from './models/evidence-view.js';

export type FindingOrigin = 'system' | 'user';

/** 产品中立的、可交给证据查看器或行动面的系统结论。 */
export interface AnalysisFinding {
  /** capability 内稳定的 key，不承担跨产品持久化 identity。 */
  key: string;
  capability: 'mistake-review' | 'duel' | 'utility' | 'tactical';
  producerVersion: string;
  origin: FindingOrigin;
  title: string;
  statement: string;
  subject: { id?: string; label: string };
  relationship?: string;
  sample: {
    label: string;
    numerator?: number;
    denominator?: number;
    coverage?: string;
  };
  baseline: string | null;
  evidence: EvidenceRef[];
  basis: string[];
  limitations: string[];
}

export interface FindingSubject {
  id?: string;
  label: string;
}
