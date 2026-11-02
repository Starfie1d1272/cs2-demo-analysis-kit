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
  const [queriesReady, setQueriesReady] = useState(false);
  useEffect(() => { void savedAnalyses.list().then(result => { setQueries(result.rows); setQueryError(result.invalid.length > 0); setQueriesReady(true); }).catch(() => setQueryError(true)); }, []);
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
  const savedLast = last?.target.kind === "saved-analysis" ? queries.find(q => last.target.kind === "saved-analysis" && q.id === last.target.queryId) : undefined;
  const fixed = queries.filter(q => q.workbenchShortcut).slice(0, 5);
  const fixedIds = new Set(fixed.map(q => q.id));
  const recentQueries = queries.filter(q => !fixedIds.has(q.id)).slice(0, 5);
  const hasContinue = !!last || !!onResumeAnalysis;
  return <div className="stu-view stu-workbench"><header className="stu-view-header"><div><h1>工作台</h1><p>从比赛开始复盘，或继续分析与备战。</p></div>
    <div className="stu-workbench-actions"><button type="button" className="stu-button-sm" onClick={onMatches}>全部比赛</button>
      {onNativeImport ? <button type="button" className="stu-button" disabled={importing} onClick={onNativeImport}>导入比赛</button> : <><button type="button" className="stu-button" disabled={importing} onClick={() => fileInput.current?.click()}>导入比赛</button><input ref={fileInput} type="file" accept=".zip,.dem" multiple hidden disabled={importing} onChange={e => { if (e.target.files) onImportFiles(e.target.files, parseTags(importTagsRaw)); e.target.value = ""; }} /></>}
    </div></header>
    {entriesStatus === "error" && <p role="alert">读取比赛资料失败{entriesError ? `：${entriesError}` : ""}。{entriesReady && "显示上次成功读取的数据。"} <button type="button" className="stu-button-sm" onClick={onRetryEntries}>重试</button></p>}
    {hasContinue && <section className="stu-workbench-continue"><h2>继续工作</h2><div className="stu-workbench-continue-list">
      {onResumeAnalysis && <button type="button" className="stu-workbench-row" onClick={onResumeAnalysis}><strong>继续本次会话分析</strong><span>返回分析</span></button>}
      {last && (last.target.kind === "match" ? !entriesReady ? <p>{entriesStatus === "error" ? "比赛资料读取失败。" : "正在读取比赛…"}</p> : match ? <button type="button" className="stu-workbench-row" onClick={() => { if (last.target.kind === "match") onOpenMatch(last.target.entryId, last.target.roundNumber === undefined ? undefined : { roundNumber: last.target.roundNumber, tick: last.target.tick }); }}><strong>比赛 · {formatMatchLabel(match)}</strong><span>{new Date(last.openedAt).toLocaleString()}</span></button> : null : last.target.kind === "material" ? lastMaterial.status === "loading" ? <p>正在读取资料…</p> : lastMaterial.status === "ready" && lastMaterial.row ? <button type="button" className="stu-workbench-row" onClick={() => { if (last.target.kind === "material") onOpenMaterial(last.target.materialRef); }}><strong>{lastMaterial.row.kindLabel} · {lastMaterial.row.title}</strong><span>{new Date(last.openedAt).toLocaleString()}</span></button> : lastMaterial.status === "error" ? <p role="alert">上次资料读取失败 <button type="button" className="stu-button-sm" onClick={() => setLastMaterialRetry(value => value + 1)}>重试</button></p> : null : savedLast ? <button type="button" className="stu-workbench-row" onClick={() => onOpenSaved(savedLast)}><strong>保存的分析 · {savedLast.title}</strong><span>{new Date(last.openedAt).toLocaleString()}</span></button> : !queriesReady && !queryError ? <p>正在读取保存的分析…</p> : null)}
      {last && ((last.target.kind === "match" && entriesReady && !match) || (last.target.kind === "material" && lastMaterial.status === "missing") || (last.target.kind === "saved-analysis" && queriesReady && !queryError && !savedLast)) && <p>上次工作不可用 <button type="button" className="stu-button-sm" onClick={() => { setLast(null); void setLastWork(null); }}>移除捷径</button></p>}
    </div></section>}
    <div className="stu-workbench-grid"><section className="stu-workbench-section"><div className="stu-workbench-heading"><h2>最近比赛</h2><button type="button" className="dak-evidence" onClick={onMatches}>查看全部</button></div>
      {!entriesReady ? <p>{entriesStatus === "error" ? "比赛资料暂不可用。" : "正在读取比赛…"}</p> : recent.length === 0 ? entriesStatus === "error" ? null : <p className="stu-muted">还没有比赛。导入比赛后，即可从这里开始复盘。</p> : recent.map(entry => <button type="button" className="stu-workbench-row" key={entry.id} onClick={() => onOpenMatch(entry.id)}><strong>{entry.meta.teamAName || "—"} <span>{entry.meta.teamAScore ?? "—"} : {entry.meta.teamBScore ?? "—"}</span> {entry.meta.teamBName || "—"}</strong><span>{entry.meta.mapName || "—"} · {validDate(entry) ?? "日期未知"}</span></button>)}
    </section><aside className="stu-workbench-aside"><section className="stu-workbench-section"><div className="stu-workbench-heading"><h2>保存的分析</h2></div>
      {queryError && <p role="alert">部分保存分析无法读取。</p>}
      {!queriesReady && !queryError && <p>正在读取保存的分析…</p>}
      {([ ["固定", fixed], ["最近", recentQueries] ] as [string, SavedAnalysis[]][]).map(([label, items]) => items.length > 0 && <div key={label}><h3>{label}</h3>{items.map(q => <button type="button" className="stu-workbench-row" key={q.id} onClick={() => onOpenSaved(q)}><strong>{q.title}</strong><span>{entriesReady ? summarizeAnalysisContext(q.context, entries, events) : "比赛资料尚未读取"} · {savedScopeSummary(q.context)}</span></button>)}</div>)}
      {queriesReady && !queryError && queries.length === 0 && <p className="stu-muted">暂无保存的分析条件。</p>}
    </section><section className="stu-workbench-section"><div className="stu-workbench-heading"><h2>最近资料</h2><div><button type="button" className="dak-evidence" onClick={onNewPlaybook}>新建战术</button> · <button type="button" className="dak-evidence" onClick={onNewNote}>新建笔记</button></div></div>
      {materialErrors && <p role="alert">部分资料读取失败，请到资料页重试。</p>}{materials.slice(0, 5).map(item => <button type="button" className="stu-workbench-row" key={`${item.ref.kind}:${item.ref.id}`} onClick={() => onOpenMaterial(item.ref)}><strong>{item.title}</strong><span>{item.kindLabel}</span></button>)}
    </section><section className="stu-workbench-section"><div className="stu-workbench-heading"><h2>我的关注</h2><button type="button" className="dak-evidence" onClick={() => onPersonal(pinned)}>{pinned ? `我的分析 · ${pinned.name}` : "选择我的选手"}</button></div></section></aside></div>
  </div>;
}
