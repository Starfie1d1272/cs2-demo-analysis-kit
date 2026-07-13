import { Bomb, ClipboardList, Coins, Crosshair, Film, House, LibraryBig, Radar, Settings, Swords, Trophy, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bulkUpdateTags, formatMatchLabel, importDemoFile, isFactsStale, listDemoEntries, rebuildFactsFromZip, removeDemo, removeDemos, updateDemoSourcePath, updateDemoTags, type StudioDemoEntry } from "./lib/library";
import { CohortScope, type CohortScopeEvent, type CohortScopeState } from "./components/CohortScope";
import { AnalysisContextSummary } from "./components/AnalysisContextSummary";
import { CapabilityBar } from "./components/CapabilityBar";
import { detectDemBackend, exportDemToZip, isDemFile, pickAndExportDems, pickDemPaths, triggerWindowsDropCapture, watchDemoPath, type ExportedDemoFile } from "./lib/dem";
import { parseTags } from "./lib/tags";
import { listSeriesRecords, pruneOrphanSeries, type StudioSeriesRecord } from "./lib/series";
import { listEventRecords, type StudioEventRecord } from "./lib/events";
import { importEventAssetArchive } from "./lib/event-assets";
import { APP_VERSION, checkForUpdateOnChannel, type UpdateChannel, type UpdateInfo } from "./lib/update";
import { checkForUpdateViaBridge } from "./lib/updater-bridge";
import { UpdateControl } from "./components/UpdateControl";
import { UpdateModal } from "./components/UpdateModal";
import { AssetHealthBanner } from "./components/AssetHealthBanner";
import { LibraryDirButton } from "./components/LibraryDirButton";
import { HomeView } from "./views/HomeView";
import { LibraryView } from "./views/LibraryView";
import { MatchView } from "./views/MatchView";
import { PlayersView } from "./views/PlayersView";
import { TrailsView } from "./views/TrailsView";
import { TournamentDashboardView } from "./views/TournamentDashboardView";
import { TeamView } from "./views/TeamView";
import { EventsView } from "./views/EventsView";
import { UtilityView } from "./views/UtilityView";
import { LineupsView } from "./views/LineupsView";
import { EconomyView } from "./views/EconomyView";
import { ManagementView, type ManagementTab } from "./views/ManagementView";
import { DuelView } from "./views/DuelView";
import { CoachView } from "./views/CoachView";
import { RadarFieldView } from "./views/RadarFieldView";
import { loadIdentityState, buildCohortIdentityMap, type IdentityStoreState } from "./lib/identity";
import type { IdentityOptions } from "./lib/season";
import type { BuiltinEvent } from "./lib/builtin-events";
import { createEvidenceContinuation, type EvidenceContinuation, type OpenEvidence } from "./lib/evidence-continuation";
import {
  applyCohortScopeProjection,
  cohortScopeProjection,
  createAnalysisContextPreset,
  resolveAnalysisCorpus,
  summarizeAnalysisContext,
  type AnalysisContext,
} from "./lib/analysis-context";
import { deriveCapabilityAvailability, loadCapabilityAvailabilityInputs, type CapabilityAvailability, type CapabilityRepairAction, type StudioCapability } from "./lib/capability-availability";
import { getPinnedPlayer } from "./lib/pin";

type StudioView =
  | "home"
  | "library"
  | "match"
  | "players"
  | "teams"
  | "trails"
  | "duel"
  | "utility"
  | "lineups"
  | "economy"
  | "events"
  | "coach"
  | "control"
  | "management";

