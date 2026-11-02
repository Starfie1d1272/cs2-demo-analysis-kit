import type { ReactNode } from "react";
import { removeTrainingFocus, updateTrainingFocus, type TrainingFocus } from "../../lib/training-focus";

export type TrainingFocusDraft = Pick<TrainingFocus, "note" | "reviewCondition">;
export async function saveTrainingFocusDraft(record: TrainingFocus, draft: TrainingFocusDraft): Promise<TrainingFocus> {
  const saved = await updateTrainingFocus(record.id, draft);
  if (!saved) throw new Error("记录不存在");
  return saved;
}
export const deleteTrainingFocus = removeTrainingFocus;

export function TrainingFocusEditor({ record, draft, onChange, renderEvidence }: {
  record: TrainingFocus;
  draft: TrainingFocusDraft;
  onChange: (draft: TrainingFocusDraft) => void;
  renderEvidence: (evidence: TrainingFocus["evidence"][number], index: number) => ReactNode;
}) {
  return <><header className="stu-view-header"><h1>{record.finding.title}</h1></header><p>{record.finding.statement}</p><p>{record.contextSummary}</p><p>{record.finding.limitations?.join("；")}</p>
    <label className="stu-form-field">备注<input className="stu-form-control" value={draft.note} onChange={(event) => onChange({ ...draft, note: event.target.value })} /></label>
    <label className="stu-form-field">复查条件<input className="stu-form-control" value={draft.reviewCondition} onChange={(event) => onChange({ ...draft, reviewCondition: event.target.value })} /></label>
    {record.evidence.map((evidence, index) => <div key={index}>R{evidence.roundNumber} · 来源版本未知 {renderEvidence(evidence, index)}</div>)}
  </>;
}
