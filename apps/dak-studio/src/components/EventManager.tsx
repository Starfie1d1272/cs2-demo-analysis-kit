import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { deleteEventRecord, listEventRecords, type StudioEventRecord } from "../lib/events";
import { removeDemos, type StudioDemoEntry } from "../lib/library";
import { BROWSER_EVENT_PACKAGE_LIMIT, downloadAndImportEvent, importEventAssetFile, loadEventsManifest, pickAndImportEventAsset, supportsNativeEventImport } from "../lib/event-assets";
import type { EventsManifest } from "@cs2dak/contract";
import { listSeriesRecords, type StudioSeriesRecord } from "../lib/series";
import { EventPackageMaker } from "./EventPackageMaker";

export function EventManager({
  entries,
  onNotice,
  onLibraryChanged,
}: {
  entries: StudioDemoEntry[];
  onNotice: (message: string) => void;
  onLibraryChanged?: (entries: StudioDemoEntry[]) => void;
}) {
  const [events, setEvents] = useState<StudioEventRecord[]>([]);
  const [manifest, setManifest] = useState<EventsManifest | null>(null);
  const [series, setSeries] = useState<StudioSeriesRecord[]>([]);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const cancelRequested = useRef(false);
  const nativeImport = supportsNativeEventImport();
  useEffect(() => { void Promise.all([listEventRecords(), listSeriesRecords()]).then(([nextEvents, nextSeries]) => { setEvents(nextEvents); setSeries(nextSeries); }); }, []);
  useEffect(() => { void loadEventsManifest().then(setManifest).catch(() => setManifest(null)); }, []);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    cancelRequested.current = false;
    setBusySlug("__local__");
    try {
      const { event: result, entries: nextEntries, errors, cancelled } = await importEventAssetFile(file, entries, { onProgress: onNotice, isCancelled: () => cancelRequested.current });
      onLibraryChanged?.(nextEntries);
      setEvents(await listEventRecords());
      setSeries(await listSeriesRecords());
      onNotice(`${cancelled ? "已停止" : "已导入"}赛事「${result.event.name}」：匹配 ${result.matchedMaps} 图，待补 ${result.missingMaps} 图${errors.length ? `；${errors.length} 图失败，可重试同一包续导` : ""}`);
    } catch (error) {
      onNotice(`赛事包导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally { setBusySlug(null); }
  }

  async function importNative() {
    cancelRequested.current = false;
    setBusySlug("__local__");
    try {
      const result = await pickAndImportEventAsset(entries, onNotice, () => cancelRequested.current);
      if (!result) return;
      onLibraryChanged?.(result.entries);
      setEvents(await listEventRecords());
      setSeries(await listSeriesRecords());
      onNotice(`${result.cancelled ? "已停止" : "已导入"}赛事「${result.event.event.name}」：匹配 ${result.event.matchedMaps} 图，待补 ${result.event.missingMaps} 图${result.errors.length ? `；${result.errors.length} 图失败，可重试同一包续导` : ""}`);
    } catch (error) {
      onNotice(`赛事包导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusySlug(null);
    }
  }

  return <>
    <details className="stu-card">
      <summary><b>赛事合集（{events.length}）</b></summary>
      <p className="stu-muted">导入赛事资源包 <code>&lt;slug&gt;.zip</code>（含 event-package.json + 各图 ZIP）：自动导入 demo 并建立 Event → Series → Map，按队伍/地图/文件名/sha256 配对。</p>
      {nativeImport && <button type="button" className="stu-button stu-button-ghost" disabled={busySlug != null} onClick={() => void importNative()}>{busySlug === "__local__" ? "逐图导入中…" : "选择赛事资源包（低内存）"}</button>}
      {!nativeImport && <label className="stu-button stu-button-ghost">
        导入赛事资源包 .zip
        <input hidden type="file" accept=".zip,application/zip" onChange={(event) => void importFile(event)} />
      </label>}
      {!nativeImport && <p className="stu-muted">浏览器降级入口仅支持 {(BROWSER_EVENT_PACKAGE_LIMIT / 1024 / 1024).toFixed(0)} MB 以下赛事包；大型赛事包必须使用桌面端。</p>}
      {busySlug != null && <button type="button" className="stu-button-sm" onClick={() => { cancelRequested.current = true; onNotice("将在当前地图处理完成后停止"); }}>停止导入</button>}
      {events.length > 0 && (
        <table className="stu-mini-table">
          <thead><tr><th>赛事</th><th>类型</th><th>阶段</th><th>系列</th><th>资源</th><th>来源</th><th /></tr></thead>
          <tbody>{events.map((event) => (
            <tr key={event.id}>
              <td>{event.name}</td>
              <td>{event.kind}</td>
              <td>{event.stages.map((stage) => stage.name).join(" / ") || "—"}</td>
              <td>{event.seriesIds.length}</td>
              <td>{(() => { const rows = series.filter((row) => row.eventId === event.id); const total = rows.reduce((sum, row) => sum + (row.mapAssignments?.length ?? row.entryIds.length), 0); const linked = rows.reduce((sum, row) => sum + (row.mapAssignments?.filter((map) => map.entryId).length ?? row.entryIds.length), 0); return `${linked}/${total} 图`; })()}</td>
              <td>{event.source}{event.readOnly ? " · 只读" : ""}</td>
              <td>
                <button type="button" className="stu-button-sm" onClick={() => {
                  if (!window.confirm(`移除赛事「${event.name}」？demo 档案保留在资料库。`)) return;
                  void deleteEventRecord(event).then(async () => { setEvents(await listEventRecords()); setSeries(await listSeriesRecords()); onNotice(`已移除赛事「${event.name}」`); });
                }}>移除赛事</button>
                {" "}
                <button type="button" className="stu-button-sm" onClick={() => {
                  const entryIds = [...new Set(series.filter((row) => row.eventId === event.id).flatMap((row) => row.entryIds))];
                  if (entryIds.length === 0) { onNotice("该赛事无关联 demo，无需删除档案"); return; }
                  if (!window.confirm(`删除赛事「${event.name}」及其全部 ${entryIds.length} 场 demo 档案？此操作不可撤销。`)) return;
                  void deleteEventRecord(event).then(async () => {
                    await removeDemos(entryIds, (done, total) => onNotice(`删除档案 ${done}/${total}…`));
                    onLibraryChanged?.(entries.filter((e) => !new Set(entryIds).has(e.id)));
                    setEvents(await listEventRecords());
                    setSeries(await listSeriesRecords());
                    onNotice(`已删除赛事「${event.name}」及 ${entryIds.length} 场 demo`);
                  });
                }}>连带档案</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {manifest && manifest.events.length > 0 && (
        <div>
          <h4>在线赛事资产</h4>
          {manifest.events.map((asset) => (
            <button
              key={asset.slug}
              type="button"
              className="stu-button stu-button-ghost"
              disabled={busySlug != null || (!nativeImport && asset.size > BROWSER_EVENT_PACKAGE_LIMIT)}
              onClick={() => {
                cancelRequested.current = false;
                setBusySlug(asset.slug);
                void downloadAndImportEvent(asset, entries, onNotice, () => cancelRequested.current)
                  .then(async (result) => {
                    onLibraryChanged?.(result.entries);
                    setEvents(await listEventRecords());
                    setSeries(await listSeriesRecords());
                    onNotice(`${result.cancelled ? "已停止" : "已下载并导入"}「${result.event.event.name}」${result.errors.length ? `；${result.errors.length} 图失败，可重试续导` : ""}`);
                  })
                  .catch((error) => onNotice(error instanceof Error ? error.message : String(error)))
                  .finally(() => setBusySlug(null));
              }}
            >
              {busySlug === asset.slug ? "下载并导入中…" : !nativeImport && asset.size > BROWSER_EVENT_PACKAGE_LIMIT ? `${asset.name}（需桌面端）` : `下载 ${asset.name}（${(asset.size / 1024 / 1024).toFixed(1)} MB）`}
            </button>
          ))}
        </div>
      )}
    </details>
    <EventPackageMaker onNotice={onNotice} />
  </>;
}
