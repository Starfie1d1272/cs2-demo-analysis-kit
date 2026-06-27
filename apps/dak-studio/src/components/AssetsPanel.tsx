import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import {
  isFactsStale,
  listDemoEntries,
  rebuildFactsFromZip,
  type StudioDemoEntry,
} from "../lib/library";
import { downloadTri, listAvailableTris, loadTrisManifest, type TrisManifest } from "../lib/tri-assets";
import { hasLibraryMaintenance } from "../lib/library-maintenance";
import { loadBrowserStorageOverview, type BrowserStorageOverview } from "../lib/storage-overview";
import { bytesLabel } from "../lib/format";
import { LibraryMaintenance } from "./LibraryMaintenance";
import {
  checkAssets,
  repairAssets,
  useAssetHealthAvailable,
  type AssetStatus,
} from "../lib/asset-health-bridge";

export interface AssetsPanelProps {
  entries: StudioDemoEntry[];
  onLibraryChanged?: (entries: StudioDemoEntry[]) => void;
  onNotice?: (message: string) => void;
}

export function AssetsPanel({ entries, onLibraryChanged, onNotice = () => {} }: AssetsPanelProps) {
  const desktop = hasLibraryMaintenance();
  const assetAvailable = useAssetHealthAvailable();
  const [browserOverview, setBrowserOverview] = useState<BrowserStorageOverview | null>(null);
  const [installedTris, setInstalledTris] = useState<string[]>([]);
  const [trisManifest, setTrisManifest] = useState<TrisManifest | null>(null);
  const [downloadingTri, setDownloadingTri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assetStatus, setAssetStatus] = useState<AssetStatus | null>(null);
  const [repairMsg, setRepairMsg] = useState("");

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

  // 使用完整 requiredTriMaps（非仅缺失项），这样 OK 时也能看到 7/7
  const requiredTrisMapNames = useMemo(
    () => assetStatus?.requiredTriMaps ?? [],
    [assetStatus]
  );
  const eventTotal = assetStatus?.bundledEventSlugs?.length ?? 0;
  const triTotal = requiredTrisMapNames.length;
  const allTriMaps = useMemo(
    () => [...new Set([...libraryMaps, ...requiredTrisMapNames])].sort(),
    [libraryMaps, requiredTrisMapNames]
  );

  async function refresh() {
    setInstalledTris(await listAvailableTris());
    if (!desktop) setBrowserOverview(await loadBrowserStorageOverview(demoStats.sizeBytes, demoStats.count));
    if (assetAvailable) {
      const s = await checkAssets(false);
      if (s) setAssetStatus(s);
    }
  }

  useEffect(() => { void refresh(); }, [entries, assetAvailable]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadTrisManifest().then(setTrisManifest).catch(() => setTrisManifest(null)); }, []);

  // ── 修复官方资产 ──

  async function repairOfficial() {
    if (!assetStatus) return;
    const items: Array<{ type: "event" | "tri"; slug?: string; mapName?: string }> = [
      ...(assetStatus.missingEvents ?? []).map((e) => ({ type: "event" as const, slug: e.slug })),
      ...(assetStatus.missingTris ?? []).map((t) => ({ type: "tri" as const, mapName: t.mapName })),
    ];
    if (items.length === 0) return;
    setRepairMsg("正在修复…");
    const job = await repairAssets(items, (j) => setRepairMsg(`下载中 ${j.current + 1}/${j.total}…`));
    setRepairMsg(job?.errors?.length ? `完成，${job.errors.length} 项失败` : "修复完成");
    const s = await checkAssets(false);
    if (s) setAssetStatus(s);
  }

  async function deepCheck() {
    setRepairMsg("正在深度校验…");
    const s = await checkAssets(true);
    if (s) setAssetStatus(s);
    setRepairMsg(s ? "校验完成" : "校验失败");
  }

  // ── 单个 tri 操作 ──

  async function fetchTri(mapName: string) {
    setDownloadingTri(mapName);
    onNotice(`正在下载 ${mapName}.tri…`);
    try {
      await downloadTri(mapName);
      setInstalledTris(await listAvailableTris());
      onNotice(`已补全 ${mapName}.tri`);
    } catch (err) {
      onNotice(`下载 ${mapName}.tri 失败：${err instanceof Error ? err.message : String(err)}`);
    } finally { setDownloadingTri(null); }
  }

  async function fetchAllMissing(maps: string[]) {
    for (const map of maps) await fetchTri(map);
  }

  // ── facts 重建 ──

  async function rebuildStale() {
    const stale = entries.filter(isFactsStale);
    if (stale.length === 0) return;
    if (!window.confirm(`将用当前分析口径重建 ${stale.length} 场旧口径 facts（从已存 ZIP，无需原始 .dem），继续？`)) return;
    setBusy(true);
    let done = 0;
    const failures: string[] = [];
    for (const [i, entry] of stale.entries()) {
      onNotice(`重建 facts（${i + 1}/${stale.length}）：${entry.fileName}…`);
      try {
        if (await rebuildFactsFromZip(entry.id)) done += 1;
        else failures.push(entry.fileName);
      } catch (err) { failures.push(err instanceof Error ? err.message : String(err)); }
    }
    onLibraryChanged?.(await listDemoEntries());
    onNotice(`重建完成：成功 ${done} 场${failures.length > 0 ? `，失败 ${failures.length} 场` : ""}`);
    setBusy(false);
  }

  // ── tri 行数据 ──

  const triRows = allTriMaps.map((map) => {
    const installed = installedTris.includes(map);
    const inLib = libraryMaps.includes(map);
    const inReq = requiredTrisMapNames.includes(map);
    let source: string;
    let sourceHint: string;
    if (inLib && inReq) {
      source = "资料库 + 官方赛事";
      sourceHint = "你的资料库里有这张图，官方赛事包也需要它";
    } else if (inReq) {
      source = "官方赛事包";
      sourceHint = "内置赛事/示例资产需要这张图的墙体数据";
    } else {
      source = "当前资料库";
      sourceHint = "你的资料库里有这张图，相关分析会用到墙体数据";
    }
    return { map, installed, source, sourceHint, isOfficial: inReq };
  });
  const missingMaps = triRows.filter((r) => !r.installed);

  async function repairTri(mapName: string) {
    setRepairMsg(`修复 ${mapName}.tri…`);
    await repairAssets([{ type: "tri", mapName }], (j) => setRepairMsg(`下载 ${mapName} ${j.current + 1}/${j.total}…`));
    setInstalledTris(await listAvailableTris());
    setRepairMsg("");
  }

  function statusLabel(s: AssetStatus) {
    switch (s.status) {
      case "ok": return <span className="stu-tag stu-tag-ok">完整</span>;
      case "not_installed": return <span className="stu-tag stu-tag-warn">未安装</span>;
      case "incomplete": return <span className="stu-tag stu-tag-warn">缺失</span>;
      case "corrupt": return <span className="stu-tag stu-tag-err">校验失败</span>;
    }
  }

  return (
    <div className="stu-view-body" style={{ display: "grid", gap: "var(--dak-gap, 16px)" }}>
      {/* ── 存储总览 ── */}
      {desktop ? (
        <LibraryMaintenance onNotice={onNotice} />
      ) : (
        <div className="stu-card">
          <b>存储占用</b>
          <p className="stu-muted">浏览器/开发环境下的占用估算。桌面版可看到精确的按字节分类与清理工具。</p>
          {browserOverview?.estimate && (
            <p className="stu-muted">本应用总占用约 <b>{bytesLabel(browserOverview.estimate.usage)}</b>
              {browserOverview.estimate.quota > 0 && ` / 配额 ${bytesLabel(browserOverview.estimate.quota)}`}</p>
          )}
          {browserOverview && (
            <table className="stu-mini-table">
              <thead><tr><th>分类</th><th>项数</th><th>占用</th></tr></thead>
              <tbody>{browserOverview.categories.map((c) => (
                <tr key={c.id}><td>{c.label}</td><td>{c.files}</td><td>{bytesLabel(c.bytes)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 官方资产集（0.7.0+）── */}
      {assetAvailable && assetStatus && (
        <div className="stu-card">
          <div className="stu-mgmt-section-head">
            <b><ShieldCheck size={15} /> 官方资产集</b>
            {assetStatus.status !== "ok" && (
              <>
                <button type="button" className="stu-button stu-button-ghost" onClick={() => void repairOfficial()}>
                  <Download size={15} /> 修复官方资产
                </button>
                <button type="button" className="stu-button-sm" onClick={() => void deepCheck()}>深度校验</button>
              </>
            )}
            {repairMsg && <span className="stu-muted"> {repairMsg}</span>}
          </div>
          <table className="stu-mini-table">
            <tbody>
              <tr><td>资产集</td><td>{assetStatus.assetSet || "—"}</td></tr>
              <tr><td>状态</td><td>{statusLabel(assetStatus)}</td></tr>
              <tr><td>赛事包</td>
                <td>{assetStatus.status === "ok"
                  ? `完整（${eventTotal}/${eventTotal}）`
                  : `${eventTotal - (assetStatus.missingEvents?.length ?? 0)}/${eventTotal} 已装`
                }
                  {assetStatus.missingEvents && assetStatus.missingEvents.length > 0 && (
                    <span className="stu-muted">（缺：{assetStatus.missingEvents.map((e) => e.name || e.slug).join("、")}）</span>
                  )}
                </td>
              </tr>
              <tr><td>地图数据</td>
                <td>{assetStatus.status === "ok"
                  ? `完整（${triTotal}/${triTotal}）`
                  : `${triTotal - (assetStatus.missingTris?.length ?? 0)}/${triTotal} 已装`
                }
                  {assetStatus.missingTris && assetStatus.missingTris.length > 0 && (
                    <span className="stu-muted">（缺：{assetStatus.missingTris.map((t) => `${t.mapName}←${t.requiredBy.join(",")}`).join("、")}）</span>
                  )}
                </td>
              </tr>
              <tr><td>安装清单</td><td>{assetStatus.manifestSource === "local" ? "本地" : assetStatus.manifestSource === "remote" ? "远程可用" : "不可用"}</td></tr>
            </tbody>
          </table>
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

      {/* ── .tri 地图资产（合并资料库 + 官方资产集）── */}
      <div className="stu-card">
        <div className="stu-mgmt-section-head">
          <b>.tri 地图资产</b>
          {missingMaps.length > 0 && (
            <button type="button" className="stu-button stu-button-ghost" disabled={downloadingTri != null}
              onClick={() => {
                const officialMissing = missingMaps.filter((r) => r.isOfficial).map((r) => r.map);
                const libMissing = missingMaps.filter((r) => !r.isOfficial).map((r) => r.map);
                void (async () => {
                  if (officialMissing.length > 0) {
                    await repairAssets(
                      officialMissing.map((m) => ({ type: "tri" as const, mapName: m })),
                      (j) => setRepairMsg(`修复 .tri ${j.current + 1}/${j.total}…`),
                    );
                    setInstalledTris(await listAvailableTris());
                  }
                  if (libMissing.length > 0) await fetchAllMissing(libMissing);
                  setRepairMsg("");
                })();
              }}
            >
              <Download size={15} /> 补全全部缺失（{missingMaps.length}）
            </button>
          )}
        </div>
        <p className="stu-muted">
          用于反应时间 / 预瞄的静态墙体 LOS。缺失只降级（仍保留视野锥/烟雾约束），不报错。
          {missingMaps.length > 0 && ` ${missingMaps.length} 张图缺 .tri，可一键补全。`}
        </p>
        <p className="stu-muted">
          “来源”表示这张图为什么出现在清单里：来自当前资料库、官方赛事包，或两边都需要。
        </p>
        {triRows.length === 0 ? (
          <p className="stu-muted">资料库为空，且未检测到官方资产集所需的 .tri。</p>
        ) : (
          <table className="stu-mini-table">
            <thead><tr><th>地图</th><th>.tri</th><th>来源</th><th>大小</th><th /></tr></thead>
            <tbody>{triRows.map((r) => {
              const entry = trisManifest?.maps[r.map];
              return (
                <tr key={r.map}>
                  <td>{r.map}{r.isOfficial && <span className="stu-tag stu-tag-ok" style={{ marginLeft: 4 }}>官方</span>}</td>
                  <td>{r.installed ? <span className="stu-tag stu-tag-ok">已装</span> : <span className="stu-tag stu-tag-warn">缺失</span>}</td>
                  <td className="stu-muted" title={r.sourceHint}>{r.source}</td>
                  <td>{entry ? bytesLabel(entry.size) : "—"}</td>
                  <td>{!r.installed && (
                    <button type="button" className="stu-button-sm" disabled={downloadingTri != null}
                      onClick={() => { void (r.isOfficial ? repairTri(r.map) : fetchTri(r.map)); }}>
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
