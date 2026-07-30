import type { EvidenceRef } from "@cs2dak/contract";
import type { AnalysisFinding } from "@cs2dak/presentation";
import type { AnalysisContext } from "./analysis-context.js";
import type { FindingSnapshotV1 } from "./finding-snapshot";
import type { ReplayViewerSession } from "@cs2dak/react";

export interface ReplaySessionState extends ReplayViewerSession {
  selectedEvidenceIndex: number | null;
}

/** 当前导航历史中的证据返回点；不写 facts 或用户数据。 */
export interface EvidenceContinuation {
  sourceView: string;
  context: AnalysisContext;
  sourceKey?: string;
  evidence: EvidenceRef;
  finding?: Pick<AnalysisFinding, "key" | "title" | "statement"> | AnalysisFinding;
  snapshot?: FindingSnapshotV1;
  evidenceIndex?: number;
  replaySession?: ReplaySessionState;
}

export type OpenEvidence = (
  entryId: string,
  evidence: EvidenceRef,
  sourceKey?: string,
  finding?: AnalysisFinding,
) => void;

export function createEvidenceContinuation(input: EvidenceContinuation): EvidenceContinuation {
  return {
    ...input,
    context: {
      ...input.context,
      corpus: { ...input.context.corpus },
      roles: { ...input.context.roles },
    },
    evidence: { ...input.evidence },
    finding: input.finding ? { ...input.finding } : undefined,
    snapshot: input.snapshot ? structuredClone(input.snapshot) : undefined,
    evidenceIndex: input.evidenceIndex ?? 0,
    replaySession: input.replaySession ? structuredClone(input.replaySession) : undefined,
  };
}
