import type { EvidenceRef, AnalysisFinding } from '@cs2dak/presentation';
import type { StudioFrame } from './studio-navigation';

export interface EvidenceQueueItem {
  key: string;
  entryId: string;
  evidence: EvidenceRef;
}
export interface OpenEvidenceRequest {
  entryId: string;
  evidence: EvidenceRef;
  sourceKey?: string;
  finding?: Pick<AnalysisFinding, 'key' | 'title' | 'statement'>;
  queue?: EvidenceQueueItem[];
  selectedKey?: string;
}
export type OpenEvidence = (request: OpenEvidenceRequest) => void;
export interface EvidenceSession {
  sourceFrame: StudioFrame;
  queue: EvidenceQueueItem[];
  activeIndex: number;
  finding?: Pick<AnalysisFinding, 'key' | 'title' | 'statement'>;
  truncated: boolean;
}
export function createEvidenceSession(
  request: OpenEvidenceRequest,
  sourceFrame: StudioFrame,
): EvidenceSession {
  const key =
    request.selectedKey ??
    `${request.evidence.matchId}:${request.evidence.roundNumber}:${request.evidence.tick ?? ''}`;
  const fallback = { key, entryId: request.entryId, evidence: request.evidence };
  let queue = request.queue ?? [fallback];
  let index = request.selectedKey
    ? queue.findIndex((item) => item.key === request.selectedKey)
    : -1;
  if (index < 0)
    index = queue.findIndex(
      (item) =>
        item.entryId === request.entryId &&
        JSON.stringify(item.evidence) === JSON.stringify(request.evidence),
    );
  if (index < 0) {
    queue = [fallback];
    index = 0;
  }
  const truncated = queue.length > 200;
  const start = truncated ? Math.min(Math.max(0, index - 100), queue.length - 200) : 0;
  return {
    sourceFrame: structuredClone(sourceFrame),
    queue: structuredClone(queue.slice(start, start + 200)),
    activeIndex: index - start,
    finding: request.finding ? { ...request.finding } : undefined,
    truncated,
  };
}