type NavItem = { key: StudioView; label: string; hint: string; icon: typeof LibraryBig };
const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "开始",
    items: [
      { key: "home", label: "我的复盘", hint: "个人状态与待复核", icon: House },
      { key: "library", label: "资料库", hint: "导入与管理 Demo", icon: LibraryBig },
      { key: "match", label: "比赛复盘", hint: "回合 / 地图 / 回放", icon: Film }
    ]
  },
  {
    label: "选手复盘",
    items: [
      { key: "players", label: "选手", hint: "画像 / 趋势 / 机制", icon: UserRound },
      { key: "trails", label: "开局动线", hint: "默认位 / 出门路线", icon: Radar },
      { key: "duel", label: "对枪", hint: "证据 / 态势 / 机制", icon: Swords }
    ]
  },
  {
    label: "对象分析",
    items: [
      { key: "teams", label: "队伍", hint: "基础盘面 / 专项入口", icon: UserRound },
      { key: "events", label: "赛事", hint: "目录 / 总览 / 赛程", icon: Trophy },
      { key: "economy", label: "经济与转化", hint: "手枪 / 人数优势 / 经济对位", icon: Coins },
      { key: "utility", label: "道具价值", hint: "闪光 / 雷火 / 烟", icon: Bomb },
      { key: "lineups", label: "道具点位", hint: "出手 / 落点 / 练习", icon: Bomb },
      { key: "control", label: "控图", hint: "覆盖场 / 赛事基线 / 队伍差分", icon: Radar }
    ]
  },
  {
    label: "备战",
    items: [
      { key: "coach", label: "Coach", hint: "模式 / 清单 / 报告", icon: ClipboardList }
    ]
  }
];
const MANAGEMENT_NAV: NavItem = { key: "management", label: "管理", hint: "身份归并 · 资料库维护 · 赛事资产", icon: Settings };

type EventMode = "directory" | "overview";
type MatchDeepLink = { roundNumber: number; tick?: number };
const UPDATE_CHANNEL_KEY = "dak:update-channel";
const CAPABILITY_BY_VIEW: Partial<Record<StudioView, StudioCapability>> = {
  home: "personal-review", players: "map-role", teams: "map-role", duel: "duel", economy: "economy", utility: "utility", lineups: "lineup", control: "control", coach: "tactical",
};

function initialUpdateChannel(): UpdateChannel {
  return localStorage.getItem(UPDATE_CHANNEL_KEY) === "beta" ? "beta" : "stable";
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={active ? "stu-nav-item stu-nav-item-active" : "stu-nav-item"}
      onClick={onClick}
      title={item.hint}
    >
      <Icon size={16} />
      <span><b>{item.label}</b><small>{item.hint}</small></span>
    </button>
  );
}

