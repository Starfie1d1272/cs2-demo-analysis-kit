import type { EvidenceRef } from "@cs2dak/contract";
import type { AnalysisFinding } from "@cs2dak/presentation";
import type { AnalysisContext } from "./analysis-context.js";

/** 当前导航历史中的证据返回点；不写 facts 或用户数据。 */
export interface EvidenceContinuation {
  sourceView: string;
  context: AnalysisContext;
  sourceKey?: string;
  localState?: Record<string, string | number | boolean | null>;
  evidence: EvidenceRef;
  finding?: Pick<AnalysisFinding, "key" | "title" | "statement">;
}

export type OpenEvidence = (
  entryId: string,
  evidence: EvidenceRef,
  sourceKey?: string,
  finding?: Pick<AnalysisFinding, "key" | "title" | "statement">,
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
    localState: input.localState ? { ...input.localState } : undefined,
    finding: input.finding ? { ...input.finding } : undefined,
  };
}
