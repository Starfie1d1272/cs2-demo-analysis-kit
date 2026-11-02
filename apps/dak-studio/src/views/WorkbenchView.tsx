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
export function WorkbenchView({ entries, entriesReady, importing, importTagsRaw, onImportFiles, onNativeImport, onMatches, onOpenMatch, onPersonal, onResumeAnalysis, onOpenMaterial, onNewNote, prepMigrationStatus, retryPrepMigration }: {
  entries: StudioDemoEntry[]; entriesReady: boolean; importing: boolean; importTagsRaw: string; onImportFiles: (files: Iterable<File>, tags: string[]) => void;
  onNativeImport?: () => void; onMatches: () => void; onOpenMatch: (id: string, target?: { roundNumber: number; tick?: number }) => void;
  prepMigrationStatus: "loading" | "ready" | "error"; retryPrepMigration: () => Promise<void>;
  onOpenMaterial: (ref: MaterialRef) => void; onNewNote: () => void;
  onPersonal: (pinned: PinnedPlayer | null) => void; onResumeAnalysis?: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [materialErrors, setMaterialErrors] = useState(false);
  useEffect(() => {
    let active = true;
    const kinds: MaterialKind[] = ["study-note", "training-focus", "practice-lineup", ...(prepMigrationStatus === "loading" ? [] : ["prep-item" as const])];
    setMaterialErrors(false);
    for (const kind of kinds) void listStudyMaterialsKind(kind, entries).then(result => {
      if (active) setMaterials(previous => sortMaterials([...previous.filter(row => row.ref.kind !== kind), ...result.rows]));
    }).catch(() => { if (active) setMaterialErrors(true); });
    return () => { active = false; };
  }, [entries, prepMigrationStatus]);
  const [last, setLast] = useState<LastWork | null>(null);
  const [lastMaterial, setLastMaterial] = useState<{ status: "loading" | "ready" | "missing" | "error"; row?: MaterialSummary }>({ status: "loading" });
  const [lastMaterialRetry, setLastMaterialRetry] = useState(0);
  useEffect(() => {
    if (last?.target.kind !== "material") return;
    const ref = last.target.materialRef;
    if (ref.kind === "prep-item" && prepMigrationStatus === "loading") { setLastMaterial({ status: "loading" }); return; }
    let active = true;
    setLastMaterial({ status: "loading" });
    void resolveStudyMaterial(ref, entries).then(row => {
      if (active) setLastMaterial(row ? { status: "ready", row } : { status: ref.kind === "prep-item" && prepMigrationStatus === "error" ? "error" : "missing" });
    }).catch(() => { if (active) setLastMaterial({ status: "error" }); });
    return () => { active = false; };
  }, [last, entries, prepMigrationStatus, lastMaterialRetry]);
  const [pinned, setPinned] = useState<PinnedPlayer | null>(null);
  useEffect(() => { let active = true; void getLastWork().then(value => { if (active) setLast(value); }); void getPinnedPlayer().then(value => { if (active) setPinned(value); }); return () => { active = false; }; }, []);
  const recent = useMemo(() => [...entries].sort((a, b) => {
    const da = validDate(a), db = validDate(b);
    return (db ?? "").localeCompare(da ?? "") || b.importedAt - a.importedAt || a.id.localeCompare(b.id);
  }).slice(0, 6), [entries]);
  const match = last?.target.kind === "match" ? entries.find(entry => entry.id === (last.target.kind === "match" && last.target.entryId)) : undefined;
  return <div className="stu-view"><header className="stu-view-header"><div><h1>工作台</h1><p>从比赛开始复盘，或继续分析与备战。</p></div></header>
    <div className="stu-header-actions"><button type="button" className="stu-button" onClick={onMatches}>全部比赛</button>
      {onNativeImport ? <button type="button" className="stu-button" disabled={importing} onClick={onNativeImport}>导入比赛</button> : <><button type="button" className="stu-button" disabled={importing} onClick={() => fileInput.current?.click()}>导入比赛</button><input ref={fileInput} type="file" accept=".zip,.dem" multiple hidden disabled={importing} onChange={e => { if (e.target.files) onImportFiles(e.target.files, parseTags(importTagsRaw)); e.target.value = ""; }} /></>}
    </div>
    {last && <section><h2>继续上次</h2>{!entriesReady && last.target.kind === "match" ? <p>正在读取比赛…</p> : match && last.target.kind === "match" ? <button type="button" className="stu-button" onClick={() => { if (last.target.kind === "match") onOpenMatch(last.target.entryId, last.target.roundNumber === undefined ? undefined : { roundNumber: last.target.roundNumber, tick: last.target.tick }); }}>比赛 · {formatMatchLabel(match)} · {new Date(last.openedAt).toLocaleString()}</button> : last.target.kind === "material" && lastMaterial.status === "loading" ? <p>正在读取资料…</p> : last.target.kind === "material" && lastMaterial.status === "ready" && lastMaterial.row ? <button type="button" className="stu-button" onClick={() => { if (last.target.kind === "material") onOpenMaterial(last.target.materialRef); }}>资料 · {lastMaterial.row.kindLabel} · {lastMaterial.row.title} · {new Date(last.openedAt).toLocaleString()}</button> : last.target.kind === "material" && lastMaterial.status === "error" ? <p role="alert">上次资料读取失败 <button type="button" className="stu-button-sm" onClick={() => { if (last.target.kind === "material" && last.target.materialRef.kind === "prep-item" && prepMigrationStatus === "error") void retryPrepMigration(); else setLastMaterialRetry(value => value + 1); }}>重试</button></p> : <p>上次工作不可用 · {new Date(last.openedAt).toLocaleString()} <button type="button" className="stu-button-sm" onClick={() => { setLast(null); void setLastWork(null); }}>移除捷径</button></p>}</section>}
    {onResumeAnalysis && <section><h2>本次会话</h2><button type="button" className="stu-button" onClick={onResumeAnalysis}>继续上次分析</button></section>}
    <section><h2>最近比赛</h2>{!entriesReady ? <p>正在读取比赛…</p> : recent.length === 0 ? <p>还没有比赛，导入后即可开始复盘。</p> : recent.map(entry => <div key={entry.id}><button type="button" className="stu-button" onClick={() => onOpenMatch(entry.id)}>{entry.meta.mapName || "—"} · {entry.meta.teamAName || "—"} {entry.meta.teamAScore ?? "—"}:{entry.meta.teamBScore ?? "—"} {entry.meta.teamBName || "—"} · {validDate(entry) ?? "日期未知"}</button></div>)}</section>
    <section><h2>最近资料</h2><button type="button" className="stu-button" onClick={onNewNote}>新建笔记</button>{materialErrors && <p role="alert">部分资料读取失败，请到资料页重试。</p>}{materials.slice(0, 5).map(item => <div key={`${item.ref.kind}:${item.ref.id}`}><button type="button" className="stu-button" onClick={() => onOpenMaterial(item.ref)}>{item.kindLabel} · {item.title}</button></div>)}</section>
    <section><h2>我的关注</h2><button type="button" className="stu-button" onClick={() => onPersonal(pinned)}>{pinned ? `我的分析 · ${pinned.name}` : "选择我的选手"}</button></section>
  </div>;
}
