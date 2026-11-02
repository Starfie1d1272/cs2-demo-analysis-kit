import { useState } from "react";
import type { AnalysisFinding } from "@cs2dak/presentation";
import { FindingPanel } from "@cs2dak/react";
import type { PlayerSeasonProfile } from "@cs2dak/presentation";
import { matchIdForEntry, type StudioDemoEntry } from "../../lib/demo-entry";
import type { OpenEvidence } from "../../lib/evidence-continuation";
import { createTrainingFocus } from "../../lib/training-focus";

export function PlayerFindingsPanel({ findings, player, entries, contextSummary, onOpenEvidence, onOpenMaterials }: {
  findings: AnalysisFinding[]; player: PlayerSeasonProfile; entries: StudioDemoEntry[]; contextSummary: string;
  onOpenEvidence: OpenEvidence; onOpenMaterials: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return <section className="stu-card stu-card-wide"><div className="stu-section-head"><h3>待复核</h3><button type="button" className="stu-button-sm" onClick={onOpenMaterials}>管理训练重点</button></div>
    <p className="stu-dim">观察需要结合证据复核；只有明确加入才会保存训练重点。</p>
    {error && <p role="alert">{error}</p>}
    {findings.length === 0 ? <p className="stu-muted">当前样本没有可自动提出的复盘结论。</p> : findings.slice(0, 3).map(finding => <FindingPanel key={finding.key} id={`players:finding:${finding.key}`} finding={finding} onOpenEvidence={() => { const evidence = finding.evidence[0]; const entry = evidence && entries.find(item => matchIdForEntry(item) === evidence.matchId); if (entry && evidence) onOpenEvidence({ entryId: entry.id, evidence, sourceKey: `players:finding:${finding.key}`, finding }); }} action={<button type="button" className="stu-button-sm" onClick={() => { setError(null); void createTrainingFocus({ playerKey: player.playerKey, finding, evidence: finding.evidence, contextSummary }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason))); }}>加入训练重点</button>} />)}
  </section>;
}
