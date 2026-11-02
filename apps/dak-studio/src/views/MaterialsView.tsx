import { MatchSheetEditor } from "./coach/MatchSheetEditor";
import { emptyMatchSheet, createCoachMatchSheet, getCoachMatchSheet, updateCoachMatchSheet, removeCoachMatchSheet } from "../lib/coach-match-sheet";
import { MatchSheetView } from "./coach/MatchSheetView";
import { PositionAssignments, emptyAssignmentDraft } from "./coach/PositionAssignments";
import { getCoachAssignment, createCoachAssignment, updateCoachAssignment, removeCoachAssignment } from "../lib/coach-assignments";
import { PlaybookList } from "./coach/PlaybookList";
import { PlaybookEditor } from "./coach/PlaybookEditor";
import { createCoachPlaybook, getCoachPlaybook, updateCoachPlaybook, removeCoachPlaybook, copyCoachPlaybook } from "../lib/coach-playbook";
import { useEffect, useRef, useState } from "react";
import { usePageReady } from "../lib/use-page-ready";
import type { IdentityOptions } from "../lib/identity";
import type { StudioDemoEntry } from "../lib/demo-entry";
import { matchIdForEntry } from "../lib/demo-entry";
import type { OpenEvidenceRequest } from "../lib/evidence-continuation";
import type { MaterialRef } from "../lib/material-ref";
import { emptyStudyNoteDraft, emptyCoachPlaybookDraft, materialStateMatches, type MaterialPageState, type MaterialsPageState } from "../lib/material-page-state";
import { listStudyMaterialsKind, sortMaterials, materialKey, type MaterialKind, type MaterialSummary } from "../lib/study-materials";
import { createStudyNote, getStudyNote, updateStudyNote, removeStudyNote } from "../lib/study-notes";
import { listTrainingFocus, updateTrainingFocus, removeTrainingFocus, type TrainingFocus } from "../lib/training-focus";
import { listPracticeLineups, removePracticeLineup, type PracticeLineup } from "../lib/practice-lineups";
import { FACTS_REVISION } from "../lib/analysis-manifest";
import { TrainingFocusEditor } from "./coach/TrainingFocusPanel";
import { resolveSavedEvidence } from "../lib/saved-evidence";
import { StudyNoteEditor } from "./coach/StudyNoteEditor";
import { MaterialConflict } from "../lib/material-revision";

