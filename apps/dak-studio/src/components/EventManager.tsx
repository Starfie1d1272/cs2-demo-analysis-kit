import { useEffect, useState, type ChangeEvent } from "react";
import { deleteEventRecord, importEventPackageFile, listEventRecords, type StudioEventRecord } from "../lib/events";
import type { StudioDemoEntry } from "../lib/library";
import { downloadAndImportEvent, loadEventsManifest } from "../lib/event-assets";
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
  useEffect(() => { void Promise.all([listEventRecords(), listSeriesRecords()]).then(([nextEvents, nextSeries]) => { setEvents(nextEvents); setSeries(nextSeries); }); }, []);
  useEffect(() => { void loadEventsManifest().then(setManifest).catch(() => setManifest(null)); }, []);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = await importEventPackageFile(file, entries);
      setEvents(await listEventRecords());
      setSeries(await listSeriesRecords());
      onNotice(`已导入赛事「${result.event.name}」：${result.series.length} 个系列，匹配 ${result.matchedMaps} 图，待补 ${result.missingMaps} 图`);
    } catch (error) {
      onNotice(`赛事包导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return <>
    <details className="stu-card">
      <summary><b>赛事合集（{events.length}）</b></summary>
      <p className="stu-muted">导入 event-package/1.0 JSON，自动建立 Event → Series → Map，并按队伍、地图、文件名或 sha256 配对本地 ZIP。</p>
      <label className="stu-button stu-button-ghost">
        导入赛事包
        <input hidden type="file" accept=".json,application/json" onChange={(event) => void importFile(event)} />
      </label>
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
              <td><button type="button" className="stu-button-sm" onClick={() => {
                if (!window.confirm(`移除赛事「${event.name}」及其系列赛组织记录？原始 ZIP 不会删除。`)) return;
                void deleteEventRecord(event).then(async () => { setEvents(await listEventRecords()); setSeries(await listSeriesRecords()); onNotice(`已移除赛事「${event.name}」；原始 ZIP 保留`); });
              }}>移除</button></td>
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
              disabled={busySlug != null}
              onClick={() => {
                setBusySlug(asset.slug);
                void downloadAndImportEvent(asset, entries)
                  .then(async (result) => {
                    onLibraryChanged?.(result.entries);
                    setEvents(await listEventRecords());
                    setSeries(await listSeriesRecords());
                    onNotice(`已下载并导入「${result.event.event.name}」`);
                  })
                  .catch((error) => onNotice(error instanceof Error ? error.message : String(error)))
                  .finally(() => setBusySlug(null));
              }}
            >
              {busySlug === asset.slug ? "下载并导入中…" : `下载 ${asset.name}（${(asset.size / 1024 / 1024).toFixed(1)} MB）`}
            </button>
          ))}
        </div>
      )}
    </details>
    <EventPackageMaker onNotice={onNotice} />
  </>;
}
