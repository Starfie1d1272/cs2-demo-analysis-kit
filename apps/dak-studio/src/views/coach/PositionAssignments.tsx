import { useEffect, useState } from "react";
import { SPATIAL_ASSET_MAPS } from "@cs2dak/maps";
import { TeamMapRoleMatrixPanel } from "@cs2dak/react";
import type { TeamMapRoleMatrix } from "@cs2dak/tactics";
import type { CoachAssignmentSetDraft } from "../../lib/coach-assignments";
import { formatMatchLabel, matchIdForEntry, type StudioDemoEntry } from "../../lib/demo-entry";
import type { IdentityOptions } from "../../lib/identity";
import type { OpenEvidenceRequest } from "../../lib/evidence-continuation";
import { loadRoleDeclarations } from "../../lib/identity-commands";
import { getTeamMapRoleMatrices } from "../../lib/queries/spatial-queries";

export const emptyAssignmentRow = (): CoachAssignmentSetDraft["rows"][number] => ({ id: crypto.randomUUID(), playerLabel: "", playerKey: null, positionLabel: "", responsibility: "", notes: "" });
export const emptyAssignmentDraft = (): CoachAssignmentSetDraft => ({ title: "", teamLabel: "", mapName: "de_mirage", side: "t", observedTeamKey: null, observedEntryIds: [], rows: Array.from({ length: 5 }, emptyAssignmentRow) });

