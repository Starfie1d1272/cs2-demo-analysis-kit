import { useEffect, useRef, useState } from "react";
import { MapAnnotationCanvas, ReplayViewer } from "@cs2dak/react";
import type { MatchWorkspaceModel, ReplayViewState } from "@cs2dak/presentation";
import type { CoachPlaybookDraft } from "../../lib/coach-playbook";
import type { StudioDemoEntry } from "../../lib/demo-entry";
import { loadMatchWorkspaceModel } from "../../lib/match-workspace-loader";
import { resolveSavedEvidence } from "../../lib/saved-evidence";
import type { LecturePageState } from "../../lib/material-page-state";
import { usePlaybookMap } from "./PlaybookPhaseEditor";

export function PlaybookLectureView({ draft, entries, state, onChange, onBack }: { draft: CoachPlaybookDraft; entries: StudioDemoEntry[]; state: LecturePageState; onChange: (state: LecturePageState) => void; onBack: () => void }) {
  const initial = useRef(state);
  useEffect(() => { if (initial.current.replay?.playing) onChange({ ...initial.current, replay: { ...initial.current.replay, playing: false } }); }, []);
  const [level, setLevel] = useState<"upper" | "lower">("upper");
  const [loaded, setLoaded] = useState<{ entryId: string; model: MatchWorkspaceModel } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phase = draft.phases.find(p => p.id === state.phaseId) ?? draft.phases[0];
  const evidence = draft.evidence.find(e => e.id === state.selectedEvidenceId);
  const resolution = evidence ? resolveSavedEvidence(evidence, entries) : null;
  useEffect(() => { let live = true; setLoaded(null); setError(null); const entryId = resolution?.canOpenCurrent ? resolution.currentEntryId : null; if (state.tab === "evidence" && entryId) void loadMatchWorkspaceModel(entryId).then(model => { if (live) setLoaded({ entryId, model }); }).catch(e => { if (live) setError(String(e)); }); return () => { live = false; }; }, [state.tab, resolution?.currentEntryId, resolution?.canOpenCurrent]);
  useEffect(() => { const listener = (e: KeyboardEvent) => { if (e.key === "Escape") onBack(); }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, [onBack]);
  const map = usePlaybookMap(draft.mapName);
  const model = resolution?.canOpenCurrent && resolution.currentEntryId === loaded?.entryId ? loaded.model : null;
  const detail = evidence && model?.rounds.find(r => r.roundNumber === evidence.evidence.roundNumber);
  const round = detail && model?.replay.rounds.find(r => r.roundNumber === detail.roundNumber && r.frameCount > 0 && Number.isFinite(r.startTick) && Number.isFinite(r.freezeEndTick) && Number.isFinite(r.tickStep) && r.tickStep > 0);
  const replay: ReplayViewState | null = round ? state.replayEntryId === resolution?.currentEntryId && state.replay?.roundNumber === round.roundNumber ? state.replay : { roundNumber: round.roundNumber, tick: evidence?.evidence.tick ?? round.freezeEndTick, playing: false, speed: 1, layers: { trace: false, killLines: true, grenades: true }, level: "upper" } : null;
  return <div className="stu-view"><button className="stu-button-sm" onClick={onBack}>返回编辑</button><h1>{draft.title} · 讲解</h1><nav aria-label="阶段">{draft.phases.map(p => <button type="button" className="stu-button-sm" key={p.id} aria-pressed={phase?.id === p.id} onClick={() => onChange({ ...state, phaseId: p.id })}>{p.title}</button>)}</nav><h2>{phase?.title ?? "暂无阶段"}</h2><p>{phase?.body}</p><ul>{phase?.tasks.map(t => <li key={t.id}>{t.playerLabel}：{t.instruction}</li>)}</ul><button className="stu-button-sm" onClick={() => onChange({ ...state, tab: "diagram", replay: state.replay && { ...state.replay, playing: false } })}>手工示意</button><button className="stu-button-sm" disabled={!draft.evidence.length} onClick={() => onChange({ ...state, tab: "evidence", selectedEvidenceId: state.selectedEvidenceId ?? draft.evidence[0]?.id ?? null, replayEntryId: null, replay: null })}>比赛记录</button>
  {state.tab === "diagram" ? <section><h3>手工示意</h3>{map.lowerRadarImageUrl && <select aria-label="楼层" className="stu-input" value={level} onChange={e => setLevel(e.target.value as typeof level)}><option value="upper">上层</option><option value="lower">下层</option></select>}<MapAnnotationCanvas map={map} level={level} markers={phase?.markers ?? []} selectedMarkerId={null} /></section> : <section><h3>比赛记录</h3><select aria-label="证据" className="stu-input" value={state.selectedEvidenceId ?? ""} onChange={e => onChange({ ...state, selectedEvidenceId: e.target.value, replayEntryId: null, replay: null })}>{draft.evidence.map(e => <option key={e.id} value={e.id}>{e.source.fileName} · R{e.evidence.roundNumber}</option>)}</select>{resolution && !resolution.canOpenCurrent && <p>不可定位：{resolution.reason}</p>}{error && <p role="alert">读取比赛失败：{error}</p>}{model && !detail && <p>真实回合不存在，无法定位。</p>}{detail && !round && <div><p>此回合没有回放流。</p><p>回合 R{detail.roundNumber} · 赛前比分 {detail.scoreBefore} · 获胜方 {detail.winnerSide} · {detail.endReason}</p></div>}{model && round && replay && <ReplayViewer replay={model.replay} map={model.map.view} state={replay} onStateChange={next => onChange({ ...state, replayEntryId: resolution?.currentEntryId ?? null, replay: next })} />}</section>}</div>;
}
