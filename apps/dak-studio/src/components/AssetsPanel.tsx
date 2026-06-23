import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import {
  isFactsStale,
  listDemoEntries,
  rebuildFactsFromZip,
  type StudioDemoEntry,
} from "../lib/library";
import { downloadTri, listAvailableTris, loadTrisManifest, type TrisManifest } from "../lib/tri-assets";
import { hasLibraryMaintenance } from "../lib/library-maintenance";
import { loadBrowserStorageOverview, type BrowserStorageOverview } from "../lib/storage-overview";
import { LibraryMaintenance } from "./LibraryMaintenance";

function bytesLabel(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export interface AssetsPanelProps {
  entries: StudioDemoEntry[];
  onLibraryChanged?: (entries: StudioDemoEntry[]) => void;
  onNotice?: (message: string) => void;
}

export function AssetsPanel({ entries, onLibraryChanged, onNotice = () => {} }: AssetsPanelProps) {
  const desktop = hasLibraryMaintenance();
  const [browserOverview, setBrowserOverview] = useState<BrowserStorageOverview | null>(null);
  const [installedTris, setInstalledTris] = useState<string[]>([]);
  const [trisManifest, setTrisManifest] = useState<TrisManifest | null>(null);
  const [downloadingTri, setDownloadingTri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const demoStats = useMemo(() => {
    const sizeBytes = entries.reduce((sum, e) => sum + (e.sizeBytes ?? 0), 0);
    const known = entries.every((e) => e.sizeBytes != null);
    return {
      count: entries.length,
      sizeBytes: entries.length > 0 ? sizeBytes : 0,
      sizeKnown: known,
      stale: entries.filter(isFactsStale).length,
      missingDem: entries.filter((e) => !e.sourceDemPath).length,
    };
  }, [entries]);

  const libraryMaps = useMemo(
    () => [...new Set(entries.map((e) => e.meta.mapName))].sort(),
    [entries]
  );

  async function refresh() {
    setInstalledTris(await listAvailableTris());
    if (!desktop) {
      setBrowserOverview(await loadBrowserStorageOverview(demoStats.sizeBytes, demoStats.count));
    }
  }

  useEffect(() => { void refresh(); }, [entries]);  // eslint-disable-line react-hooks/exhaustive-deps
  // tris 清单只拉一次（best-effort：离线/失败则无下载入口，仅展示已装/缺失）。
  useEffect(() => { void loadTrisManifest().then(setTrisManifest).catch(() => setTrisManifest(null)); }, []);

  async function fetchTri(mapName: string) {
    setDownloadingTri(mapName);
    onNotice(`正在下载 ${mapName}.tri…`);
    try {
      await downloadTri(mapName);
      setInstalledTris(await listAvailableTris());
      onNotice(`已补全 ${mapName}.tri`);
    } catch (err) {
      onNotice(`下载 ${mapName}.tri 失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloadingTri(null);
    }
  }

  async function fetchAllMissing(maps: string[]) {
    for (const map of maps) await fetchTri(map);
  }

  async function rebuildStale() {
    const stale = entries.filter(isFactsStale);
    if (stale.length === 0) return;
    if (!window.confirm(`将用当前分析口径重建 ${stale.length} 场旧口径 facts（从已存 ZIP，无需原始 .dem），继续？`)) return;
    setBusy(true);
    let done = 0;
    const failures: string[] = [];
    for (const [index, entry] of stale.entries()) {
      onNotice(`重建 facts（${index + 1}/${stale.length}）：${entry.fileName}…`);
      try {
        if (await rebuildFactsFromZip(entry.id)) done += 1;
        else failures.push(entry.fileName);
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    onLibraryChanged?.(await listDemoEntries());
    onNotice(`重建完成：成功 ${done} 场${failures.length > 0 ? `，失败 ${failures.length} 场` : ""}`);
    setBusy(false);
  }

  const triRows = libraryMaps.map((map) => ({ map, installed: installedTris.includes(map) }));
  const missingMaps = triRows.filter((r) => !r.installed);

  return (
    <div className="stu-view-body" style={{ display: "grid", gap: "var(--dak-gap, 16px)" }}>
      {/* ── 存储总览 ── */}
      {desktop ? (
        <LibraryMaintenance onNotice={onNotice} />
      ) : (
        <div className="stu-card">
          <b>存储占用</b>
          <p className="stu-muted">
            浏览器/开发环境下的占用估算。原始 ZIP 字节按导入记录汇总；其余分类仅计项数。
            桌面版可看到精确的按字节分类与清理工具。
          </p>
          {browserOverview?.estimate && (
            <p className="stu-muted">
              本应用总占用约 <b>{bytesLabel(browserOverview.estimate.usage)}</b>
              {browserOverview.estimate.quota > 0 && ` / 配额 ${bytesLabel(browserOverview.estimate.quota)}`}
            </p>
          )}
          {browserOverview && (
            <table className="stu-mini-table">
              <thead><tr><th>分类</th><th>项数</th><th>占用</th></tr></thead>
              <tbody>{browserOverview.categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td>{c.files}</td>
                  <td>{bytesLabel(c.bytes)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Demo 资产 ── */}
      <div className="stu-card">
        <div className="stu-mgmt-section-head">
          <b>Demo 资产</b>
          {demoStats.stale > 0 && (
            <button type="button" className="stu-button stu-button-ghost" disabled={busy} onClick={() => void rebuildStale()}>
              <RefreshCw size={15} /> 重建旧口径 facts（{demoStats.stale}）
            </button>
          )}
        </div>
        <table className="stu-mini-table">
          <tbody>
            <tr><td>场次</td><td>{demoStats.count}</td></tr>
            <tr><td>原始 ZIP 总占用</td><td>{demoStats.sizeKnown ? bytesLabel(demoStats.sizeBytes) : `≥ ${bytesLabel(demoStats.sizeBytes)}（部分历史条目未记录）`}</td></tr>
            <tr><td>旧口径 facts</td><td>{demoStats.stale > 0 ? <span className="stu-tag stu-tag-warn">{demoStats.stale} 场可重建</span> : "无"}</td></tr>
            <tr><td>缺原始 .dem 路径</td><td>{demoStats.missingDem}（无法从 .dem 重导，但可从 ZIP 重建 facts）</td></tr>
          </tbody>
        </table>
      </div>

      {/* ── .tri 地图资产 ── */}
      <div className="stu-card">
        <div className="stu-mgmt-section-head">
          <b>.tri 地图资产</b>
          {missingMaps.length > 0 && (
            <button
              type="button"
              className="stu-button stu-button-ghost"
              disabled={downloadingTri != null}
              onClick={() => void fetchAllMissing(missingMaps.map((r) => r.map))}
            >
              <Download size={15} /> 补全全部缺失（{missingMaps.length}）
            </button>
          )}
        </div>
        <p className="stu-muted">
          用于反应时间 / 预瞄的静态墙体 LOS。缺失只降级（仍保留视野锥/烟雾约束），不报错。
          {missingMaps.length > 0 && ` 当前资料库涉及 ${missingMaps.length} 张图缺 .tri，可一键补全。`}
        </p>
        {triRows.length === 0 ? (
          <p className="stu-muted">资料库为空。</p>
        ) : (
          <table className="stu-mini-table">
            <thead><tr><th>地图</th><th>.tri</th><th>大小</th><th /></tr></thead>
            <tbody>{triRows.map((r) => {
              const entry = trisManifest?.maps[r.map];
              return (
                <tr key={r.map}>
                  <td>{r.map}</td>
                  <td>{r.installed ? <span className="stu-tag stu-tag-ok">已装</span> : <span className="stu-tag stu-tag-warn">缺失</span>}</td>
                  <td>{entry ? bytesLabel(entry.size) : "—"}</td>
                  <td>{!r.installed && (
                    <button
                      type="button"
                      className="stu-button-sm"
                      disabled={downloadingTri != null}
                      onClick={() => void fetchTri(r.map)}
                    >
                      {downloadingTri === r.map ? "下载中…" : "下载"}
                    </button>
                  )}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