const labels: Record<MaterialKind, string> = { "match-sheet": "比赛单", "assignment-set": "人员安排", "playbook": "战术", "study-note": "笔记", "training-focus": "训练重点", "practice-lineup": "练习点位" };
function materialExcerpt(summary: string): string {
  const text = summary.replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 140)}…` : text || "—";
}
const statusLabels = { "no-evidence": "无证据", exact: "来源一致", "version-changed": "来源版本已变化", missing: "原比赛当前不在资料库", conflict: "来源身份冲突", unverified: "来源版本未知" };

type AssignmentAnalysis = (scope: { teamKey: string; mapName: string; side: "t" | "ct"; entryIds: string[] }) => void;
type ListProps = { identityOptions?: IdentityOptions; onAnalyzeAssignments: AssignmentAnalysis; onPageReady?: (keys: string[]) => void; entries: StudioDemoEntry[]; state: MaterialsPageState; onStateChange: (state: MaterialsPageState) => void; onOpenMaterial: (ref: MaterialRef) => void; onCreatedMaterial: (ref: MaterialRef, state: MaterialsPageState) => void; onOpenEvidence: (request: OpenEvidenceRequest, state: MaterialsPageState) => void };
export function MaterialsView({ identityOptions, onAnalyzeAssignments, entries, state, onStateChange, onOpenMaterial, onCreatedMaterial, onOpenEvidence, onPageReady }: ListProps) {
  const [rows, setRows] = useState<MaterialSummary[]>([]); const [errors, setErrors] = useState<Partial<Record<MaterialKind, string>>>({}); const [unreadable, setUnreadable] = useState(0); const [revision, setRevision] = useState(0); const [error, setError] = useState<string | null>(null);
  const [sheetUnreadable, setSheetUnreadable] = useState(0);
  const [playbookUnreadable, setPlaybookUnreadable] = useState(0);
  const [assignmentUnreadable, setAssignmentUnreadable] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorKind = state.newMatchSheet ? "match-sheet" : state.newAssignment ? "assignment-set" : state.newPlaybook ? "playbook" : state.newNote ? "study-note" : null;
  useEffect(() => {
    if (!editorKind) return;
    editorRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [editorKind]);
  const [loaded, setLoaded] = useState(false);
  usePageReady(loaded, onPageReady);
  useEffect(() => {
    let live = true;
    setLoaded(false);
    const pending: Promise<void>[] = [];
    for (const kind of Object.keys(labels) as MaterialKind[]) {
      pending.push(listStudyMaterialsKind(kind, entries).then(result => {
        if (!live) return;
        setRows(previous => sortMaterials([...previous.filter(row => row.ref.kind !== kind), ...result.rows]));
        setErrors(previous => { const next = { ...previous }; delete next[kind]; return next; });
        if (kind === "match-sheet") setSheetUnreadable(result.unreadable);
        if (kind === "study-note") setUnreadable(result.unreadable);
        if (kind === "playbook") setPlaybookUnreadable(result.unreadable);
        if (kind === "assignment-set") setAssignmentUnreadable(result.unreadable);
      }).catch(reason => { if (live) setErrors(previous => ({ ...previous, [kind]: String(reason) })); }));
    }
    void Promise.all(pending).then(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [entries, revision]);
  const change = (patch: Partial<MaterialsPageState>) => onStateChange({ ...state, ...patch });
  const startNew = (kind: "match-sheet" | "assignment-set" | "playbook" | "study-note") => {
    if (savingRef.current) return;
    if ((state.newMatchSheetDirty || state.newAssignmentDirty || state.newPlaybookDirty || state.newNoteDirty) && !window.confirm("放弃当前未保存的新建资料？")) return;
    setError(null);
    change({
      newMatchSheet: kind === "match-sheet" ? emptyMatchSheet() : null, newMatchSheetDirty: false,
      newAssignment: kind === "assignment-set" ? emptyAssignmentDraft() : null, newAssignmentDirty: false, newAssignmentObservationExpanded: false,
      newPlaybook: kind === "playbook" ? emptyCoachPlaybookDraft() : null, newPlaybookDirty: false, newPlaybookPhaseId: null,
      newNote: kind === "study-note" ? emptyStudyNoteDraft() : null, newNoteDirty: false,
    });
  };
  const filtered = rows.filter(row => (!state.typeFilter || row.ref.kind === state.typeFilter) && (!state.mapFilter || row.mapName === state.mapFilter) && `${row.title} ${row.summary}`.toLowerCase().includes(state.search.toLowerCase()));
  const saveMatchSheet = async () => { if (!state.newMatchSheet || savingRef.current) return; savingRef.current = true; setSaving(true); try { const item = await createCoachMatchSheet(state.newMatchSheet); onCreatedMaterial({ kind: "match-sheet", id: item.id }, { ...state, newMatchSheet: null, newMatchSheetDirty: false }); setError(null); } catch (e) { setError(String(e)); } finally { savingRef.current = false; setSaving(false); } };
  const save = async () => { if (!state.newNote || savingRef.current) return; savingRef.current = true; setSaving(true); try { const note = await createStudyNote(state.newNote); setError(null); onCreatedMaterial({ kind: "study-note", id: note.id }, { ...state, newNote: null, newNoteDirty: false }); } catch (e) { setError(String(e)); } finally { savingRef.current = false; setSaving(false); } };
  const saveAssignment = async () => { if (!state.newAssignment || savingRef.current) return; savingRef.current = true; setSaving(true); try { const item = await createCoachAssignment(state.newAssignment); setError(null); onCreatedMaterial({ kind: "assignment-set", id: item.id }, { ...state, newAssignment: null, newAssignmentDirty: false, newAssignmentObservationExpanded: false }); } catch (e) { setError(String(e)); } finally { savingRef.current = false; setSaving(false); } };
  const savePlaybook = async () => { if (!state.newPlaybook || savingRef.current) return; savingRef.current = true; setSaving(true); try { const item = await createCoachPlaybook(state.newPlaybook); setError(null); onCreatedMaterial({ kind: "playbook", id: item.id }, { ...state, newPlaybook: null, newPlaybookDirty: false }); } catch (e) { setError(String(e)); } finally { savingRef.current = false; setSaving(false); } };
  return <div className="stu-view"><header className="stu-view-header"><div><h1>战术与训练</h1><p>查找已保存的笔记、重点和备战材料。</p></div></header>
    <button className="stu-button" disabled={saving || state.newMatchSheet !== null} onClick={() => startNew("match-sheet")}>新建比赛单</button>
    <button className="stu-button" disabled={saving || state.newAssignment !== null} onClick={() => startNew("assignment-set")}>新建人员安排</button>
    <button className="stu-button" disabled={saving || state.newPlaybook !== null} onClick={() => startNew("playbook")}>新建战术</button>
    <button className="stu-button" disabled={saving || state.newNote !== null} onClick={() => startNew("study-note")}>新建笔记</button>
    {editorKind && <div ref={editorRef}>
    {state.newMatchSheet && <div role="dialog" aria-label="新建比赛单"><h2>新建比赛单</h2><fieldset className="stu-card" disabled={saving}><MatchSheetEditor draft={state.newMatchSheet} entries={entries} onChange={newMatchSheet => change({ newMatchSheet, newMatchSheetDirty: true })} />{error && <p role="alert">保存失败：{error}</p>}<button className="stu-button" onClick={() => void saveMatchSheet()}>保存</button><button className="stu-button-sm" onClick={() => { if (!state.newMatchSheetDirty || window.confirm("放弃新建比赛单？")) change({ newMatchSheet: null, newMatchSheetDirty: false }); }}>取消</button></fieldset></div>}
    {state.newAssignment && <div role="dialog" aria-label="新建人员安排"><h2>新建人员安排</h2><fieldset className="stu-card" disabled={saving}><PositionAssignments draft={state.newAssignment} entries={entries} identityOptions={identityOptions} onAnalyze={onAnalyzeAssignments} observationExpanded={state.newAssignmentObservationExpanded} onExpandedChange={newAssignmentObservationExpanded => change({ newAssignmentObservationExpanded })} onChange={newAssignment => change({ newAssignment, newAssignmentDirty: true })} onOpenEvidence={request => onOpenEvidence(request, state)} />{error && <p role="alert">保存失败：{error}</p>}<button className="stu-button" onClick={() => void saveAssignment()}>保存</button><button className="stu-button-sm" onClick={() => { if (!state.newAssignmentDirty || window.confirm("放弃新建人员安排？")) change({ newAssignment: null, newAssignmentDirty: false }); }}>取消</button></fieldset></div>}
    {state.newPlaybook && <div role="dialog" aria-label="新建战术"><h2>新建战术</h2><fieldset className="stu-card" disabled={saving}><PlaybookEditor phaseId={state.newPlaybookPhaseId} onPhaseIdChange={newPlaybookPhaseId => change({ newPlaybookPhaseId })} draft={state.newPlaybook} entries={entries} onChange={(draft, selectedPhaseId) => change({ newPlaybook: draft, newPlaybookDirty: true, newPlaybookPhaseId: selectedPhaseId === undefined ? state.newPlaybookPhaseId : selectedPhaseId })} onEvidence={index => { const ref = state.newPlaybook!.evidence[index]; const resolved = resolveSavedEvidence(ref, entries); if (resolved.canOpenCurrent && resolved.currentEntryId) onOpenEvidence({ entryId: resolved.currentEntryId, evidence: ref.evidence }, state); }} />{error && <p role="alert">保存失败：{error}</p>}<button className="stu-button" onClick={() => void savePlaybook()}>保存</button><button className="stu-button-sm" onClick={() => { if (!state.newPlaybookDirty || window.confirm("放弃新建战术？")) change({ newPlaybook: null, newPlaybookDirty: false }); }}>取消</button></fieldset></div>}
    {state.newNote && <div role="dialog" aria-label="新建笔记"><h2>新建笔记</h2><fieldset className="stu-card" disabled={saving}><StudyNoteEditor draft={state.newNote} entries={entries} onChange={draft => change({ newNote: draft, newNoteDirty: true })} onEvidence={index => { const ref = state.newNote!.evidence[index]; const resolved = resolveSavedEvidence(ref, entries); if (resolved.canOpenCurrent && resolved.currentEntryId) onOpenEvidence({ entryId: resolved.currentEntryId, evidence: ref.evidence }, state); }} />{error && <p role="alert">保存失败：{error}</p>}<button className="stu-button" disabled={saving} onClick={() => void save()}>保存</button><button className="stu-button-sm" disabled={saving} onClick={() => { if (!state.newNoteDirty || window.confirm("放弃新建笔记？")) change({ newNote: null, newNoteDirty: false }); }}>取消</button></fieldset></div>}
    </div>}
    <div><input className="stu-input" placeholder="搜索标题或正文" value={state.search} onChange={e => change({ search: e.target.value })} /><select className="stu-input" value={state.typeFilter ?? ""} onChange={e => change({ typeFilter: e.target.value || null })}><option value="">全部类型</option>{Object.entries(labels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select><select className="stu-input" value={state.mapFilter ?? ""} onChange={e => change({ mapFilter: e.target.value || null })}><option value="">全部地图</option>{[...new Set(rows.flatMap(r => r.mapName ? [r.mapName] : []))].sort().map(map => <option key={map}>{map}</option>)}</select></div>
    {Object.entries(errors).map(([kind, message]) => <p role="alert" key={kind}>{labels[kind as MaterialKind]}读取失败：{message} <button className="stu-button-sm" onClick={() => setRevision(n => n + 1)}>重试</button></p>)}{sheetUnreadable > 0 && <p role="alert">有 {sheetUnreadable} 条比赛单无法读取，原始记录已保留。</p>}{assignmentUnreadable > 0 && <p role="alert">有 {assignmentUnreadable} 条人员安排无法读取，原始记录已保留。</p>}{playbookUnreadable > 0 && <p role="alert">有 {playbookUnreadable} 条战术无法读取，原始记录已保留。</p>}{unreadable > 0 && <p role="alert">有 {unreadable} 条笔记无法读取，原始记录已保留。</p>}
    {!loaded && <p>正在读取资料…</p>}{loaded && filtered.length === 0 && <p>没有匹配的资料。</p>}{(!state.typeFilter || state.typeFilter === "playbook") && <PlaybookList rows={filtered.filter(row => row.ref.kind === "playbook")} state={state} onStateChange={onStateChange} onOpen={row => { change({ selectedRef: row.ref }); onOpenMaterial(row.ref); }} />}{filtered.filter(row => row.ref.kind !== "playbook").map(row => <div key={materialKey(row.ref)}><button className="stu-button-sm" onClick={() => { change({ selectedRef: row.ref }); onOpenMaterial(row.ref); }}>{row.title}</button> · {row.kindLabel} · {row.mapName ?? "—"} · {row.updatedAt === null ? "时间未知" : new Date(row.updatedAt).toLocaleString()} · {statusLabels[row.sourceStatus]}<p>{materialExcerpt(row.summary)}</p></div>)}

  </div>;
}

type DetailProps = { identityOptions?: IdentityOptions; onAnalyzeAssignments: AssignmentAnalysis; onPageReady?: (keys: string[]) => void; refValue: MaterialRef; entries: StudioDemoEntry[]; state: MaterialPageState | null; onStateChange: (state: MaterialPageState | null) => void; onBack: (cleanState?: MaterialPageState | null) => void; onOpened: (ref: MaterialRef) => void; onLecture: (state: Extract<MaterialPageState, { kind: "playbook" | "match-sheet" }>) => void; onOpenEvidence: (request: OpenEvidenceRequest, state: MaterialPageState) => void };
type RecordValue = TrainingFocus | PracticeLineup;
/** 每个编辑帧保留其读取的完整记录快照，用它检查保存时是否仍是同一版本。 */
async function loadMaterialState(ref: MaterialRef): Promise<{ ui: MaterialPageState; record?: RecordValue }> {
  switch (ref.kind) {
    case "match-sheet": { const n = await getCoachMatchSheet(ref.id); if (!n) throw new Error("比赛单不存在"); return { ui: { kind: "match-sheet", id: n.id, draft: { title: n.title, mapName: n.mapName, opponentLabel: n.opponentLabel, sections: n.sections }, dirty: false, baseRevision: JSON.stringify(n) } }; }
    case "assignment-set": { const n = await getCoachAssignment(ref.id); if (!n) throw new Error("人员安排不存在或无法读取"); return { ui: { kind: "assignment-set", id: n.id, draft: { title: n.title, teamLabel: n.teamLabel, mapName: n.mapName, side: n.side, observedTeamKey: n.observedTeamKey, observedEntryIds: n.observedEntryIds, rows: n.rows }, dirty: false, baseRevision: JSON.stringify(n), observationExpanded: false } }; }
    case "playbook": { const n = await getCoachPlaybook(ref.id); if (!n) throw new Error("战术不存在或无法读取"); return { ui: { kind: "playbook", id: n.id, draft: { kind: n.kind, title: n.title, mapName: n.mapName, side: n.side, purpose: n.purpose, trigger: n.trigger, body: n.body, tags: n.tags, phases: n.phases, evidence: n.evidence }, dirty: false, baseRevision: JSON.stringify(n), phaseId: null } }; }
    case "study-note": { const n = await getStudyNote(ref.id); if (!n) throw new Error("笔记不存在或无法读取"); return { ui: { kind: "study-note", id: n.id, draft: { title: n.title, body: n.body, purpose: n.purpose, playerKey: n.playerKey, evidence: n.evidence }, dirty: false, baseRevision: JSON.stringify(n) } }; }
    case "training-focus": { const n = (await listTrainingFocus()).find(x => x.id === ref.id); if (!n) throw new Error("记录不存在"); return { ui: { kind: "training-focus", id: n.id, draft: { note: n.note, reviewCondition: n.reviewCondition }, dirty: false, baseRevision: JSON.stringify(n) }, record: n }; }
    case "practice-lineup": { const n = (await listPracticeLineups()).find(x => x.id === ref.id); if (!n) throw new Error("记录不存在"); return { ui: { kind: "practice-lineup", id: n.id, selectedEvidence: null }, record: n }; }
  }
}

export function MaterialDetailView({ identityOptions, onAnalyzeAssignments, refValue, entries, state, onStateChange, onBack, onOpened, onLecture, onOpenEvidence, onPageReady }: DetailProps) {
  const [record, setRecord] = useState<RecordValue | null>(null); const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false); const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => { setSaved(false); }, [refValue.kind, refValue.id]);
  usePageReady(!loading, onPageReady);
  useEffect(() => {
    let live = true; setLoading(true); setError(null); setConflict(false);
    void loadMaterialState(refValue).then(latest => {
      if (!live) return;
      setRecord(latest.record ?? null);
      if (!materialStateMatches(state, refValue)) onStateChange(latest.ui);
      else if ("baseRevision" in state && "baseRevision" in latest.ui && state.baseRevision !== latest.ui.baseRevision) {
        if (state.dirty) setConflict(true);
        else onStateChange(latest.ui);
      }
      onOpened(refValue);
    }).catch(e => { if (live) setError(String(e)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [refValue.kind, refValue.id]);
  const current = materialStateMatches(state, refValue) ? state : null;
  const leave = () => onBack();
  const reloadLatest = async () => {
    if (savingRef.current || (current && "dirty" in current && current.dirty && !window.confirm("加载最新资料会放弃当前草稿。请先复制需要保留的内容。继续？"))) return;
    savingRef.current = true; setSaving(true);
    try { const latest = await loadMaterialState(refValue); onStateChange(latest.ui); setRecord(latest.record ?? null); setConflict(false); setError(null); setSaved(false); }
    catch (e) { setError(String(e)); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const save = async () => {
    if (!current || current.kind === "practice-lineup" || savingRef.current || conflict) return;
    savingRef.current = true; setSaving(true);
    try {
      let result: unknown;
      switch (current.kind) {
        case "match-sheet": result = await updateCoachMatchSheet(current.id, current.draft, current.baseRevision); break;
        case "assignment-set": result = await updateCoachAssignment(current.id, current.draft, current.baseRevision); break;
        case "playbook": result = await updateCoachPlaybook(current.id, current.draft, current.baseRevision); break;
        case "study-note": result = await updateStudyNote(current.id, current.draft, current.baseRevision); break;
        case "training-focus": result = await updateTrainingFocus(current.id, current.draft, current.baseRevision); break;
      }
      if (!result) throw new Error("资料不存在或无法读取");
      if (current.kind === "training-focus") setRecord(result as TrainingFocus);
      onStateChange({ ...current, dirty: false, baseRevision: JSON.stringify(result) }); setSaved(true); setError(null);
    } catch (e) { if (e instanceof MaterialConflict) { setConflict(true); setError(null); } else setError(String(e)); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const remove = async () => {
    if (!current || savingRef.current || !window.confirm("删除这条资料？")) return;
    savingRef.current = true; setSaving(true);
    try {
      switch (current.kind) {
        case "match-sheet": await removeCoachMatchSheet(current.id, current.baseRevision); break;
        case "assignment-set": await removeCoachAssignment(current.id, current.baseRevision); break;
        case "playbook": await removeCoachPlaybook(current.id, current.baseRevision); break;
        case "study-note": await removeStudyNote(current.id, current.baseRevision); break;
        case "training-focus": await removeTrainingFocus(current.id, current.baseRevision); break;
        case "practice-lineup": await removePracticeLineup(current.id); break;
      }
      onBack(null);
    } catch (e) { if (e instanceof MaterialConflict) { setConflict(true); setError(null); } else setError(String(e)); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const copy = async () => { if (!current || current.kind !== "playbook" || savingRef.current) return; if (current.dirty && !window.confirm("复制已保存的战术？未保存的修改不会复制。")) return; savingRef.current = true; setSaving(true); try { await copyCoachPlaybook(current.id); onBack(null); } catch (e) { setError(String(e)); } finally { savingRef.current = false; setSaving(false); } };
  const legacyEvidence = (matchId: string, roundNumber: number, tick?: number) => { const matches = entries.filter(e => matchIdForEntry(e) === matchId); const entry = matches.length === 1 ? matches[0] : undefined; return <>{!entry && <span>{matches.length ? "来源存在歧义" : "原比赛当前不在资料库"} </span>}<button className="stu-button-sm" disabled={!entry} onClick={() => entry && current && onOpenEvidence({ entryId: entry.id, evidence: { matchId, roundNumber, tick, reason: "已保存资料" } }, current)}>回放</button></>; };
  return <div className="stu-view"><button className="stu-button-sm" disabled={saving} onClick={leave}>返回资料</button>{loading && <p>正在读取…</p>}{error && <p role="alert">{error}</p>}{conflict && <div role="alert" className="stu-notice"><span>这份资料已在另一个编辑页更新。当前草稿仍保留；请先复制需要的内容，再加载最新版本继续编辑。</span><button type="button" className="stu-button-sm" disabled={saving} onClick={() => void reloadLatest()}>加载最新版本</button></div>}<fieldset className="stu-card" disabled={saving || loading}>{current?.kind === "match-sheet" && <><header className="stu-view-header"><h1>比赛单</h1></header><MatchSheetEditor draft={current.draft} entries={entries} onChange={draft => { setSaved(false); onStateChange({ ...current, draft, dirty: true }); }} /><MatchSheetView draft={current.draft} entries={entries} onLecture={() => onLecture(current)} /></>}{current?.kind === "assignment-set" && <PositionAssignments draft={current.draft} entries={entries} identityOptions={identityOptions} onAnalyze={onAnalyzeAssignments} observationExpanded={current.observationExpanded} onExpandedChange={observationExpanded => onStateChange({ ...current, observationExpanded })} onChange={draft => { setSaved(false); onStateChange({ ...current, draft, dirty: true }); }} onOpenEvidence={request => onOpenEvidence(request, current)} />}{current?.kind === "playbook" && <><header className="stu-view-header"><h1>战术</h1></header><PlaybookEditor phaseId={current.phaseId} onPhaseIdChange={phaseId => onStateChange({ ...current, phaseId })} draft={current.draft} entries={entries} onChange={(draft, selectedPhaseId) => { setSaved(false); onStateChange({ ...current, draft, dirty: true, phaseId: selectedPhaseId === undefined ? current.phaseId : selectedPhaseId }); }} onEvidence={index => { const ref = current.draft.evidence[index]; const resolved = resolveSavedEvidence(ref, entries); if (resolved.canOpenCurrent && resolved.currentEntryId) onOpenEvidence({ entryId: resolved.currentEntryId, evidence: ref.evidence }, current); }} /><button className="stu-button-sm" onClick={() => onLecture(current)}>讲解</button><button className="stu-button-sm" onClick={() => void copy()}>复制已保存战术</button></>}{current?.kind === "study-note" && <><header className="stu-view-header"><h1>笔记</h1></header><StudyNoteEditor draft={current.draft} entries={entries} onChange={draft => { setSaved(false); onStateChange({ ...current, draft, dirty: true }); }} onEvidence={index => { const ref = current.draft.evidence[index]; const resolved = resolveSavedEvidence(ref, entries); if (resolved.canOpenCurrent && resolved.currentEntryId) onOpenEvidence({ entryId: resolved.currentEntryId, evidence: ref.evidence }, current); }} /></>}
    {current?.kind === "training-focus" && record && <TrainingFocusEditor record={record as TrainingFocus} draft={current.draft} onChange={draft => { setSaved(false); onStateChange({ ...current, draft, dirty: true }); }} renderEvidence={e => legacyEvidence(e.matchId, e.roundNumber, e.tick)} />}
    {current?.kind === "practice-lineup" && record && (() => { const n = record as PracticeLineup; const entry = entries.find(e => e.id === n.evidence?.entryId); return <><header className="stu-view-header"><h1>{n.label}</h1></header><p>练习命令：{n.practiceCommand ?? "—"}</p><p>来源版本：{!n.sourceFactsRevision ? "未知" : n.sourceFactsRevision !== FACTS_REVISION ? "已变化" : n.sourceFactsRevision}</p>{n.evidence && <p>R{n.evidence.roundNumber} {entry ? <button className="stu-button-sm" onClick={() => current && n.evidence && onOpenEvidence({ entryId: entry.id, evidence: { matchId: matchIdForEntry(entry), roundNumber: n.evidence.roundNumber, tick: n.evidence.tick, reason: "已保存资料" } }, current)}>回放</button> : "原比赛当前不在资料库"}</p>}</>; })()}
    {current && current.kind !== "practice-lineup" && <button className="stu-button" disabled={saving || loading || conflict} onClick={() => void save()}>保存</button>}{saved && current && "dirty" in current && !current.dirty && <span role="status">已保存</span>}{current && <button className="stu-button-sm" disabled={saving} onClick={() => void remove()}>删除</button>}</fieldset>
  </div>;
}
