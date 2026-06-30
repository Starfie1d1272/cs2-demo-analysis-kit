import type { ReactNode } from "react";
import { EvidenceLink } from "@cs2dak/react";
import type { StudioDemoEntry } from "../lib/library";

type MatchTarget = { roundNumber: number; tick?: number };

export function EvidenceActions({
  entry,
  target,
  onOpenMatch,
  onWatchDemo,
  children,
  hint,
}: {
  entry: StudioDemoEntry | null | undefined;
  target: MatchTarget;
  onOpenMatch: (entryId: string, target?: MatchTarget) => void;
  onWatchDemo?: (entryId: string, target?: MatchTarget) => void;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <span className="stu-evidence-actions">
      <EvidenceLink disabled={!entry} hint={hint} onOpen={() => entry && onOpenMatch(entry.id, target)}>
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
