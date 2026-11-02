import { useStudioActivity } from "./app/use-studio-activity";
import { useStudioData } from "./app/use-studio-data";
import { useLibraryActions } from "./app/use-library-actions";
import { useRivalHubActions } from "./app/use-rivalhub-actions";
import { useDesktopUpdates } from "./app/use-desktop-updates";
import { invalidateAnalysisQueries, getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation } from "./lib/queries/query-cache";
import { Bomb, ClipboardList, Coins, Crosshair, Film, House, LibraryBig, Radar, Settings, Swords, Trophy, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CohortScope, type CohortScopeEvent, type CohortScopeState } from "./components/CohortScope";
import { AnalysisContextSummary } from "./components/AnalysisContextSummary";
import { CapabilityBar } from "./components/CapabilityBar";
import { type StudioEventRecord } from "./lib/events";
import { BUILD_INFO, BUILD_LABEL } from "./lib/build-info";
import { APP_VERSION } from "./lib/update";
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
import { ManagementView } from "./views/ManagementView";
import { DuelView } from "./views/DuelView";
import { CoachView } from "./views/CoachView";
import { RadarFieldView } from "./views/RadarFieldView";
import { buildCohortIdentityMap } from "./lib/identity";
import type { IdentityOptions } from "./lib/identity";
import { type EvidenceContinuation, type OpenEvidence } from "./lib/evidence-continuation";
import {
  applyCohortScopeProjection,
  cohortScopeProjection,
  createAnalysisContextPreset,
  resolveAnalysisCorpus,
  summarizeAnalysisContext,
  type AnalysisContext,
} from "./lib/analysis-context";
import { deriveCapabilityAvailability, loadCapabilityAvailabilityInputs, type CapabilityAvailability, type CapabilityRepairAction, type StudioCapability } from "./lib/capability-availability";
import { createStudioNavigation, studioNavigationReducer, PAGE_SECTION, type StudioDestination, type StudioPageId, type StudioSection } from "./lib/studio-navigation";
import { getPinnedPlayer } from "./lib/pin";
import { RivalHubBatchImportPanel } from "./components/RivalHubBatchImportPanel";

type NavKey =
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

type NavItem = { key: NavKey; label: string; hint: string; icon: typeof LibraryBig };
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

