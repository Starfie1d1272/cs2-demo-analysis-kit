import type { EvidenceRef } from "@cs2dak/contract";
import type { AnalysisFinding } from "@cs2dak/presentation";
import type { AnalysisContext } from "./analysis-context.js";
import type { FindingSnapshotV1 } from "./finding-snapshot";

export interface ReplaySessionState {
  roundNumber: number;
  playheadSeconds: number;
  selectedEvidenceIndex: number | null;
  playbackRate: number;
  layers: Record<string, boolean>;
  labelMode: "number" | "short" | "full";
  cameraByMap: Record<string, { zoom: number; panX: number; panY: number; floor?: "upper" | "lower" }>;
}

/** 当前导航历史中的证据返回点；不写 facts 或用户数据。 */
export interface EvidenceContinuation {
  sourceView: string;
  context: AnalysisContext;
  sourceKey?: string;
  evidence: EvidenceRef;
  finding?: Pick<AnalysisFinding, "key" | "title" | "statement">;
  snapshot?: FindingSnapshotV1;
  evidenceIndex?: number;
  replaySession?: ReplaySessionState;
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
    finding: input.finding ? { ...input.finding } : undefined,
    snapshot: input.snapshot ? structuredClone(input.snapshot) : undefined,
    evidenceIndex: input.evidenceIndex ?? 0,
    replaySession: input.replaySession ? structuredClone(input.replaySession) : undefined,
  };
}
