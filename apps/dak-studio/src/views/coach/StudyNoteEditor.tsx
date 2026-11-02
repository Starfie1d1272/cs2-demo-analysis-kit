import { useEffect, useState } from "react";
import { matchIdForEntry, type StudioDemoEntry } from "../../lib/demo-entry";
import { loadMatchWorkspaceModel } from "../../lib/match-workspace-loader";
import type { StudyNoteDraft } from "../../lib/study-notes";
import { captureSavedEvidence, resolveSavedEvidence } from "../../lib/saved-evidence";

export function StudyNoteEditor({ draft, entries, onChange, onEvidence }: { draft: StudyNoteDraft; entries: StudioDemoEntry[]; onChange: (draft: StudyNoteDraft) => void; onEvidence: (index: number) => void }) {
  const [entryId, setEntryId] = useState("");
  const [round, setRound] = useState("");
  const [rounds, setRounds] = useState<{ entryId: string; values: number[] } | null>(null);
  const [roundError, setRoundError] = useState<string | null>(null);
  const [loadingRounds, setLoadingRounds] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    setRounds(null); setRound(""); setRoundError(null); setLoadingRounds(true);
    void loadMatchWorkspaceModel(entryId).then(model => {
      if (!cancelled) setRounds({ entryId, values: [...new Set(model.rounds.map(item => item.roundNumber))].sort((a, b) => a - b) });
    }).catch(error => { if (!cancelled) setRoundError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (!cancelled) setLoadingRounds(false); });
    return () => { cancelled = true; };
  }, [entryId, retry]);
  const entry = entries.find(item => item.id === entryId);
  const roundNumber = Number(round);
  const canAdd = !!entry && rounds?.entryId === entryId && rounds.values.includes(roundNumber);
  const update = (patch: Partial<StudyNoteDraft>) => onChange({ ...draft, ...patch });
  return <div>
    <label>标题<input className="stu-input" value={draft.title} onChange={e => update({ title: e.target.value })} /></label>
    <label>正文<textarea className="stu-input" value={draft.body} onChange={e => update({ body: e.target.value })} /></label>
    <label>用途<select className="stu-input" value={draft.purpose} onChange={e => update({ purpose: e.target.value as StudyNoteDraft["purpose"] })}><option value="review">复盘</option><option value="practice">练习</option></select></label>
    <label>选手标识<input className="stu-input" value={draft.playerKey ?? ""} onChange={e => update({ playerKey: e.target.value || null })} /></label>
    <h3>证据</h3>
    <div><label>选择比赛<select className="stu-input" value={entryId} onChange={e => setEntryId(e.target.value)}><option value="">请选择</option>{entries.map(item => <option key={item.id} value={item.id}>{item.fileName} · {item.meta.mapName}</option>)}</select></label>
    <label>回合<select className="stu-input" value={round} disabled={!rounds || rounds.entryId !== entryId || loadingRounds} onChange={e => setRound(e.target.value)}><option value="">请选择</option>{rounds?.entryId === entryId && rounds.values.map(number => <option key={number} value={number}>R{number}</option>)}</select></label>
    {loadingRounds && <span>正在读取回合…</span>}{roundError && <p role="alert">读取回合失败：{roundError} <button type="button" className="stu-button-sm" onClick={() => setRetry(value => value + 1)}>重试</button></p>}{rounds?.entryId === entryId && rounds.values.length === 0 && <span>该比赛没有可用回合。</span>}
    <button type="button" className="stu-button-sm" disabled={!canAdd} onClick={() => { if (!entry || !canAdd) return; update({ evidence: [...draft.evidence, captureSavedEvidence(entry, { matchId: matchIdForEntry(entry), roundNumber, reason: "手动选择" })] }); setRound(""); }}>添加证据</button></div>{draft.evidence.length === 0 && <p>手工笔记 · 无证据</p>}
    {draft.evidence.map((ref, index) => { const resolution = resolveSavedEvidence(ref, entries); return <div key={ref.id}>
      <span>{ref.source.mapName} · R{ref.evidence.roundNumber} · {resolution.reason}</span>{resolution.status === "missing" && <span> 原比赛当前不在资料库</span>}
      <button className="stu-button-sm" type="button" disabled={!resolution.canOpenCurrent} onClick={() => onEvidence(index)}>回放</button>
      {resolution.uniqueRelinkCandidate && <button className="stu-button-sm" type="button" onClick={() => update({ evidence: draft.evidence.map((item, i) => i === index ? { ...item, source: resolution.uniqueRelinkCandidate! } : item) })}>重新关联</button>}
      <button className="stu-button-sm" type="button" onClick={() => update({ evidence: draft.evidence.filter((_, i) => i !== index) })}>移除证据</button>
    </div>; })}
  </div>;
}
