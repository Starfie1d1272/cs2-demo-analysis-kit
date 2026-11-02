import { useEffect, useState } from "react";
import { matchIdForEntry, type StudioDemoEntry } from "../../lib/demo-entry";
import { loadMatchWorkspaceModel } from "../../lib/match-workspace-loader";
import { captureSavedEvidence, relinkSavedEvidence, resolveSavedEvidence, type SavedEvidenceRef } from "../../lib/saved-evidence";

export function SavedEvidenceEditor({ value, entries, onChange, onEvidence }: { value: SavedEvidenceRef[]; entries: StudioDemoEntry[]; onChange: (value: SavedEvidenceRef[]) => void; onEvidence: (index: number) => void }) {
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
  return <div><h3>证据</h3>
    <div><label>选择比赛<select className="stu-input" value={entryId} onChange={e => setEntryId(e.target.value)}><option value="">请选择</option>{entries.map(item => <option key={item.id} value={item.id}>{item.fileName} · {item.meta.mapName}</option>)}</select></label>
    <label>回合<select className="stu-input" value={round} disabled={!rounds || rounds.entryId !== entryId || loadingRounds} onChange={e => setRound(e.target.value)}><option value="">请选择</option>{rounds?.entryId === entryId && rounds.values.map(number => <option key={number} value={number}>R{number}</option>)}</select></label>
    {loadingRounds && <span>正在读取回合…</span>}{roundError && <p role="alert">读取回合失败：{roundError} <button type="button" className="stu-button-sm" onClick={() => setRetry(value => value + 1)}>重试</button></p>}{rounds?.entryId === entryId && rounds.values.length === 0 && <span>该比赛没有可用回合。</span>}
    <button type="button" className="stu-button-sm" disabled={!canAdd} onClick={() => { if (!entry || !canAdd) return; onChange([...value, captureSavedEvidence(entry, { matchId: matchIdForEntry(entry), roundNumber, reason: "手动选择" })]); setRound(""); }}>添加证据</button></div>{value.length === 0 && <p>无证据</p>}
    {value.map((ref, index) => { const resolution = resolveSavedEvidence(ref, entries); return <div key={ref.id}>
      <span>{ref.source.mapName} · R{ref.evidence.roundNumber} · {resolution.reason}</span>{resolution.status === "missing" && <span> 原比赛当前不在资料库</span>}
      <button className="stu-button-sm" type="button" disabled={!resolution.canOpenCurrent} onClick={() => onEvidence(index)}>回放</button>
      {resolution.uniqueRelinkCandidate && <button className="stu-button-sm" type="button" onClick={() => { if (!window.confirm("将这条证据重新关联到所选比赛？")) return; const rebound = relinkSavedEvidence(ref, resolution.uniqueRelinkCandidate!, entries); if (rebound) onChange(value.map((item, i) => i === index ? rebound : item)); }}>重新关联</button>}
      <button className="stu-button-sm" type="button" onClick={() => onChange(value.filter((_, i) => i !== index))}>移除证据</button>
    </div>; })}
  </div>;
}