export function App() {
  const [entries, setEntries] = useState<StudioDemoEntry[]>([]);
  const [view, setView] = useState<StudioView>("home");
  const [eventMode, setEventMode] = useState<EventMode>("directory");
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null);
  const [matchDeepLink, setMatchDeepLink] = useState<MatchDeepLink | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [analysisContext, setAnalysisContext] = useState<AnalysisContext>(() => createAnalysisContextPreset("explore"));
  const [evidenceContinuation, setEvidenceContinuation] = useState<EvidenceContinuation | null>(null);
  const [returningEvidence, setReturningEvidence] = useState<EvidenceContinuation | null>(null);
  const [eventRecords, setEventRecords] = useState<StudioEventRecord[]>([]);
  const [seriesRecords, setSeriesRecords] = useState<StudioSeriesRecord[]>([]);
  const [identityState, setIdentityState] = useState<IdentityStoreState>({ version: 0, mappings: [], teamRenames: {} });
  // 导入标签输入放在 App：全窗口拖拽导入也要带上
  const [importTagsRaw, setImportTagsRaw] = useState("");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [showLatestMsg, setShowLatestMsg] = useState(false);
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>(initialUpdateChannel);
  const [contextEditorOpen, setContextEditorOpen] = useState(false);
  const [capabilityAvailability, setCapabilityAvailability] = useState<CapabilityAvailability | null>(null);
  const [managementInitialTab, setManagementInitialTab] = useState<ManagementTab>("identity");

  async function doCheckUpdate() {
    setCheckingUpdate(true);
    setShowLatestMsg(false);
    try {
      // 桌面壳优先走 Python 桥（urllib，无 CORS），dev 退浏览器 fetch。
      const info = (await checkForUpdateViaBridge(updateChannel)) ?? (await checkForUpdateOnChannel(updateChannel));
      setUpdate(info);
      if (!info) {
        setShowLatestMsg(true);
        setTimeout(() => setShowLatestMsg(false), 3000);
      }
    } finally {
      setCheckingUpdate(false);
    }
  }

  function changeUpdateChannel(channel: UpdateChannel) {
    setUpdateChannel(channel);
    localStorage.setItem(UPDATE_CHANNEL_KEY, channel);
    setUpdate(null);
    setShowLatestMsg(false);
  }

  const eventScopes = useMemo<CohortScopeEvent[]>(() => {
    const seriesById = new Map(seriesRecords.map((series) => [series.id, series]));
    return eventRecords
      .map((event) => ({
        id: event.id,
        name: event.name,
        entryIds: [...new Set(event.seriesIds.flatMap((id) => seriesById.get(id)?.entryIds ?? []))]
      }))
      .filter((event) => event.entryIds.length > 0);
  }, [eventRecords, seriesRecords]);

  // 稳定数组标识：避免 App 无关重渲染触发档案/排行榜重新聚合
  const scopedEntries = useMemo(
    () => resolveAnalysisCorpus(entries, analysisContext.corpus, eventScopes),
    [entries, analysisContext.corpus, eventScopes]
  );
  /** 旧页面短期仍读 CohortScopeState；其值完全由 AnalysisContext 投影，不再拥有 App state。 */
  const legacyScope = useMemo<CohortScopeState>(() => cohortScopeProjection(analysisContext), [analysisContext]);
  const selectedPlayerKey = analysisContext.focus.kind === "self" || analysisContext.focus.kind === "player"
    ? analysisContext.focus.playerKey
    : null;
  const selectedTeam = analysisContext.focus.kind === "team" ? analysisContext.focus.teamName : null;
  const displayedCapabilityAvailability = useMemo<CapabilityAvailability | null>(() => {
    if (view !== "coach" || !capabilityAvailability) return capabilityAvailability;
    const requiredRole = analysisContext.goal === "opponent-prep" ? analysisContext.roles.opponent : analysisContext.roles.beneficiary;
    if (requiredRole) return capabilityAvailability;
    return {
      ...capabilityAvailability,
      status: "unavailable",
      eligibleMatches: 0,
      excluded: [{
        reason: analysisContext.goal === "opponent-prep" ? "请选择对手队伍" : "请选择己方队伍",
        count: scopedEntries.length,
        entryIds: scopedEntries.map((entry) => entry.id),
      }],
      repairActions: [],
    };
  }, [analysisContext.goal, analysisContext.roles.beneficiary, analysisContext.roles.opponent, capabilityAvailability, scopedEntries, view]);
  const updateLegacyScope = useCallback((next: CohortScopeState) => {
    setAnalysisContext((current) => applyCohortScopeProjection(current, next));
  }, []);
  const identityOptions = useMemo<IdentityOptions | undefined>(
    () => identityState.version > 0
      ? { version: identityState.version, map: buildCohortIdentityMap(identityState.mappings), teamRenames: identityState.teamRenames }
      : undefined,
    [identityState.version, identityState.mappings, identityState.teamRenames]
  );
  const openCapabilityRepair = useCallback((action: CapabilityRepairAction) => {
    if (action === "install-tri") {
      setManagementInitialTab("assets");
      setView("management");
      return;
    }
    setView("library");
  }, []);
  const selectRadarTeam = useCallback((teamName: string | null) => {
    setAnalysisContext((current) => ({
      ...current,
      goal: teamName ? "team-analysis" : current.goal === "team-analysis" ? "explore" : current.goal,
      focus: teamName ? { kind: "team", teamName } : current.focus.kind === "team" ? { kind: "aggregate" } : current.focus,
    }));
  }, []);

  useEffect(() => {
    const capability = CAPABILITY_BY_VIEW[view];
    if (!capability || scopedEntries.length === 0) { setCapabilityAvailability(null); return; }
    let cancelled = false;
    void loadCapabilityAvailabilityInputs(scopedEntries)
      .then((inputs) => { if (!cancelled) setCapabilityAvailability(deriveCapabilityAvailability(scopedEntries, capability, inputs)); })
      .catch(() => { if (!cancelled) setCapabilityAvailability(null); });
    return () => { cancelled = true; };
  }, [view, scopedEntries]);

  const refreshEventRecords = useCallback(async () => {
    const [nextEvents, nextSeries] = await Promise.all([listEventRecords(), listSeriesRecords()]);
    setEventRecords(nextEvents);
    setSeriesRecords(nextSeries);
  }, []);

  useEffect(() => {
    listDemoEntries()
      .then(async (loaded) => {
        setEntries(loaded);
        // 启动时清理历史遗留的孤儿系列赛（删过 demo 但 record 残留，会造成 records>suggestions 计数错位）。
        await pruneOrphanSeries(new Set(loaded.map((entry) => entry.id))).catch(() => 0);
        await refreshEventRecords();
      })
      .catch((err) => setNotice(`读取本地资料库失败：${err instanceof Error ? err.message : String(err)}`));
    // 自动更新属于桌面壳职责。浏览器开发入口没有跨域桥，启动时主动请求发布源
    // 只会制造 CORS 错误；需要时仍可由用户手动检查。
    if (window.pywebview?.api) void doCheckUpdate();
    void loadIdentityState().then(setIdentityState);
    void getPinnedPlayer().then((pinned) => {
      if (!pinned) return;
      setAnalysisContext((current) => current.goal === "explore" && current.focus.kind === "aggregate"
        ? createAnalysisContextPreset("personal-review", {
            focus: { kind: "self", playerKey: pinned.playerKey, label: pinned.name },
          })
        : current);
    });
  }, [refreshEventRecords]);

  const importFiles = useCallback(async (files: Iterable<File | ExportedDemoFile>, tags: string[] = [], initialErrors: string[] = []) => {
    const fileList = [...files];
    const items = fileList.map((item) => item instanceof File ? { file: item, sourceDemPath: null } : item);
    const zips = items.filter((item) => item.file.name.toLowerCase().endsWith(".zip"));
    const dems = items.filter((item) => isDemFile(item.file));
    if (zips.length === 0 && dems.length === 0 && initialErrors.length === 0) {
      setNotice("请选择 .dem 或 cs2-demo-format/3.x ZIP 文件");
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

    // 解析 + facts 抽取都在 worker 池里跑；滑动窗口并发让批量导入并行、且不冻结 UI。
    // 并发 2：每场 worker 要驻留一份完整 DemoPackage（含 replay），并发过高会让多份大包
    // 同时占用 + 多个 worker 同时冷启动模块图，撑爆渲染器；2 兼顾吞吐与内存安全。
    const IMPORT_CONCURRENCY = 2;
    const total = zips.length;
    const queue = [...zips];
    let done = 0;
    const runWorker = async (): Promise<void> => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          const result = await importDemoFile(item.file, { tags, sourceDemPath: item.sourceDemPath });
          if (result.duplicate) duplicates += 1;
          else imported += 1;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        } finally {
          done += 1;
          if (total > 1) setNotice(`正在入库…（${done}/${total}）`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, total) }, () => runWorker()));
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

  // 载入一个内置赛事/示例：拉随包 event-package zip，走与在线/cologne 完全相同的导入路径
  // （importEventAssetArchive：逐图导入 demo + 建立赛事/系列/BP）。BP 已写在包里，无需回填。
  const loadBuiltinEvent = useCallback(async (builtin: BuiltinEvent) => {
    setImporting(true);
    setNotice(null);
    try {
      const response = await fetch(builtin.packageUrl);
      const bytes = await response.arrayBuffer();
      const existing = await listDemoEntries();
      const result = await importEventAssetArchive(bytes, existing, builtin.slug, { onProgress: setNotice });
      setEntries(await listDemoEntries());
      await refreshEventRecords();
      setNotice(`已载入「${result.event.event.name}」：匹配 ${result.event.matchedMaps} 图${result.errors.length ? `；${result.errors.length} 图失败` : ""}`);
    } catch (err) {
      setNotice(`载入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  }, []);

  const openDemo = useCallback((id: string, target?: MatchDeepLink) => {
    const entry = entries.find((row) => row.id === id);
    if (entry) {
      setAnalysisContext(createAnalysisContextPreset("match-review", {
        corpus: { eventIds: [], entryIds: [id], matchIds: [], maps: [], tags: [], excludedEntryIds: [] },
        focus: { kind: "match", entryId: id, label: formatMatchLabel(entry) },
      }));
    }
    setSelectedDemoId(id);
    setMatchDeepLink(target ?? null);
    setView("match");
  }, [entries]);

  const openEvidence = useCallback<OpenEvidence>((id, evidence, sourceKey, finding) => {
    setEvidenceContinuation(createEvidenceContinuation({
      sourceView: view,
      context: analysisContext,
      sourceKey,
      evidence,
      finding,
    }));
    setSelectedDemoId(id);
    setMatchDeepLink({ roundNumber: evidence.roundNumber, tick: evidence.tick });
    setView("match");
  }, [analysisContext, view]);

  const returnFromEvidence = useCallback(() => {
    if (!evidenceContinuation) return;
    setAnalysisContext(evidenceContinuation.context);
    setView(evidenceContinuation.sourceView as StudioView);
    setReturningEvidence(evidenceContinuation);
    setEvidenceContinuation(null);
  }, [evidenceContinuation]);

  useEffect(() => {
    if (!returningEvidence || view !== returningEvidence.sourceView) return;
    let frame = 0;
    let attempts = 0;
    const restoreSource = () => {
      const anchor = returningEvidence.sourceKey ? document.getElementById(returningEvidence.sourceKey) : null;
      if (anchor) {
        anchor.scrollIntoView({ block: "center" });
        setReturningEvidence(null);
        return;
      }
      if (attempts++ < 8) frame = window.requestAnimationFrame(restoreSource);
      else setReturningEvidence(null);
    };
    // 来源视图可能先挂壳、后完成异步 facts 渲染；等下一帧再找真实 DOM anchor。
    frame = window.requestAnimationFrame(restoreSource);
    return () => window.cancelAnimationFrame(frame);
  }, [returningEvidence, view]);

  // 一级页面是新的工作面：普通切页从页首开始，避免把上一页的深滚动位置
  // 泄漏到新页面。证据返回是唯一例外，由上面的 continuation 精确恢复来源锚点。
  useEffect(() => {
    if (!returningEvidence) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      document.querySelector<HTMLElement>(".stu-sidebar")?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    // 只在 view 真正变化时判断；returningEvidence 清空不能再次把已恢复的锚点拉回页首。
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLinkRawDemo = useCallback(async (entry: StudioDemoEntry) => {
    try {
      const paths = await pickDemPaths();
      const path = paths.find((candidate) => candidate.toLowerCase().endsWith(".dem")) ?? null;
      if (!path) {
        setNotice(paths.length > 0 ? "请选择 .dem 文件作为原始 demo 路径" : null);
        return;
      }
      await updateDemoSourcePath(entry.id, path);
      setEntries(await listDemoEntries());
      setNotice(`已关联原始 demo：${entry.fileName}`);
    } catch (err) {
      setNotice(`关联原始 demo 失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const watchRawDemo = useCallback(async (entryId: string, target?: MatchDeepLink) => {
    try {
      const entry = entries.find((row) => row.id === entryId);
      if (!entry) {
        setNotice("打开游戏失败：资料库条目不存在");
        return;
      }
      if (!entry.sourceDemPath) {
        setNotice("打开游戏失败：该条目还没有关联原始 .dem 路径");
        return;
      }
      const api = window.pywebview?.api;
      if (typeof api?.path_exists === "function" && !(await api.path_exists(entry.sourceDemPath))) {
        setNotice(`打开游戏失败：原始 demo 不存在（${entry.sourceDemPath}）`);
        return;
      }
      const result = await watchDemoPath(entry.sourceDemPath, target?.tick);
      if (result.ok) {
        setNotice(result.warning ?? `已请求 CS2 播放 ${entry.fileName}`);
      } else {
        setNotice(`打开游戏失败：${result.error}`);
      }
    } catch (err) {
      setNotice(`打开游戏失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [entries]);

  const openPlayer = useCallback((playerKey: string, label = playerKey) => {
    setAnalysisContext((current) => ({
      ...current,
      goal: "player-analysis",
      focus: { kind: "player", playerKey, label },
    }));
    setView("players");
  }, []);

  const openTeam = useCallback((teamName: string) => {
    setAnalysisContext((current) => ({
      ...current,
      goal: "team-analysis",
      focus: { kind: "team", teamName },
    }));
    setView("teams");
  }, []);

  const startEventAnalysis = useCallback((event: StudioEventRecord) => {
    setAnalysisContext(createAnalysisContextPreset("event-analysis", {
      corpus: { eventIds: [event.id], entryIds: [], matchIds: [], maps: [], tags: [], excludedEntryIds: [] },
      focus: { kind: "event", eventId: event.id, label: event.name },
      baseline: { kind: "event-peers", eventId: event.id },
    }));
    setEventMode("overview");
    setView("events");
  }, []);

  const handleRemove = useCallback(
    async (id: string) => {
      await removeDemo(id);
      const next = await listDemoEntries();
      setEntries(next);
      await pruneOrphanSeries(new Set(next.map((entry) => entry.id))).catch(() => 0);
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
  /** 逐场串行重新导出给定条目集合（exporter 与内存吃不住并发），失败不打断，结束后汇总。 */
  const reexportEntries = useCallback(async (targets: StudioDemoEntry[]) => {
    const withPath = targets.filter((entry) => entry.sourceDemPath);
    if (withPath.length === 0) {
      setNotice("选中的条目都没有记录原始 .dem 路径，无法重新导出");
      return;
    }
    if (!window.confirm(`将重新导出 ${withPath.length} 场 demo（逐场进行，可能需要较长时间），继续？`)) return;
    setImporting(true);
    let done = 0;
    const failures: string[] = [];
    for (const [index, entry] of withPath.entries()) {
      setNotice(`批量重新导出（${index + 1}/${withPath.length}）：${entry.fileName}…`);
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
  }, [reexportOne]);

  const handleReexportAll = useCallback(async () => {
    await reexportEntries(entries);
  }, [entries, reexportEntries]);

  /** 从已存 ZIP 重榨 facts（不走 .dem / cs2df）；逐场串行，失败不打断，结束汇总。 */
  const rebuildFactsForEntries = useCallback(async (targets: StudioDemoEntry[]) => {
    if (targets.length === 0) return;
    if (!window.confirm(`将用当前分析口径重建 ${targets.length} 场 facts（从已存 ZIP，无需原始 .dem），继续？`)) return;
    setImporting(true);
    let done = 0;
    const failures: string[] = [];
    for (const [index, entry] of targets.entries()) {
      setNotice(`重建 facts（${index + 1}/${targets.length}）：${entry.fileName}…`);
      try {
        if (await rebuildFactsFromZip(entry.id)) done += 1;
        else failures.push(`${entry.fileName}: 原始 ZIP 缺失`);
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    setEntries(await listDemoEntries());
    setNotice(
      `重建完成：成功 ${done} 场` + (failures.length > 0 ? `，失败 ${failures.length} 场（${failures[0]}）` : "")
    );
    setImporting(false);
  }, []);

  const handleRebuildFacts = useCallback(async (id: string) => {
    setImporting(true);
    setNotice("正在从 ZIP 重建 facts…");
    try {
      const entry = await rebuildFactsFromZip(id);
      setEntries(await listDemoEntries());
      setNotice(entry ? `已重建 ${entry.fileName} 的 facts` : "重建失败：原始 ZIP 缺失");
    } catch (err) {
      setNotice(`重建失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  }, []);

  const handleRebuildStale = useCallback(async () => {
    await rebuildFactsForEntries(entries.filter(isFactsStale));
  }, [entries, rebuildFactsForEntries]);

  const handleRebuildSelected = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    await rebuildFactsForEntries(entries.filter((entry) => idSet.has(entry.id)));
  }, [entries, rebuildFactsForEntries]);

  const handleReexportSelected = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    await reexportEntries(entries.filter((entry) => idSet.has(entry.id)));
  }, [entries, reexportEntries]);

  const handleRemoveMany = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!window.confirm(`确认从资料库删除 ${ids.length} 场 demo？此操作不可撤销。`)) return;
    setImporting(true);
    try {
      await removeDemos(ids, (done, total) => setNotice(`正在删除（${done}/${total}）…`));
      const next = await listDemoEntries();
      setEntries(next);
      await pruneOrphanSeries(new Set(next.map((entry) => entry.id))).catch(() => 0);
      setSelectedDemoId((current) => (current && ids.includes(current) ? null : current));
      setNotice(`已删除 ${ids.length} 场 demo`);
    } catch (err) {
      setNotice(`批量删除失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  }, []);

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
          {NAV_GROUPS.map((group) => (
            <section key={group.label} className="stu-nav-section" aria-label={group.label}>
              <span className="stu-nav-section-label">{group.label}</span>
              {group.items.map((item) => (
                <NavButton key={item.key} item={item} active={view === item.key} onClick={() => {
                  if (item.key === "home") {
                    setAnalysisContext((current) => createAnalysisContextPreset("personal-review", {
                      focus: current.focus.kind === "self" || current.focus.kind === "player"
                        ? { kind: "self", playerKey: current.focus.playerKey, label: current.focus.label }
                        : { kind: "aggregate" },
                    }));
                    void getPinnedPlayer().then((pinned) => {
                      if (!pinned) return;
                      setAnalysisContext((current) => current.goal === "personal-review"
                        ? createAnalysisContextPreset("personal-review", {
                            focus: { kind: "self", playerKey: pinned.playerKey, label: pinned.name },
                          })
                        : current);
                    });
                  }
                  if (item.key === "match") {
                    const entry = entries.find((row) => row.id === selectedDemoId) ?? entries[0];
                    if (entry) {
                      setSelectedDemoId(entry.id);
                      setMatchDeepLink(null);
                      setAnalysisContext(createAnalysisContextPreset("match-review", {
                        corpus: { eventIds: [], entryIds: [entry.id], matchIds: [], maps: [], tags: [], excludedEntryIds: [] },
                        focus: { kind: "match", entryId: entry.id, label: formatMatchLabel(entry) },
                      }));
                    }
                  }
                  if (item.key === "events") {
                    setEventMode("directory");
                    setAnalysisContext((current) => createAnalysisContextPreset("explore", { corpus: current.corpus }));
                  }
                  if (item.key === "teams" && analysisContext.focus.kind !== "team") {
                    const firstTeam = entries[0] ? (identityState.teamRenames[entries[0].meta.teamAName] ?? entries[0].meta.teamAName) : null;
                    if (firstTeam) setAnalysisContext((current) => createAnalysisContextPreset("team-analysis", { corpus: current.corpus, focus: { kind: "team", teamName: firstTeam }, baseline: current.baseline }));
                  }
                  setView(item.key);
                }} />
              ))}
            </section>
          ))}
        </nav>
        <div className="stu-sidebar-foot">
          <NavButton item={MANAGEMENT_NAV} active={view === "management"} onClick={() => { setManagementInitialTab("identity"); setView("management"); }} />
          <span>{entries.length} 场 demo</span>
          <small>v{APP_VERSION} · v3 ZIP · 本地存储</small>
          <label className="stu-update-channel">
            <span>更新通道</span>
            <select value={updateChannel} onChange={(e) => changeUpdateChannel(e.target.value === "beta" ? "beta" : "stable")}>
              <option value="stable">正式版</option>
              <option value="beta">测试版</option>
            </select>
          </label>
          <div className="stu-foot-actions">
            <LibraryDirButton onError={setNotice} />
            <button type="button" className="stu-check-update-btn" onClick={doCheckUpdate} disabled={checkingUpdate}>
              {checkingUpdate ? "检查中…" : showLatestMsg ? "已是最新" : "检查更新"}
            </button>
          </div>
          {update && <UpdateControl update={update} />}
        </div>
      </aside>

      {update && update.latest !== dismissedVersion && (
        <UpdateModal update={update} onDismiss={() => setDismissedVersion(update.latest)} />
      )}

      <main className="stu-main">
        <AssetHealthBanner />
        {notice && (
          <div className="stu-notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)}>
              ✕
            </button>
          </div>
        )}
        {entries.length > 0 && view !== "library" && view !== "management" && (
          <AnalysisContextSummary context={analysisContext} entries={entries} events={eventScopes} onEdit={() => setContextEditorOpen((current) => !current)} />
        )}
        {entries.length > 0 && contextEditorOpen && view !== "library" && view !== "management" && (
          <CohortScope
            entries={entries}
            scope={legacyScope}
            onChange={updateLegacyScope}
            teamRenames={identityState.teamRenames}
            events={eventScopes}
            teamSelection="single-focus"
          />
        )}
        {displayedCapabilityAvailability && <CapabilityBar availability={displayedCapabilityAvailability} onRepair={openCapabilityRepair} />}
        {view === "home" && (
          <HomeView
            entries={scopedEntries}
            onOpenMatch={openDemo}
            onOpenEvidence={openEvidence}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            onGoPlayers={(player) => player ? openPlayer(player.playerKey, player.name) : setView("players")}
            onGoLibrary={() => setView("library")}
            contextSummary={summarizeAnalysisContext(analysisContext, entries, eventScopes)}
            identityOptions={identityOptions}
          />
        )}
        {view === "library" && (
          <LibraryView
            entries={entries}
            importing={importing}
            importTagsRaw={importTagsRaw}
            onImportTagsChange={setImportTagsRaw}
            onImportFiles={importFiles}
            onNativeImport={nativeImportAvailable ? importViaNativeDialog : undefined}
            onNotice={setNotice}
            onLibraryChanged={setEntries}
            onLoadBuiltin={loadBuiltinEvent}
            onOpenDemo={openDemo}
            onRemoveDemo={handleRemove}
            onUpdateTags={handleUpdateTags}
            onBulkUpdateTags={handleBulkUpdateTags}
            onLinkRawDemo={nativeImportAvailable ? handleLinkRawDemo : undefined}
            onWatchRawDemo={nativeImportAvailable ? (entry) => void watchRawDemo(entry.id) : undefined}
            onReexportDemo={handleReexportDemo}
            onReexportAll={handleReexportAll}
            onReexportSelected={handleReexportSelected}
            onRemoveMany={handleRemoveMany}
            onRebuildFacts={handleRebuildFacts}
            onRebuildStale={handleRebuildStale}
            onRebuildSelected={handleRebuildSelected}
          />
        )}
        {view === "match" && (
          <MatchView
            entries={entries}
            demoId={selectedDemoId}
            deepLink={matchDeepLink}
            onSelectDemo={(id) => openDemo(id)}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            onGoLibrary={() => setView("library")}
            evidenceContinuation={evidenceContinuation}
            onReturnToSource={returnFromEvidence}
          />
        )}
        {view === "players" && (
          <PlayersView
            allEntries={entries}
            entries={scopedEntries}
            selectedTeam={selectedTeam}
            selectedPlayerKey={selectedPlayerKey}
            onSelectPlayer={openPlayer}
            onOpenMatch={openDemo}
            onOpenEvidence={openEvidence}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            returnEvidenceKey={returningEvidence?.sourceView === "players" ? returningEvidence.sourceKey : undefined}
            identityOptions={identityOptions}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "teams" && (
          <TeamView
            entries={scopedEntries}
            selectedTeam={analysisContext.focus.kind === "team" ? analysisContext.focus.teamName : null}
            onSelectTeam={openTeam}
            onOpenMatch={openDemo}
            onOpenCapability={setView}
            onOpenEvidence={openEvidence}
            returnEvidenceKey={returningEvidence?.sourceView === "teams" ? returningEvidence.sourceKey : undefined}
            onGoLibrary={() => setView("library")}
            identityOptions={identityOptions}
          />
        )}
        {view === "trails" && (
          <TrailsView
            allEntries={entries}
            entries={scopedEntries}
            identityOptions={identityOptions}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "duel" && (
          <DuelView
            allEntries={entries}
            entries={scopedEntries}
            selectedTeam={selectedTeam}
            onOpenMatch={openDemo}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            onGoLibrary={() => setView("library")}
            identityOptions={identityOptions}
            teamRenames={identityState.teamRenames}
            initialTab={analysisContext.goal === "personal-review" ? "records" : "opening"}
          />
        )}
        {view === "utility" && (
          <UtilityView
            allEntries={entries}
            entries={scopedEntries}
            selectedTeam={selectedTeam}
            onOpenMatch={openDemo}
            onOpenEvidence={openEvidence}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            identityOptions={identityOptions}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "lineups" && (
          <LineupsView
            allEntries={entries}
            entries={scopedEntries}
            onOpenMatch={openDemo}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "economy" && (
          <EconomyView
            allEntries={entries}
            entries={scopedEntries}
            selectedTeam={selectedTeam}
            identityOptions={identityOptions}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "coach" && (
          <CoachView
            allEntries={entries}
            entries={scopedEntries}
            onOpenMatch={openDemo}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            onGoLibrary={() => setView("library")}
            teamRenames={identityState.teamRenames}
            analysisContext={analysisContext}
            onAnalysisContextChange={setAnalysisContext}
          />
        )}
        {view === "control" && (
          <RadarFieldView
            entries={scopedEntries}
            teamRenames={identityState.teamRenames}
            selectedTeam={selectedTeam}
            onSelectTeam={selectRadarTeam}
          />
        )}
        {view === "events" && (eventMode === "overview" ? (
          <TournamentDashboardView
            allEntries={entries}
            entries={scopedEntries}
            selectedTeam={selectedTeam}
            identityOptions={identityOptions}
            onOpenMatch={openDemo}
            onOpenTeam={openTeam}
            onOpenPlayer={openPlayer}
            onGoLibrary={() => setView("library")}
            onGoEconomy={() => setView("economy")}
            onGoDirectory={() => setEventMode("directory")}
          />
        ) : (
          <EventsView entries={entries} onOpenMatch={openDemo} onAnalyzeEvent={startEventAnalysis} onGoLibrary={() => setView("library")} />
        ))}
        {view === "management" && (
          <ManagementView
            entries={entries}
            identity={identityState}
            onIdentityChange={setIdentityState}
            identityOptions={identityOptions}
            teamRenames={identityState.teamRenames}
            onGoLibrary={() => setView("library")}
            onNotice={setNotice}
            onLibraryChanged={setEntries}
            initialTab={managementInitialTab}
          />
        )}
      </main>
    </div>
  );
}
