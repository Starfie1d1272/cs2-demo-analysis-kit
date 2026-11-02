import type { ReactNode } from "react";
import { EvidenceLink } from "@cs2dak/react";
import type { EvidenceRef } from "@cs2dak/presentation";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/demo-entry";
import type { OpenEvidence } from "../lib/evidence-continuation";
import type { AnalysisFinding } from "@cs2dak/presentation";

type MatchTarget = { roundNumber: number; tick?: number };

export function EvidenceActions({
  entry,
  target,
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
  onWatchDemo?: (entryId: string, target?: MatchTarget) => void;
  onOpenEvidence: OpenEvidence;
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
      <EvidenceLink disabled={!entry} hint={hint} onOpen={() => entry && evidence && onOpenEvidence({ entryId: entry.id, evidence, sourceKey, finding })}>
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