/** The host owns the draft and expanded state so evidence navigation can restore both. */
export function PositionAssignments({ draft, entries, identityOptions, observationExpanded, onChange, onExpandedChange, onOpenEvidence, onAnalyze }: {
  draft: CoachAssignmentSetDraft; entries: StudioDemoEntry[]; identityOptions?: IdentityOptions; observationExpanded: boolean;
  onChange: (draft: CoachAssignmentSetDraft) => void; onExpandedChange: (expanded: boolean) => void;
  onOpenEvidence: (request: OpenEvidenceRequest) => void; onAnalyze?: (scope: { teamKey: string; mapName: string; side: "t" | "ct"; entryIds: string[] }) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(draft.observedEntryIds);
  const [candidates, setCandidates] = useState<TeamMapRoleMatrix[] | null>(null);
  const [observed, setObserved] = useState<TeamMapRoleMatrix[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = entries.filter(e => selectedIds.includes(e.id));
  const bound = entries.filter(e => draft.observedEntryIds.includes(e.id));
  const missing = draft.observedEntryIds.filter(id => !entries.some(e => e.id === id));
  const update = (patch: Partial<CoachAssignmentSetDraft>) => onChange({ ...draft, ...patch });
  useEffect(() => {
    let live = true; setCandidates(null); setError(null);
    if (!selected.length) return;
    void loadRoleDeclarations().then(s => getTeamMapRoleMatrices(selected, s.declarations.map(r => r.declaration), identityOptions)).then(rows => { if (live) setCandidates(rows); }).catch(e => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, [entries, selectedIds, identityOptions]);
  useEffect(() => {
    let live = true; setObserved(null);
    if (!draft.observedTeamKey || !bound.length) return;
    void loadRoleDeclarations().then(s => getTeamMapRoleMatrices(bound, s.declarations.map(r => r.declaration), identityOptions, [draft.observedTeamKey!])).then(rows => { if (live) setObserved(rows); }).catch(e => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, [entries, draft.observedTeamKey, draft.observedEntryIds, identityOptions]);
  const matrix = observed?.find(m => m.teamKey === draft.observedTeamKey && m.mapName === draft.mapName && m.side === draft.side) ?? null;
  const teamKeys = [...new Set((candidates ?? []).map(m => m.teamKey))];
  const playerKeys = matrix?.players.map(p => p.playerKey) ?? [];
  return <div className="stu-home-grid"><section className="stu-card"><h2>我们的安排</h2>
    <label>标题<input className="stu-input" value={draft.title} onChange={e => update({ title: e.target.value })} /></label>
    <label>队伍标签<input className="stu-input" value={draft.teamLabel} onChange={e => update({ teamLabel: e.target.value })} /></label>
    <label>地图<select className="stu-input" value={draft.mapName} onChange={e => update({ mapName: e.target.value })}>{!SPATIAL_ASSET_MAPS.some(m => m === draft.mapName) && <option>{draft.mapName}</option>}{SPATIAL_ASSET_MAPS.map(m => <option key={m}>{m}</option>)}</select></label>
    <label>阵营<select className="stu-input" value={draft.side} onChange={e => update({ side: e.target.value as "t" | "ct" })}><option value="t">T</option><option value="ct">CT</option></select></label>
    {draft.rows.map((row, i) => <fieldset key={row.id}><legend>队员 {i + 1}</legend>{([['playerLabel','队员'],['positionLabel','位置'],['responsibility','职责'],['notes','备注']] as const).map(([field,label]) => <label key={field}>{label}<input className="stu-input" placeholder="未填写" value={row[field]} onChange={e => update({ rows: draft.rows.map(r => r.id === row.id ? { ...r, [field]: e.target.value } : r) })} /></label>)}
      <label>观察选手关联<select className="stu-input" value={row.playerKey ?? ""} onChange={e => update({ rows: draft.rows.map(r => r.id === row.id ? { ...r, playerKey: e.target.value || null } : r) })}><option value="">未关联</option>{row.playerKey && !playerKeys.includes(row.playerKey) && <option value={row.playerKey}>{row.playerKey}（关联待检查）</option>}{playerKeys.map(k => <option key={k} value={k}>{k}</option>)}</select></label><button className="stu-button-sm" onClick={() => update({ rows: draft.rows.filter(r => r.id !== row.id) })}>移除</button></fieldset>)}
    <button className="stu-button-sm" onClick={() => update({ rows: [...draft.rows, emptyAssignmentRow()] })}>添加队员</button></section>
    <section className="stu-card"><details open={observationExpanded} onToggle={e => onExpandedChange(e.currentTarget.open)}><summary>比赛中的观察</summary>
      <p>显式选择比赛和观察队伍；人工内容不会被覆盖。</p>{entries.map(e => <label key={e.id}><input type="checkbox" checked={selectedIds.includes(e.id)} onChange={event => setSelectedIds(event.target.checked ? [...selectedIds, e.id] : selectedIds.filter(id => id !== e.id))} />{formatMatchLabel(e)}</label>)}
      <label>观察队伍<select className="stu-input" value="" onChange={e => { if (e.target.value) update({ observedTeamKey: e.target.value, observedEntryIds: selected.map(x => x.id) }); }}><option value="">选择队伍并绑定</option>{teamKeys.map(k => <option key={k} value={k}>{k}</option>)}</select></label>
      {draft.observedTeamKey && <><p>已绑定：{draft.observedTeamKey}</p><button className="stu-button-sm" onClick={() => update({ observedTeamKey: null, observedEntryIds: [] })}>解除绑定</button></>}
      {missing.length > 0 && <p>缺失比赛：{missing.join("、")}</p>}{error && <p role="alert">{error}</p>}
      {draft.observedTeamKey && !bound.length ? <p>没有可用的观察比赛</p> : draft.observedTeamKey && observed && !observed.some(m => m.teamKey === draft.observedTeamKey) ? <p>观察队伍已失效，请重新选择。</p> : draft.observedTeamKey && observed && !matrix ? <p>当前地图没有位置观察</p> : matrix && <TeamMapRoleMatrixPanel matrix={matrix} playerNames={{}} onOpenEvidence={evidence => { const matches = bound.filter(e => matchIdForEntry(e) === evidence.matchId); if (matches.length === 1) onOpenEvidence({ entryId: matches[0].id, evidence }); }} />}
      {matrix && draft.observedTeamKey && onAnalyze && <button className="stu-button-sm" onClick={() => onAnalyze({ teamKey: draft.observedTeamKey!, mapName: draft.mapName, side: draft.side, entryIds: bound.map(e => e.id) })}>去分析这些回合</button>}
    </details></section></div>;
}
