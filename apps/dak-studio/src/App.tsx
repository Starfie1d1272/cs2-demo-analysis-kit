import { Bomb, ClipboardList, Coins, Crosshair, Film, LibraryBig, Settings, Swords, Trophy, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bulkUpdateTags, importDemoFile, listDemoEntries, removeDemo, updateDemoTags, type StudioDemoEntry } from "./lib/library";
import { EMPTY_SCOPE, applyScope, type CohortScopeState } from "./components/CohortScope";
import { detectDemBackend, exportDemToZip, isDemFile, pickAndExportDems, triggerWindowsDropCapture, type ExportedDemoFile } from "./lib/dem";
import { parseTags } from "./lib/tags";
import { APP_VERSION, checkForUpdate, type UpdateInfo } from "./lib/update";
import { LibraryView } from "./views/LibraryView";
import { MatchView } from "./views/MatchView";
import { PlayersView } from "./views/PlayersView";
import { LeaderboardView } from "./views/LeaderboardView";
import { TrailsView } from "./views/TrailsView";
import { ComingSoonView } from "./views/ComingSoonView";
import { TournamentDashboardView } from "./views/TournamentDashboardView";
import { UtilityView } from "./views/UtilityView";
import { EconomyView } from "./views/EconomyView";
import { ManagementView } from "./views/ManagementView";
import { loadIdentityState, buildCohortIdentityMap, type IdentityStoreState } from "./lib/identity";
import type { IdentityOptions } from "./lib/season";
import sampleZipUrl from "../../../fixtures/input/sample-match.zip?url";

// 八模块信息架构（docs/roadmap.md），未实现的模块以「制作中」占位展示
type StudioView =
  | "library"
  | "match"
  | "players"
  | "duel"
  | "utility"
  | "economy"
  | "tournament"
  | "coach"
  | "management";

const NAV: { key: StudioView; label: string; hint: string; icon: typeof LibraryBig; wip?: boolean }[] = [
  { key: "library", label: "资料库", hint: "导入与管理 Demo", icon: LibraryBig },
  { key: "match", label: "比赛工作台", hint: "回合 / 地图 / 回放", icon: Film },
  { key: "players", label: "个人实验室", hint: "档案 / 开局动线", icon: UserRound },
  { key: "duel", label: "对枪实验室", hint: "对枪与机制分析", icon: Swords, wip: true },
  { key: "utility", label: "道具实验室", hint: "道具价值与落点", icon: Bomb },
  { key: "economy", label: "经济与节奏", hint: "买局质量 / 回合 swing", icon: Coins },
  { key: "tournament", label: "赛事中台", hint: "排行榜 / 报表", icon: Trophy },
  { key: "coach", label: "教练工作台", hint: "战术模式与 playbook", icon: ClipboardList, wip: true },
  { key: "management", label: "管理", hint: "选手身份归并与队伍改名", icon: Settings }
];

const PLAYER_TABS = [
  { key: "profile", label: "选手档案" },
  { key: "trails", label: "开局动线" }
] as const;
type PlayerTab = (typeof PLAYER_TABS)[number]["key"];

const TOURNAMENT_TABS = [
  { key: "leaderboard", label: "排行榜" },
  { key: "dashboard", label: "赛事总览" }
] as const;
type TournamentTab = (typeof TOURNAMENT_TABS)[number]["key"];
type MatchDeepLink = { roundNumber: number; tick?: number };

