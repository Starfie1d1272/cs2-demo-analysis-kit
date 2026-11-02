import { savedAnalyses, savedScopeSummary, type SavedAnalysis } from "../lib/saved-analysis";
import { summarizeAnalysisContext, type AnalysisEventScope } from "../lib/analysis-context";
import { listStudyMaterialsKind, resolveStudyMaterial, sortMaterials, type MaterialKind, type MaterialSummary } from "../lib/study-materials";
import type { MaterialRef } from "../lib/material-ref";
import { useEffect, useMemo, useRef, useState } from "react";
import { entryDate, formatMatchLabel, type StudioDemoEntry } from "../lib/demo-entry";
import { getLastWork, setLastWork, type LastWork } from "../lib/last-work";
import { getPinnedPlayer, type PinnedPlayer } from "../lib/pin";
import { parseTags } from "../lib/tags";

function validDate(entry: StudioDemoEntry): string | null {
  const date = entryDate(entry);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}
export function WorkbenchView({ entries, entriesReady, entriesStatus, entriesError, onRetryEntries, importing, importTagsRaw, onImportFiles, onNativeImport, onMatches, onOpenMatch, onPersonal, onResumeAnalysis, onOpenSaved, events, onOpenMaterial, onNewNote, onNewPlaybook }: {
  entries: StudioDemoEntry[]; entriesReady: boolean; entriesStatus: "loading" | "ready" | "error"; entriesError: string | null; onRetryEntries: () => void; importing: boolean; importTagsRaw: string; onImportFiles: (files: Iterable<File>, tags: string[]) => void;
  onNativeImport?: () => void; onMatches: () => void; onOpenMatch: (id: string, target?: { roundNumber: number; tick?: number }) => void;
  onOpenMaterial: (ref: MaterialRef) => void; onNewNote: () => void; onNewPlaybook: () => void;
  onOpenSaved: (row: SavedAnalysis) => void; events: AnalysisEventScope[];
  onPersonal: (pinned: PinnedPlayer | null) => void; onResumeAnalysis?: () => void;
}) {
  const [queries,setQueries] = useState<SavedAnalysis[]>([]);
  const [queryError,setQueryError] = useState(false);
  useEffect(() => { void savedAnalyses.list().then(result => { setQueries(result.rows); setQueryError(result.invalid.length > 0); }).catch(() => setQueryError(true)); }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [materialErrors, setMaterialErrors] = useState(false);
  useEffect(() => {
    let active = true;
    const kinds: MaterialKind[] = ["assignment-set", "match-sheet", "playbook", "study-note", "training-focus", "practice-lineup"];
    setMaterialErrors(false);
    for (const kind of kinds) void listStudyMaterialsKind(kind, entries).then(result => {
      if (active) setMaterials(previous => sortMaterials([...previous.filter(row => row.ref.kind !== kind), ...result.rows]));
    }).catch(() => { if (active) setMaterialErrors(true); });
    return () => { active = false; };
  }, [entries]);
  const [last, setLast] = useState<LastWork | null>(null);
  const [lastMaterial, setLastMaterial] = useState<{ status: "loading" | "ready" | "missing" | "error"; row?: MaterialSummary }>({ status: "loading" });
  const [lastMaterialRetry, setLastMaterialRetry] = useState(0);
  useEffect(() => {
    if (last?.target.kind !== "material") return;
    const ref = last.target.materialRef;
    let active = true;
    setLastMaterial({ status: "loading" });
    void resolveStudyMaterial(ref, entries).then(row => {
      if (active) setLastMaterial(row ? { status: "ready", row } : { status: "missing" });
    }).catch(() => { if (active) setLastMaterial({ status: "error" }); });
    return () => { active = false; };
  }, [last, entries, lastMaterialRetry]);
  const [pinned, setPinned] = useState<PinnedPlayer | null>(null);
  useEffect(() => { let active = true; void getLastWork().then(value => { if (active) setLast(value); }); void getPinnedPlayer().then(value => { if (active) setPinned(value); }); return () => { active = false; }; }, []);
  const recent = useMemo(() => [...entries].sort((a, b) => {
    const da = validDate(a), db = validDate(b);
    return (db ?? "").localeCompare(da ?? "") || b.importedAt - a.importedAt || a.id.localeCompare(b.id);
  }).slice(0, 6), [entries]);
  const match = last?.target.kind === "match" ? entries.find(entry => entry.id === (last.target.kind === "match" && last.target.entryId)) : undefined;
  return <div className="stu-view stu-workbench"><header className="stu-view-header"><div><h1>工作台</h1><p>从比赛开始复盘，或继续分析与备战。</p></div></header>
    <div className="stu-header-actions"><button type="button" className="stu-button-sm" onClick={onMatches}>全部比赛</button>
      {onNativeImport ? <button type="button" className="stu-button-sm" disabled={importing} onClick={onNativeImport}>导入比赛</button> : <><button type="button" className="stu-button-sm" disabled={importing} onClick={() => fileInput.current?.click()}>导入比赛</button><input ref={fileInput} type="file" accept=".zip,.dem" multiple hidden disabled={importing} onChange={e => { if (e.target.files) onImportFiles(e.target.files, parseTags(importTagsRaw)); e.target.value = ""; }} /></>}
    </div>
    {entriesStatus === "error" && <p role="alert">读取比赛资料失败{entriesError ? `：${entriesError}` : ""}。{entriesReady && "显示上次成功读取的数据。"} <button type="button" className="stu-button-sm" onClick={onRetryEntries}>重试</button></p>}
    {last && last.target.kind !== "saved-analysis" && <section><h2>继续上次</h2>{!entriesReady && last.target.kind === "match" ? <p>{entriesStatus === "error" ? "比赛资料读取失败。" : "正在读取比赛…"}</p> : match && last.target.kind === "match" ? <button type="button" className="stu-button-sm" onClick={() => { if (last.target.kind === "match") onOpenMatch(last.target.entryId, last.target.roundNumber === undefined ? undefined : { roundNumber: last.target.roundNumber, tick: last.target.tick }); }}>比赛 · {formatMatchLabel(match)} · {new Date(last.openedAt).toLocaleString()}</button> : last.target.kind === "material" && lastMaterial.status === "loading" ? <p>正在读取资料…</p> : last.target.kind === "material" && lastMaterial.status === "ready" && lastMaterial.row ? <button type="button" className="stu-button-sm" onClick={() => { if (last.target.kind === "material") onOpenMaterial(last.target.materialRef); }}>资料 · {lastMaterial.row.kindLabel} · {lastMaterial.row.title} · {new Date(last.openedAt).toLocaleString()}</button> : last.target.kind === "material" && lastMaterial.status === "error" ? <p role="alert">上次资料读取失败 <button type="button" className="stu-button-sm" onClick={() => { setLastMaterialRetry(value => value + 1); }}>重试</button></p> : <p>上次工作不可用 · {new Date(last.openedAt).toLocaleString()} <button type="button" className="stu-button-sm" onClick={() => { setLast(null); void setLastWork(null); }}>移除捷径</button></p>}</section>}
    {onResumeAnalysis && <section><h2>本次会话</h2><button type="button" className="stu-button-sm" onClick={onResumeAnalysis}>继续上次分析</button></section>}
    {queryError && <p role="alert">部分保存分析无法读取。</p>}
    {last?.target.kind === "saved-analysis" && !queries.find(q => last.target.kind === "saved-analysis" && q.id === last.target.queryId) && <p>上次保存分析不可用。<button className="stu-button-sm" onClick={() => { setLast(null); void setLastWork(null); }}>移除捷径</button></p>}
    {last?.target.kind === "saved-analysis" && queries.find(q => q.id === (last.target.kind === "saved-analysis" && last.target.queryId)) && <button className="stu-button-sm" onClick={() => { const q = queries.find(q => last.target.kind === "saved-analysis" && q.id === last.target.queryId); if (q) onOpenSaved(q); }}>继续上次保存分析</button>}
    {[["工作台快捷入口",queries.filter(q => q.workbenchShortcut).slice(0,5)],["最近保存分析",queries.slice(0,5)]].filter(([, items]) => (items as SavedAnalysis[]).length > 0).map(([label,items]) => <section key={label as string}><h2>{label as string}</h2>{(items as SavedAnalysis[]).map(q => <div key={q.id}><button className="stu-button-sm" onClick={() => onOpenSaved(q)}>{q.title} · {entriesReady ? summarizeAnalysisContext(q.context,entries,events) : "比赛资料尚未读取"} · {savedScopeSummary(q.context)}</button></div>)}</section>)}
    <section><h2>最近比赛</h2>{!entriesReady ? <p>{entriesStatus === "error" ? "比赛资料暂不可用。" : "正在读取比赛…"}</p> : recent.length === 0 ? <p>还没有比赛，导入后即可开始复盘。</p> : recent.map(entry => <div key={entry.id}><button type="button" className="stu-button-sm" onClick={() => onOpenMatch(entry.id)}>{entry.meta.mapName || "—"} · {entry.meta.teamAName || "—"} {entry.meta.teamAScore ?? "—"}:{entry.meta.teamBScore ?? "—"} {entry.meta.teamBName || "—"} · {validDate(entry) ?? "日期未知"}</button></div>)}</section>
    <section><h2>最近资料</h2><button type="button" className="stu-button-sm" onClick={onNewPlaybook}>新建战术</button><button type="button" className="stu-button-sm" onClick={onNewNote}>新建笔记</button>{materialErrors && <p role="alert">部分资料读取失败，请到资料页重试。</p>}{materials.slice(0, 5).map(item => <div key={`${item.ref.kind}:${item.ref.id}`}><button type="button" className="stu-button-sm" onClick={() => onOpenMaterial(item.ref)}>{item.kindLabel} · {item.title}</button></div>)}</section>
    <section><h2>我的关注</h2><button type="button" className="stu-button-sm" onClick={() => onPersonal(pinned)}>{pinned ? `我的分析 · ${pinned.name}` : "选择我的选手"}</button></section>
  </div>;
}