type MatchDeepLink = { roundNumber: number; tick?: number };
const CAPABILITY_BY_VIEW: Partial<Record<NavKey, StudioCapability>> = {
  home: "personal-review", players: "map-role", teams: "map-role", duel: "duel", economy: "economy", utility: "utility", lineups: "lineup", control: "control", coach: "tactical",
};

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
  const activity = useStudioActivity();
  const { importing, notice, setNotice, exportQueries, recheckExport } = activity;
  const { entries, entriesReady, eventRecords, seriesRecords, identityState, refreshEntries, refreshEventRecords, refreshIdentity } = useStudioData({ onError: setNotice });
  const { importTagsRaw, setImportTagsRaw, importFiles, importDropped, importViaNativeDialog, nativeImportAvailable, loadBuiltinEvent, handleLinkRawDemo, watchRawDemo, handleRemove, handleRemoveMany, handleUpdateTags, handleBulkUpdateTags, handleReexportDemo, handleReexportAll, handleReexportSelected, handleRebuildFacts, handleRebuildStale, handleRebuildSelected } = useLibraryActions({ entries, refreshEntries, refreshEventRecords, activity });
  const { rivalHubConnection, rivalHubRefreshToken, batchSession, dismissBatch, updateLocalLink, refreshRivalHub, handleConnectRivalHub, handleRevokeRivalHub, importOnlineFiles, syncLocalRivalHubDemos, stopRivalHubBatch, pickRivalHubFiles, selectRivalHubBatchTarget } = useRivalHubActions({ entries, refreshEntries, refreshEventRecords, activity });
  const [navigation, setNavigation] = useState(() => createStudioNavigation("initial"));
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const nextFrameId = useRef(0);
  const touchedFrames = useRef(new Set<string>());
  useEffect(() => {
    const retained = new Set([navigation.active.id, ...navigation.history.map(frame => frame.id)]);
    for (const id of touchedFrames.current) if (!retained.has(id)) touchedFrames.current.delete(id);
  }, [navigation]);
  const active = navigation.active;
  const destination = active.destination;
  const pageToView: Partial<Record<StudioPageId, NavKey>> = {
    workbench: "home", analysis: "players", "personal-review": "home", matches: "library", match: "match",
    player: "players", team: "teams", opening: "trails", patterns: "coach",
    "event-analysis": "events", events: "events", management: "management",
    duel: "duel", economy: "economy", utility: "utility", lineups: "lineups", control: "control",
  };
  const view = destination.page === "management" && destination.tab === "library" ? "library" : pageToView[destination.page] ?? "library";
  const selectedDemoId = destination.page === "match" ? destination.entryId : null;
  const targetRound = destination.page === "match" ? destination.roundNumber : undefined;
  const targetTick = destination.page === "match" ? destination.tick : undefined;
  const matchDeepLink = useMemo(() => targetRound === undefined
    ? null : { roundNumber: targetRound, tick: targetTick }, [active.id, targetRound, targetTick]);
  const eventMode = destination.page === "event-analysis" ? "overview" : "directory";
  const managementInitialTab = destination.page === "management" ? destination.tab : "identity";
  const fallbackContext = useMemo(() => createAnalysisContextPreset("explore"), []);
  const analysisContext = "context" in destination ? destination.context : fallbackContext;
  const navigate = useCallback((next: StudioDestination, intent: "open" | "evidence" = "open", sourceKey?: string) => {
    const id = `frame-${++nextFrameId.current}`;
    if (intent === "open") { setEvidenceDetails(null); setRestoringFrameId(null); }
    setNavigation(current => studioNavigationReducer(current, intent === "evidence" && next.page === "match"
      ? { intent, id, destination: next, scrollY: window.scrollY, sourceKey }
      : { intent: "open", id, destination: next, scrollY: window.scrollY }));
  }, []);
  const resumeSection = useCallback((section: StudioSection) => {
    const current = navigationRef.current;
    if (PAGE_SECTION[current.active.destination.page] === section) return;
    const id = `frame-${++nextFrameId.current}`;
    const target = current.history.find(frame => frame.id === current.resume[section]);
    setEvidenceDetails(null);
    setRestoringFrameId(target?.id ?? null);
    setNavigation(state => studioNavigationReducer(state, { intent: "resume", id, section, scrollY: window.scrollY }));
  }, []);
  const setAnalysisContext = useCallback((update: AnalysisContext | ((current: AnalysisContext) => AnalysisContext)) => {
    const id = active.id;
    touchedFrames.current.add(id);
    setNavigation(current => {
      if (current.active.id !== id || !("context" in current.active.destination)) return current;
      const context = current.active.destination.context;
      return studioNavigationReducer(current, { intent: "context", frameId: id, context: typeof update === "function" ? update(context) : update });
    });
  }, [active.id]);
  const setView = useCallback((key: NavKey) => {
    const context = createAnalysisContextPreset("explore");
    const analysisPages = { players: "player", teams: "team", trails: "opening", duel: "duel", utility: "utility", lineups: "lineups", economy: "economy", coach: "patterns", control: "control" } as const;
    if (key in analysisPages) navigate({ page: analysisPages[key as keyof typeof analysisPages], context });
    else if (key === "home") navigate({ page: "personal-review", context: createAnalysisContextPreset("personal-review") });
    else if (key === "library") navigate({ page: "matches" });
    else if (key === "match") resumeSection("matches");
    else if (key === "events") navigate({ page: "events" });
    else navigate({ page: "management", tab: "identity" });
  }, [navigate, resumeSection]);
  const analysisData = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const [evidenceDetails, setEvidenceDetails] = useState<Pick<EvidenceContinuation, "evidence" | "finding"> | null>(null);
  const evidenceSource = navigation.history.at(-1);
  const evidenceContinuation: EvidenceContinuation | null = evidenceDetails && evidenceSource ? {
    ...evidenceDetails, sourceView: evidenceSource.destination.page,
    context: "context" in evidenceSource.destination ? evidenceSource.destination.context : fallbackContext,
    sourceKey: evidenceSource.anchorKey,
  } : null;
  const [restoringFrameId, setRestoringFrameId] = useState<string | null>(null);
  const { update, checkingUpdate, dismissedVersion, setDismissedVersion, showLatestMsg, updateChannel, doCheckUpdate, changeUpdateChannel } = useDesktopUpdates();
  const [contextEditorOpen, setContextEditorOpen] = useState(false);
  const [capabilityAvailability, setCapabilityAvailability] = useState<CapabilityAvailability | null>(null);

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
  }, [setAnalysisContext]);
  const identityOptions = useMemo<IdentityOptions | undefined>(
    () => identityState.version > 0
      ? { version: identityState.version, map: buildCohortIdentityMap(identityState.mappings), teamRenames: identityState.teamRenames }
      : undefined,
    [identityState.version, identityState.mappings, identityState.teamRenames]
  );
  const openCapabilityRepair = useCallback((action: CapabilityRepairAction) => {
    if (action === "install-tri") {
      navigate({ page: "management", tab: "assets" });
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
  }, [setAnalysisContext]);

  useEffect(() => {
    const capability = CAPABILITY_BY_VIEW[view];
    if (!capability || scopedEntries.length === 0) { setCapabilityAvailability(null); return; }
    let cancelled = false;
    void loadCapabilityAvailabilityInputs(scopedEntries)
      .then((inputs) => { if (!cancelled) setCapabilityAvailability(deriveCapabilityAvailability(scopedEntries, capability, inputs)); })
      .catch(() => { if (!cancelled) setCapabilityAvailability(null); });
    return () => { cancelled = true; };
  }, [view, scopedEntries]);

  const openDemo = useCallback((id: string, target?: MatchDeepLink) => {
    navigate({ page: "match", entryId: id, ...target });
  }, [navigate]);

  const openEvidence = useCallback<OpenEvidence>((id, evidence, sourceKey, finding) => {
    if (navigationRef.current.active.id !== active.id) return;
    setEvidenceDetails({ evidence: { ...evidence }, finding: finding ? { ...finding } : undefined });
    navigate({ page: "match", entryId: id, roundNumber: evidence.roundNumber, tick: evidence.tick }, "evidence", sourceKey);
  }, [active.id, navigate]);

  const goBack = useCallback(() => {
    const current = navigationRef.current;
    const id = `frame-${++nextFrameId.current}`;
    setRestoringFrameId(current.history.at(-1)?.id ?? id);
    setEvidenceDetails(null);
    setNavigation(state => studioNavigationReducer(state, { intent: "back", id }));
  }, []);

  const onPageReady = useCallback((frameId: string, availableAnchorKeys: string[]) => {
    const frame = navigationRef.current.active;
    if (!entriesReady || frame.id !== frameId || restoringFrameId !== frameId) return;
    if (frame.anchorKey && availableAnchorKeys.includes(frame.anchorKey)) {
      document.getElementById(frame.anchorKey)?.scrollIntoView({ block: "center" });
    } else {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.min(frame.scrollY, max), behavior: "instant" });
      if (frame.anchorKey && max === 0 && frame.scrollY > 0) setNotice("未能恢复原位置，已返回页面顶部。");
    }
    setNavigation(current => studioNavigationReducer(current, { intent: "position", frameId, scrollY: window.scrollY }));
    setRestoringFrameId(null);
  }, [restoringFrameId, entriesReady]);

  useEffect(() => {
    if (restoringFrameId !== active.id) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [active.id]); // The restoration signal may clear without changing frames.

  useEffect(() => {
    if (view === "library" && entriesReady) {
      onPageReady(active.id, Array.from(document.querySelectorAll<HTMLElement>("[id]"), node => node.id));
    }
  }, [view, active.id, entriesReady, onPageReady]);

  const openPlayer = useCallback((playerKey: string, label = playerKey) => {
    const current = navigationRef.current.active.destination;
    const context = "context" in current ? current.context : createAnalysisContextPreset("explore");
    navigate({ page: "player", context: { ...context, goal: "player-analysis", focus: { kind: "player", playerKey, label } } });
  }, [navigate]);

  const openTeam = useCallback((teamName: string) => {
    const current = navigationRef.current.active.destination;
    const context = "context" in current ? current.context : createAnalysisContextPreset("explore");
    navigate({ page: "team", context: { ...context, goal: "team-analysis", focus: { kind: "team", teamName } } });
  }, [navigate]);

  const startEventAnalysis = useCallback((event: StudioEventRecord) => {
    navigate({ page: "event-analysis", context: createAnalysisContextPreset("event-analysis", {
      corpus: { eventIds: [event.id], entryIds: [], matchIds: [], maps: [], tags: [], excludedEntryIds: [] },
      focus: { kind: "event", eventId: event.id, label: event.name },
      baseline: { kind: "event-peers", eventId: event.id },
    }) });
  }, [navigate]);

  return (
    <div
      className="stu-app"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={async (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
          // Windows EdgeChromium：主动把 File 引用发给 Python
          // 侧捕获本机路径，避免后续走字节回退 OOM。
          importDropped(e.dataTransfer.files);
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
                    const id = `frame-${++nextFrameId.current}`;
                    setNavigation(current => studioNavigationReducer(current, { intent: "open", id, destination: { page: "personal-review", context: createAnalysisContextPreset("personal-review") }, scrollY: window.scrollY }));
                    void getPinnedPlayer().then(pinned => {
                      if (!pinned) return;
                      setNavigation(current => {
                        if (touchedFrames.current.has(id) || current.active.id !== id || current.active.destination.page !== "personal-review" || current.active.destination.context.focus.kind !== "aggregate") return current;
                        return studioNavigationReducer(current, { intent: "context", frameId: id, context: createAnalysisContextPreset("personal-review", { focus: { kind: "self", playerKey: pinned.playerKey, label: pinned.name } }) });
                      });
                    });
                  } else setView(item.key);
                }} />
              ))}
            </section>
          ))}
        </nav>
        <div className="stu-sidebar-foot">
          <NavButton item={MANAGEMENT_NAV} active={view === "management"} onClick={() => setView("management")} />
          <span>{entries.length} 场 demo</span>
          <small>v{APP_VERSION} · v3 ZIP · 本地存储</small>
          <small title={BUILD_INFO.buildRevision ?? "Git metadata unavailable"}>{BUILD_LABEL}</small>
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
        {navigation.history.length > 0 && <button type="button" className="stu-button-sm" onClick={goBack}>返回</button>}
        {exportQueries.map(query => <div className="stu-notice" role="status" key={query.jobId}>
          <div><p>{query.message}</p><p>解析任务 {query.jobId} · 阶段 {query.stage} · 最后进度 {query.progress === null ? "未知" : `${Math.round(query.progress * 100)}%`}</p>
            {query.diagnostic?.cause && <p>{query.diagnostic.cause}</p>}
            {query.uncertain && <p>只查询现有任务；没有取消后台解析，也不会重新提交。</p>}
          </div>
          {query.uncertain && <button type="button" onClick={() => recheckExport(query.jobId)}>重查此任务状态</button>}
        </div>)}
        {analysisData.status === "error" && (
          <div className="stu-notice" role="alert">
            <span>分析缓存不可用，请重试刷新。</span>
            <button type="button" onClick={() => { void invalidateAnalysisQueries().catch(() => {}); }}>重试刷新</button>
          </div>
        )}
        {notice && (
          <div className="stu-notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)}>
              ✕
            </button>
          </div>
        )}
        <RivalHubBatchImportPanel session={batchSession} onStop={stopRivalHubBatch} onSelectTarget={selectRivalHubBatchTarget} onDismiss={dismissBatch} onLocalLinkUpdate={updateLocalLink} />
        {entries.length > 0 && "context" in destination && (
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
            key={active.id}
            entries={scopedEntries}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            returnEvidenceKey={active.anchorKey}
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
            key={active.id}
            entries={entries}
            importing={importing}
            importTagsRaw={importTagsRaw}
            onImportTagsChange={setImportTagsRaw}
            onImportFiles={importFiles}
            onNativeImport={nativeImportAvailable ? importViaNativeDialog : undefined}
            onNotice={setNotice}
            onLibraryChanged={() => { void refreshEntries(); void refreshEventRecords(); }}
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
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            entries={entries}
            demoId={selectedDemoId}
            deepLink={matchDeepLink}
            onSelectDemo={(id) => openDemo(id)}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            onGoLibrary={() => setView("library")}
            evidenceContinuation={evidenceContinuation}
            onReturnToSource={goBack}
          />
        )}
        {view === "players" && (
          <PlayersView
            key={active.id}
            allEntries={entries}
            entries={scopedEntries}
            selectedTeam={selectedTeam}
            selectedPlayerKey={selectedPlayerKey}
            onSelectPlayer={openPlayer}
            onOpenMatch={openDemo}
            onOpenEvidence={openEvidence}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            returnEvidenceKey={active.anchorKey}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            identityOptions={identityOptions}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "teams" && (
          <TeamView
            key={active.id}
            entries={scopedEntries}
            selectedTeam={analysisContext.focus.kind === "team" ? analysisContext.focus.teamName : null}
            onSelectTeam={openTeam}
            onOpenMatch={openDemo}
            onOpenCapability={(key) => navigate({ page: key, context: analysisContext })}
            onOpenEvidence={openEvidence}
            returnEvidenceKey={active.anchorKey}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            onGoLibrary={() => setView("library")}
            identityOptions={identityOptions}
          />
        )}
        {view === "trails" && (
          <TrailsView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            allEntries={entries}
            entries={scopedEntries}
            identityOptions={identityOptions}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "duel" && (
          <DuelView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
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
            key={active.id}
            allEntries={entries}
            entries={scopedEntries}
            selectedTeam={selectedTeam}
            onOpenMatch={openDemo}
            onOpenEvidence={openEvidence}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            identityOptions={identityOptions}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "lineups" && (
          <LineupsView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            onRebuild={handleRebuildSelected}
            allEntries={entries}
            entries={scopedEntries}
            onOpenMatch={openDemo}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "economy" && (
          <EconomyView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            allEntries={entries}
            entries={scopedEntries}
            selectedTeam={selectedTeam}
            identityOptions={identityOptions}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "coach" && (
          <CoachView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
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
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            entries={scopedEntries}
            teamRenames={identityState.teamRenames}
            selectedTeam={selectedTeam}
            onSelectTeam={selectRadarTeam}
          />
        )}
        {view === "events" && (eventMode === "overview" ? (
          <TournamentDashboardView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            allEntries={entries}
            entries={scopedEntries}
            selectedTeam={selectedTeam}
            identityOptions={identityOptions}
            onOpenMatch={openDemo}
            onOpenTeam={openTeam}
            onOpenPlayer={openPlayer}
            onGoLibrary={() => setView("library")}
            onGoEconomy={() => navigate({ page: "economy", context: analysisContext })}
            onGoDirectory={() => navigate({ page: "events" })}
          />
        ) : (
          <EventsView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            entries={entries}
            onOpenMatch={openDemo}
            onAnalyzeEvent={startEventAnalysis}
            onGoLibrary={() => setView("library")}
            rivalHubConnection={rivalHubConnection}
            onConnectRivalHub={handleConnectRivalHub}
            onRevokeRivalHub={handleRevokeRivalHub}
            onRefreshRivalHub={refreshRivalHub}
            onImportOnlineFiles={importOnlineFiles}
            onPickOnlineFiles={nativeImportAvailable ? pickRivalHubFiles : undefined}
            onSyncLocalDemos={syncLocalRivalHubDemos}
            refreshToken={rivalHubRefreshToken}
          />
        ))}
        {view === "management" && (
          <ManagementView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            entries={entries}
            identity={identityState}
            onIdentityChange={() => { void refreshIdentity(); }}
            identityOptions={identityOptions}
            teamRenames={identityState.teamRenames}
            onGoLibrary={() => setView("library")}
            onNotice={setNotice}
            onLibraryChanged={() => { void refreshEntries(); void refreshEventRecords(); }}
            initialTab={managementInitialTab === "library" ? "identity" : managementInitialTab}
          />
        )}
      </main>
    </div>
  );
}
