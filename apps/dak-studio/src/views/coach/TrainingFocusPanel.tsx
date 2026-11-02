import { useCallback, useEffect, useState, type ReactNode } from "react";
import { listTrainingFocus, removeTrainingFocus, updateTrainingFocus, type TrainingFocus } from "../../lib/training-focus";

/** The legacy Home entry uses the same management UI as materials. */
export function TrainingFocusPanel({ playerKey, revision = 0 }: { playerKey?: string; revision?: number }) {
  const [focuses, setFocuses] = useState<TrainingFocus[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reviewCondition, setReviewCondition] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setFocuses(await listTrainingFocus(playerKey)); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [playerKey]);
  useEffect(() => { void load(); }, [load, revision]);
  const save = async (focus: TrainingFocus) => {
    try {
      const updated = await updateTrainingFocus(focus.id, { note, reviewCondition });
      if (updated) setFocuses((items) => items.map((item) => item.id === updated.id ? updated : item));
      setEditing(null); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const remove = async (id: string) => {
    try { await removeTrainingFocus(id); setFocuses((items) => items.filter((item) => item.id !== id)); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  return <section>
    <div className="stu-section-head"><h3>训练重点</h3><small className="stu-dim">仅保存已确认内容</small></div>
    {error && <p role="alert">读取或保存训练重点失败：{error} <button type="button" className="stu-button-sm" onClick={() => void load()}>重试</button></p>}
    {focuses.length === 0 ? <p className="stu-muted">确认一个待复核结论后，可在这里保存复盘重点与复查条件。</p> :
      <div className="stu-home-focus-list">{focuses.map((focus) => <article key={focus.id} className="stu-training-focus">
        <header><b>{focus.finding.title}</b><button type="button" className="stu-button-sm" onClick={() => void remove(focus.id)}>删除</button></header>
        <p>{focus.finding.statement}</p><small>{focus.contextSummary}</small>
        {editing === focus.id ? <div className="stu-focus-editor">
          <input className="stu-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="你的复盘备注" />
          <input className="stu-input" value={reviewCondition} onChange={(event) => setReviewCondition(event.target.value)} placeholder="复查条件" />
          <div><button type="button" className="stu-button-sm" onClick={() => void save(focus)}>保存</button><button type="button" className="stu-button-sm" onClick={() => setEditing(null)}>取消</button></div>
        </div> : <div className="stu-focus-meta"><span>{focus.note || "未添加备注"}</span><span>{focus.reviewCondition || "未设置复查条件"}</span><button type="button" className="stu-button-sm" onClick={() => { setEditing(focus.id); setNote(focus.note); setReviewCondition(focus.reviewCondition); }}>编辑</button></div>}
      </article>)}</div>}
  </section>;
}

export type TrainingFocusDraft = Pick<TrainingFocus, "note" | "reviewCondition">;
export async function saveTrainingFocusDraft(record: TrainingFocus, draft: TrainingFocusDraft): Promise<void> {
  if (!await updateTrainingFocus(record.id, draft)) throw new Error("记录不存在");
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