export function App() {
  const [entries, setEntries] = useState<StudioDemoEntry[]>([]);
  const [view, setView] = useState<StudioView>("library");
  const [playerTab, setPlayerTab] = useState<PlayerTab>("profile");
  const [tournamentTab, setTournamentTab] = useState<TournamentTab>("leaderboard");
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null);
  const [matchDeepLink, setMatchDeepLink] = useState<MatchDeepLink | null>(null);
  const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scope, setScope] = useState<CohortScopeState>(EMPTY_SCOPE);
  const [identityState, setIdentityState] = useState<IdentityStoreState>({ version: 0, mappings: [], teamRenames: {} });
  // 导入标签输入放在 App：全窗口拖拽导入也要带上
  const [importTagsRaw, setImportTagsRaw] = useState("");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  // 稳定数组标识：避免 App 无关重渲染触发档案/排行榜重新聚合
  const scopedEntries = useMemo(() => applyScope(entries, scope), [entries, scope]);
  const identityOptions = useMemo<IdentityOptions | undefined>(
    () => identityState.version > 0
      ? { version: identityState.version, map: buildCohortIdentityMap(identityState.mappings) }
      : undefined,
    [identityState.version, identityState.mappings]
  );

  useEffect(() => {
    listDemoEntries()
      .then(setEntries)
      .catch((err) => setNotice(`读取本地资料库失败：${err instanceof Error ? err.message : String(err)}`));
    void checkForUpdate().then(setUpdate);
    void loadIdentityState().then(setIdentityState);
  }, []);

  const importFiles = useCallback(async (files: Iterable<File | ExportedDemoFile>, tags: string[] = [], initialErrors: string[] = []) => {
    const fileList = [...files];
    const items = fileList.map((item) => item instanceof File ? { file: item, sourceDemPath: null } : item);
    const zips = items.filter((item) => item.file.name.toLowerCase().endsWith(".zip"));
    const dems = items.filter((item) => isDemFile(item.file));
    if (zips.length === 0 && dems.length === 0 && initialErrors.length === 0) {
      setNotice("请选择 .dem 或 cs2-demo-format/2.0 ZIP 文件");
      return;
    }
    setImporting(true);
    setNotice(null);
    let imported = 0;
    let duplicates = 0;
    const errors: string[] = [...initialErrors];

    // .dem 先经 exporter 转 ZIP（数据库只存 ZIP）
    if (dems.length > 0) {
      const backend = await detectDemBackend();
      for (const [index, demItem] of dems.entries()) {
        const dem = demItem.file;
        try {
          setNotice(`正在导出 ${dem.name}…（${index + 1}/${dems.length}，demo 解析需要一点时间）`);
          zips.push(await exportDemToZip(dem, backend, setNotice));
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
    }

    for (const [index, item] of zips.entries()) {
      const file = item.file;
      try {
        if (zips.length > 1) setNotice(`正在入库 ${file.name}…（${index + 1}/${zips.length}）`);
        // 解析在主线程，逐场让出一帧，避免批量导入时 UI 完全冻结
        await new Promise((resolve) => setTimeout(resolve, 0));
        const result = await importDemoFile(file, { tags, sourceDemPath: item.sourceDemPath });
        if (result.duplicate) duplicates += 1;
        else imported += 1;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    setEntries(await listDemoEntries());
    const parts: string[] = [];
    if (imported > 0) parts.push(`导入 ${imported} 场`);
    if (duplicates > 0) parts.push(`跳过重复 ${duplicates} 场`);
    if (errors.length > 0) parts.push(`失败 ${errors.length} 场（${errors[0]}）`);
    setNotice(parts.join("，") || null);
    setImporting(false);
  }, []);

  // 桌面壳：原生文件对话框选 .dem/.zip → 本机 exporter 转 ZIP → 入库
  const importViaNativeDialog = useCallback(async () => {
    setImporting(true);
    setNotice(null);
    try {
      const { files, errors, cancelled } = await pickAndExportDems(setNotice);
      if (cancelled) {
        setNotice(null); // 用户取消了对话框
        return;
      }
      await importFiles(files, parseTags(importTagsRaw), errors);
    } catch (err) {
      setNotice(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  }, [importFiles, importTagsRaw]);

  /** pywebview 桌面壳提供原生对话框，由 LibraryView 条件展示。 */
  const nativeImportAvailable = typeof window.pywebview?.api?.pick_dems === "function";

  const loadSample = useCallback(async () => {
    setImporting(true);
    setNotice(null);
    try {
      const response = await fetch(sampleZipUrl);
      const blob = await response.blob();
      await importFiles([new File([blob], "2026-02-09_de_mirage_FURIA-vs-Team_Vitality_13-11.zip", { type: "application/zip" })]);
    } catch (err) {
      setNotice(`示例加载失败：${err instanceof Error ? err.message : String(err)}`);
      setImporting(false);
    }
  }, [importFiles]);

  const openDemo = useCallback((id: string, target?: MatchDeepLink) => {
    setSelectedDemoId(id);
    setMatchDeepLink(target ?? null);
    setView("match");
  }, []);

  const openPlayer = useCallback((playerKey: string) => {
    setSelectedPlayerKey(playerKey);
    setPlayerTab("profile");
    setView("players");
  }, []);

  const handleRemove = useCallback(
    async (id: string) => {
      await removeDemo(id);
      setEntries(await listDemoEntries());
      setSelectedDemoId((current) => (current === id ? null : current));
    },
    []
  );

  const handleUpdateTags = useCallback(async (id: string, tags: string[]) => {
    await updateDemoTags(id, tags);
    setEntries(await listDemoEntries());
  }, []);

  const handleBulkUpdateTags = useCallback(async (ids: string[], add: string[], remove: string[]) => {
    await bulkUpdateTags(ids, add, remove);
    setEntries(await listDemoEntries());
  }, []);

  /** 单场重导核心：exporter 转 ZIP 后原地替换；调用方负责 importing 状态与错误提示。 */
  const reexportOne = useCallback(async (entry: StudioDemoEntry) => {
    if (!entry.sourceDemPath) throw new Error(`${entry.fileName}：没有记录原始 .dem 路径`);
    const api = window.pywebview?.api;
    if (typeof api?.path_exists === "function" && !(await api.path_exists(entry.sourceDemPath))) {
      throw new Error(`${entry.fileName}：原始文件不存在（${entry.sourceDemPath}）`);
    }
    const backend = await detectDemBackend();
    const demName = entry.sourceDemPath.split(/[\\/]/).pop() ?? entry.fileName.replace(/\.zip$/i, ".dem");
    const demFile = new File([], demName);
    (demFile as File & { pywebviewFullPath?: string }).pywebviewFullPath = entry.sourceDemPath;
    const exported = await exportDemToZip(demFile, backend, setNotice);
    const result = await importDemoFile(exported.file, {
      tags: entry.tags,
      sourceDemPath: entry.sourceDemPath,
      replaceId: entry.id
    });
    setSelectedDemoId((current) => (current === entry.id ? result.entry.id : current));
  }, []);

  const handleReexportDemo = useCallback(async (entry: StudioDemoEntry) => {
    setImporting(true);
    setNotice(`正在重新导出 ${entry.fileName}…`);
    try {
      await reexportOne(entry);
      setEntries(await listDemoEntries());
      setNotice(`已重新导出并替换 ${entry.fileName}`);
    } catch (err) {
      setNotice(`重新导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  }, [reexportOne]);

  /** 全部重新导出：逐场串行（exporter 与内存吃不住并发），失败不打断，结束后汇总。 */
  const handleReexportAll = useCallback(async () => {
    const targets = entries.filter((entry) => entry.sourceDemPath);
    if (targets.length === 0) {
      setNotice("没有记录原始 .dem 路径的条目，无法批量重新导出");
      return;
    }
    if (!window.confirm(`将重新导出 ${targets.length} 场 demo（逐场进行，可能需要较长时间），继续？`)) return;
    setImporting(true);
    let done = 0;
    const failures: string[] = [];
    for (const [index, entry] of targets.entries()) {
      setNotice(`批量重新导出（${index + 1}/${targets.length}）：${entry.fileName}…`);
      try {
        await reexportOne(entry);
        done += 1;
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
      setEntries(await listDemoEntries());
    }
    setNotice(
      `批量重新导出完成：成功 ${done} 场` +
        (failures.length > 0 ? `，失败 ${failures.length} 场（${failures[0]}）` : "")
    );
    setImporting(false);
  }, [entries, reexportOne]);

  return (
    <div
      className="stu-app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
          // Windows EdgeChromium：主动把 File 引用发给 Python
          // 侧捕获本机路径，避免后续走字节回退 OOM。
          triggerWindowsDropCapture(e.dataTransfer.files);
          void importFiles(e.dataTransfer.files, parseTags(importTagsRaw));
        }
      }}
    >
      <aside className="stu-sidebar">
        <div className="stu-brand">
          <div className="stu-brand-mark">
            <Crosshair size={18} />
          </div>
          <div>
            <b>DAK Studio</b>
            <small>战术分析 · 打法复盘</small>
          </div>
        </div>
        <nav className="stu-nav">
          {NAV.map(({ key, label, hint, icon: Icon, wip }) => (
            <button
              key={key}
              type="button"
              className={view === key ? "stu-nav-item stu-nav-item-active" : "stu-nav-item"}
              onClick={() => setView(key)}
            >
              <Icon size={16} />
              <span>
                <b>
                  {label}
                  {wip && <i className="stu-wip-dot" title="制作中" />}
                </b>
                <small>{hint}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="stu-sidebar-foot">
          <span>{entries.length} 场 demo</span>
          <small>v{APP_VERSION} · v2 ZIP · 本地存储</small>
          {update && (
            <a className="stu-update-link" href={update.url} target="_blank" rel="noreferrer">
              新版本 v{update.latest} 可下载
            </a>
          )}
        </div>
      </aside>

      <main className="stu-main">
        {notice && (
          <div className="stu-notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)}>
              ✕
            </button>
          </div>
        )}
        {view === "library" && (
          <LibraryView
            entries={entries}
            importing={importing}
            importTagsRaw={importTagsRaw}
            onImportTagsChange={setImportTagsRaw}
            onImportFiles={importFiles}
            onNativeImport={nativeImportAvailable ? importViaNativeDialog : undefined}
            onLoadSample={loadSample}
            onOpenDemo={openDemo}
            onRemoveDemo={handleRemove}
            onUpdateTags={handleUpdateTags}
            onBulkUpdateTags={handleBulkUpdateTags}
            onReexportDemo={handleReexportDemo}
            onReexportAll={handleReexportAll}
          />
        )}
        {view === "match" && (
          <MatchView
            entries={entries}
            demoId={selectedDemoId}
            deepLink={matchDeepLink}
            onSelectDemo={(id) => {
              setSelectedDemoId(id);
              setMatchDeepLink(null);
            }}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "players" && (
          <>
            <div className="stu-subtabs" role="tablist" aria-label="个人实验室">
              {PLAYER_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={playerTab === key}
                  className={playerTab === key ? "stu-subtab stu-subtab-active" : "stu-subtab"}
                  onClick={() => setPlayerTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {playerTab === "profile" ? (
              <PlayersView
                allEntries={entries}
                entries={scopedEntries}
                scope={scope}
                onScopeChange={setScope}
                selectedPlayerKey={selectedPlayerKey}
                onSelectPlayer={setSelectedPlayerKey}
                onOpenMatch={openDemo}
                identityOptions={identityOptions}
                onGoLibrary={() => setView("library")}
              />
            ) : (
              <TrailsView
                allEntries={entries}
                entries={scopedEntries}
                scope={scope}
                onScopeChange={setScope}
                onGoLibrary={() => setView("library")}
              />
            )}
          </>
        )}
        {view === "duel" && (
          <ComingSoonView
            title="对枪实验室"
            description="对枪重构与射击机制分析——谁先开枪、TTK、武器对位、移动射击纪律。"
            planned={[
              "逐枪流（shots.json）接入 exporter",
              "Duel Finder：按位置 / 武器 / 先手筛选对枪",
              "Opening Duel 分析：首杀对位与 TTK 拆解",
              "移动射击与压枪纪律统计"
            ]}
            availableNow="目前可在「比赛工作台」的对位矩阵与击杀列表中查看对枪结果。"
          />
        )}
        {view === "utility" && (
          <UtilityView
            allEntries={entries}
            entries={scopedEntries}
            scope={scope}
            onScopeChange={setScope}
            onOpenMatch={openDemo}
            identityOptions={identityOptions}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "economy" && (
          <EconomyView
            allEntries={entries}
            entries={scopedEntries}
            scope={scope}
            onScopeChange={setScope}
            identityOptions={identityOptions}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "coach" && (
          <ComingSoonView
            title="教练工作台"
            description="战术模式识别与备战——pattern finder、playbook 沉淀与对手倾向分析。"
            planned={[
              "Rule-based 开局聚类与战术模式标注",
              "Timing Heatmap：战术关键事件按回合秒数分布",
              "Playbook / Anti-Strat 报告",
              "Veto 辅助（地图池倾向）"
            ]}
          />
        )}
        {view === "tournament" && (
          <>
            <div className="stu-subtabs" role="tablist" aria-label="赛事中台">
              {TOURNAMENT_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tournamentTab === key}
                  className={tournamentTab === key ? "stu-subtab stu-subtab-active" : "stu-subtab"}
                  onClick={() => setTournamentTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tournamentTab === "leaderboard" ? (
              <LeaderboardView
                allEntries={entries}
                entries={scopedEntries}
                scope={scope}
                onScopeChange={setScope}
                onPlayerClick={openPlayer}
                identityOptions={identityOptions}
                onGoLibrary={() => setView("library")}
              />
            ) : (
              <TournamentDashboardView
                allEntries={entries}
                entries={scopedEntries}
                scope={scope}
                onScopeChange={setScope}
                identityOptions={identityOptions}
                onGoLibrary={() => setView("library")}
              />
            )}
          </>
        )}
        {view === "management" && (
          <ManagementView
            allEntries={entries}
            entries={scopedEntries}
            scope={scope}
            onScopeChange={setScope}
            identity={identityState}
            onIdentityChange={setIdentityState}
            identityOptions={identityOptions}
            onGoLibrary={() => setView("library")}
          />
        )}
      </main>
    </div>
  );
}
