import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { deleteEventRecord, listEventRecords, type StudioEventRecord } from "../lib/events";
import { removeDemos, type StudioDemoEntry } from "../lib/library";
import { downloadAndImportEvent, importEventAssetArchive, importEventAssetFile, loadEventsManifest, pickAndImportEventAsset, supportsNativeEventImport } from "../lib/event-assets";
import type { EventsManifest } from "@cs2dak/contract";
import { listSeriesRecords, type StudioSeriesRecord } from "../lib/series";
import { EventPackageMaker } from "./EventPackageMaker";
import { EventGallery } from "./EventGallery";
import { BUILTIN_EVENTS, type BuiltinEvent } from "../lib/builtin-events";
import { loadBundledEventsManifest } from "../lib/bundled-events";
import { KIND_OPTIONS } from "../lib/event-maker";

const KIND_LABEL: Record<string, string> = { ...Object.fromEntries(KIND_OPTIONS.map((k) => [k.value, k.label])), showcase: "示例" };
const SOURCE_LABEL: Record<string, string> = { rivalhub: "RivalHub", manual: "本地制作", r2: "在线下载" };
const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;
const sourceLabel = (source: string) => SOURCE_LABEL[source] ?? source;

export function EventManager({
  entries,
  onNotice,
  onLibraryChanged,
  onLoadBuiltin,
}: {
  entries: StudioDemoEntry[];
  onNotice: (message: string) => void;
  onLibraryChanged?: (entries: StudioDemoEntry[]) => void;
  onLoadBuiltin: (builtin: BuiltinEvent) => Promise<void> | void;
}) {
  const [events, setEvents] = useState<StudioEventRecord[]>([]);
  const [manifest, setManifest] = useState<EventsManifest | null>(null);
  const [bundledManifest, setBundledManifest] = useState<EventsManifest | null>(null);
  const [series, setSeries] = useState<StudioSeriesRecord[]>([]);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const cancelRequested = useRef(false);
  const nativeImport = supportsNativeEventImport();
  useEffect(() => { void Promise.all([listEventRecords(), listSeriesRecords()]).then(([nextEvents, nextSeries]) => { setEvents(nextEvents); setSeries(nextSeries); }); }, []);
  useEffect(() => { void loadEventsManifest().then(setManifest).catch(() => setManifest(null)); }, []);
  useEffect(() => { void loadBundledEventsManifest().then(setBundledManifest).catch(() => setBundledManifest(null)); }, []);

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

  async function loadBuiltin(builtin: BuiltinEvent) {
    setBusySlug(builtin.slug);
    try {
      await onLoadBuiltin(builtin);
      setEvents(await listEventRecords());
      setSeries(await listSeriesRecords());
    } finally {
      setBusySlug(null);
    }
  }

  function downloadOnline(asset: EventsManifest["events"][number]) {
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
  }

  async function loadBundledEvent(asset: EventsManifest["events"][number]) {
    cancelRequested.current = false;
    setBusySlug(asset.slug);
    try {
      const url = `./bundled-events/${asset.slug}.zip`;
      onNotice(`正在载入本地预装赛事「${asset.name}」…`);
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`无法加载预装赛事包：HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) throw new Error("预装赛事包不可达（bundled-events 不完整或缺失）");
      const buffer = await response.arrayBuffer();
      const result = await importEventAssetArchive(buffer, entries, asset.slug, { onProgress: onNotice, isCancelled: () => cancelRequested.current });
      onLibraryChanged?.(result.entries);
      setEvents(await listEventRecords());
      setSeries(await listSeriesRecords());
      onNotice(`${result.cancelled ? "已停止" : "已载入"}预装赛事「${result.event.event.name}」：匹配 ${result.event.matchedMaps} 图，待补 ${result.event.missingMaps} 图${result.errors.length ? `；${result.errors.length} 图失败，可重试续导` : ""}`);
    } catch (error) {
      onNotice(`预装赛事载入失败：${error instanceof Error ? error.message : String(error)}`);
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
  {/* 资料库的赛事包入口：下载、导入、移除都在数据生命周期内完成。 */}
    <details className="stu-card" open>
      <summary><b>导入赛事资源包</b></summary>
      <p className="stu-muted">下载内置示例或在线赛事，或导入本地赛事资源包（含 event-package.json 与各图 ZIP）。导入后自动建立赛事、系列和地图关联。</p>
      <EventGallery
        builtins={BUILTIN_EVENTS}
        bundledManifest={bundledManifest}
        manifest={manifest}
        busySlug={busySlug}
        onLoadBuiltin={(builtin) => void loadBuiltin(builtin)}
        onLoadBundled={(asset) => void loadBundledEvent(asset)}
        onDownloadOnline={downloadOnline}
      />
      <div className="stu-header-actions">
        {nativeImport && <button type="button" className="stu-button stu-button-ghost" disabled={busySlug != null} onClick={() => void importNative()}>{busySlug === "__local__" ? "逐图导入中…" : "导入本地资源包（低内存）"}</button>}
        {!nativeImport && <label className="stu-button stu-button-ghost">
          导入本地资源包 .zip
          <input hidden type="file" accept=".zip,application/zip" onChange={(event) => void importFile(event)} />
        </label>}
        {busySlug != null && <button type="button" className="stu-button-sm" onClick={() => { cancelRequested.current = true; onNotice("将在当前地图处理完成后停止"); }}>停止导入</button>}
      </div>
      {!nativeImport && <p className="stu-muted">浏览器降级入口会把整个赛事包载入内存后逐图导入；桌面端走原生低内存路径，更适合大型赛事包。</p>}
    </details>

    {/* 已写入资料库的赛事组织记录；赛事页只负责浏览，不承担这些数据操作。 */}
    {events.length > 0 && (
      <details className="stu-card" open>
        <summary><b>已导入赛事（{events.length}）</b></summary>
        <table className="stu-mini-table">
          <thead><tr><th>赛事</th><th>类型</th><th>阶段</th><th>系列</th><th>已匹配地图</th><th>来源</th><th /></tr></thead>
          <tbody>{events.map((event) => {
            const rows = series.filter((row) => row.eventId === event.id);
            const total = rows.reduce((sum, row) => sum + (row.mapAssignments?.length ?? row.entryIds.length), 0);
            const linked = rows.reduce((sum, row) => sum + (row.mapAssignments?.filter((map) => map.entryId).length ?? row.entryIds.length), 0);
            return (
              <tr key={event.id}>
                <td>{event.sourceUrl ? <a href={event.sourceUrl} target="_blank" rel="noreferrer">{event.name} ↗</a> : event.name}</td>
                <td>{kindLabel(event.kind)}</td>
                <td>{event.stages.map((stage) => stage.name).join(" / ") || "—"}</td>
                <td>{event.seriesIds.length}</td>
                <td>{total > 0 ? `${linked} / ${total}` : "—"}</td>
                <td>{sourceLabel(event.source)}{event.readOnly ? " · 只读" : ""}</td>
                <td>
                  {(() => {
                    // r2 赛事可从 live manifest 按 slug 一键重新拉取（demo 被删/换机后补齐）。
                    const slug = event.id.replace(/^event:/, "");
                    const asset = manifest?.events.find((a) => a.slug === slug);
                    return asset ? (
                      <>
                        <button type="button" className="stu-button-sm" disabled={busySlug != null} onClick={() => downloadOnline(asset)}>
                          {busySlug === asset.slug ? "拉取中…" : "重新拉取"}
                        </button>
                        {" "}
                      </>
                    ) : null;
                  })()}
                  <button type="button" className="stu-button-sm" onClick={() => {
                    if (!window.confirm(`移除赛事「${event.name}」的组织记录？\n\ndemo 档案会保留在资料库，可重新建立赛事。`)) return;
                    void deleteEventRecord(event).then(async () => { setEvents(await listEventRecords()); setSeries(await listSeriesRecords()); onNotice(`已移除赛事「${event.name}」（demo 保留）`); });
                  }}>移除（保留 demo）</button>
                  {" "}
                  <button type="button" className="stu-button-sm stu-button-danger" onClick={() => {
                    const entryIds = [...new Set(rows.flatMap((row) => row.entryIds))];
                    if (entryIds.length === 0) { onNotice("该赛事无关联 demo，无需删除档案"); return; }
                    if (!window.confirm(`彻底删除赛事「${event.name}」及其 ${entryIds.length} 场 demo 档案？\n\n⚠️ demo 的 ZIP 会从资料库永久删除，不可撤销。`)) return;
                    void deleteEventRecord(event).then(async () => {
                      await removeDemos(entryIds, (done, total) => onNotice(`删除档案 ${done}/${total}…`));
                      onLibraryChanged?.(entries.filter((e) => !new Set(entryIds).has(e.id)));
                      setEvents(await listEventRecords());
                      setSeries(await listSeriesRecords());
                      onNotice(`已彻底删除赛事「${event.name}」及 ${entryIds.length} 场 demo`);
                    });
                  }}>删除赛事及 demo</button>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </details>
    )}
    <EventPackageMaker onNotice={onNotice} />
  </>;
}
