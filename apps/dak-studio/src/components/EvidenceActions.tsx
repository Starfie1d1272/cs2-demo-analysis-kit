import type { ReactNode } from "react";
import { EvidenceLink } from "@cs2dak/react";
import type { EvidenceRef } from "@cs2dak/contract";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import type { OpenEvidence } from "../lib/evidence-continuation";
import type { AnalysisFinding } from "@cs2dak/presentation";

type MatchTarget = { roundNumber: number; tick?: number };

export function EvidenceActions({
  entry,
  target,
  onOpenMatch,
  onWatchDemo,
  onOpenEvidence,
  children,
  hint,
  reason,
  sourceKey,
  finding,
}: {
  entry: StudioDemoEntry | null | undefined;
  target: MatchTarget;
  onOpenMatch: (entryId: string, target?: MatchTarget) => void;
  onWatchDemo?: (entryId: string, target?: MatchTarget) => void;
  onOpenEvidence?: OpenEvidence;
  children: ReactNode;
  hint?: string;
  reason?: string;
  sourceKey?: string;
  finding?: Pick<AnalysisFinding, "key" | "title" | "statement">;
}) {
  const evidence: EvidenceRef | null = entry
    ? { matchId: matchIdForEntry(entry), ...target, reason: reason ?? hint ?? "查看当前分析证据", role: "example" }
    : null;
  return (
    <span id={sourceKey} className="stu-evidence-actions">
      <EvidenceLink disabled={!entry} hint={hint} onOpen={() => entry && (onOpenEvidence && evidence ? onOpenEvidence(entry.id, evidence, sourceKey, finding) : onOpenMatch(entry.id, target))}>
        {children}
      </EvidenceLink>
      {entry?.sourceDemPath && onWatchDemo && (
        <button type="button" className="stu-button-sm" onClick={() => onWatchDemo(entry.id, target)}>
          进游戏
        </button>
      )}
    </span>
  );
}
