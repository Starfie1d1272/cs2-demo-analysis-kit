import { flushSync } from "react-dom";
import { savedAnalyses, type SavedAnalysis, type SavedAnalysisInput } from "./lib/saved-analysis";
import { SavedAnalysesPanel } from "./views/analysis/SavedAnalysesPanel";
import { matchIdForEntry } from "./lib/demo-entry";
import { emptyRolesState } from "./lib/studio-page-state";
import { PlayerRolesPanel } from "./views/analysis/PlayerRolesPanel";
import { TeamRolesPanel } from "./views/analysis/TeamRolesPanel";
import { useStudioActivity } from "./app/use-studio-activity";
import { useStudioData } from "./app/use-studio-data";
import { useLibraryActions } from "./app/use-library-actions";
import { useRivalHubActions } from "./app/use-rivalhub-actions";
import { useDesktopUpdates } from "./app/use-desktop-updates";
import { invalidateAnalysisQueries, getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation } from "./lib/queries/query-cache";
import { ClipboardList, Crosshair, Film, House, LibraryBig, Radar, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnalysisScopeEditor } from "./components/AnalysisScopeEditor";
import { AnalysisContextSummary } from "./components/AnalysisContextSummary";
import { CapabilityPanel } from "./components/CapabilityBar";
import { BackgroundActivity } from "./components/BackgroundActivity";
import { type StudioEventRecord } from "./lib/events";
import { BUILD_INFO, BUILD_LABEL } from "./lib/build-info";
import { APP_VERSION } from "./lib/update";
import { UpdateControl } from "./components/UpdateControl";
import { UpdateModal } from "./components/UpdateModal";
import { AssetHealthBanner } from "./components/AssetHealthBanner";
import { LibraryDirButton } from "./components/LibraryDirButton";
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
import { PatternsPage } from "./views/analysis/PatternsPage";
import { RadarFieldView } from "./views/RadarFieldView";
import { buildCohortIdentityMap } from "./lib/identity";
import type { IdentityOptions } from "./lib/identity";
import { createEvidenceSession, type EvidenceSession, type OpenEvidence } from "./lib/evidence-continuation";
import {
  createAnalysisContextPreset,
  resolveAnalysisCorpus,
  summarizeAnalysisContext,
  type AnalysisContext,
} from "./lib/analysis-context";
import type { CapabilityRepairAction } from "./lib/capability-availability";
import { createStudioNavigation, studioNavigationReducer, findAnalysisFrame, PAGE_SECTION, type StudioDestination, type StudioNavigation, type StudioSection } from "./lib/studio-navigation";
import { WorkbenchView } from "./views/WorkbenchView";
import { MatchesView } from "./views/MatchesView";
import { getSeasonSummary } from "./lib/queries/season-queries";
import { AnalysisView } from "./views/AnalysisView";
import { type PinnedPlayer } from "./lib/pin";
import { setLastWork, updateLastMatchPosition } from "./lib/last-work";
import { EventManager } from "./components/EventManager";
import { emptyMaterialsPageState, emptyStudyNoteDraft, emptyCoachPlaybookDraft, type MaterialsPageState, type MaterialPageState, type LecturePageState } from "./lib/material-page-state";
import type { MaterialRef } from "./lib/material-ref";
import type { StudyNoteDraft } from "./lib/study-notes";
import { MatchSheetView } from "./views/coach/MatchSheetView";
import { PlaybookLectureView } from "./views/coach/PlaybookLectureView";
import { MaterialsView, MaterialDetailView } from "./views/MaterialsView";
import { RivalHubBatchImportPanel } from "./components/RivalHubBatchImportPanel";

function discardMaterialDraft(navigation: StudioNavigation): StudioNavigation {
  const frame = navigation.active;
  if (frame.destination.page === "material" && frame.ui && "dirty" in frame.ui && frame.ui.dirty) return studioNavigationReducer(navigation, { intent: "ui", frameId: frame.id, ui: null });
  if (frame.destination.page === "materials") {
    const ui = frame.ui as MaterialsPageState;
    if (ui.newPlaybookDirty || ui.newNoteDirty || ui.newAssignmentDirty || ui.newMatchSheetDirty) return studioNavigationReducer(navigation, { intent: "ui", frameId: frame.id, ui: { ...ui, newAssignment: null, newAssignmentDirty: false, newAssignmentObservationExpanded: false, newPlaybook: null, newPlaybookDirty: false, newNote: null, newNoteDirty: false, newMatchSheet: null, newMatchSheetDirty: false } });
  }
  return navigation;
}

const MAIN_NAV: Array<{ section: StudioSection; label: string; hint: string; icon: typeof LibraryBig }> = [
  { section: "workbench", label: "工作台", hint: "开始与导入", icon: House },
  { section: "matches", label: "比赛", hint: "比赛与赛事", icon: Film },
  { section: "analysis", label: "分析", hint: "选手、队伍与主题", icon: Radar },
  { section: "materials", label: "战术与训练", hint: "备战与材料", icon: ClipboardList },
];
const MANAGEMENT_NAV = { label: "数据管理", hint: "身份 · 资产 · 资料库维护", icon: Settings };

type MatchDeepLink = { roundNumber: number; tick?: number };

function NavButton({ item, active, onClick }: { item: typeof MANAGEMENT_NAV; active: boolean; onClick: () => void }) {
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
  const { importing, setNotice } = activity;
  const { entries, entriesReady, eventsStatus, seriesStatus, eventRecords, seriesRecords, identityState, refreshEntries, refreshEventRecords, refreshIdentity, prepMigrationStatus, prepMigrationError, retryPrepMigration } = useStudioData({ onError: setNotice });
  const { importTagsRaw, setImportTagsRaw, importFiles, importDropped, importViaNativeDialog, nativeImportAvailable, loadBuiltinEvent, handleLinkRawDemo, watchRawDemo, handleRemove, handleRemoveMany, handleUpdateTags, handleBulkUpdateTags, handleReexportDemo, handleReexportAll, handleReexportSelected, handleRebuildFacts, handleRebuildStale, handleRebuildSelected } = useLibraryActions({ entries, refreshEntries, refreshEventRecords, activity });
  const { rivalHubConnection, batchSession, dismissBatch, updateLocalLink, refreshRivalHub, handleConnectRivalHub, handleRevokeRivalHub, importOnlineFiles, syncLocalRivalHubDemos, stopRivalHubBatch, pickRivalHubFiles, selectRivalHubBatchTarget } = useRivalHubActions({ refreshEntries, refreshEventRecords, activity });
  const [navigation, setNavigation] = useState(() => createStudioNavigation("initial"));
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const nextFrameId = useRef(0);
  const savedOpenRequest = useRef(0);
  const touchedFrames = useRef(new Set<string>());
  useEffect(() => {
    const retained = new Set([navigation.active.id, ...navigation.history.map(frame => frame.id)]);
    for (const id of touchedFrames.current) if (!retained.has(id)) touchedFrames.current.delete(id);
  }, [navigation]);
  const active = navigation.active;
  const destination = active.destination;
  const section = PAGE_SECTION[destination.page];
  const selectedDemoId = destination.page === "match" ? destination.entryId : null;
  const targetRound = destination.page === "match" ? destination.roundNumber : undefined;
  const targetTick = destination.page === "match" ? destination.tick : undefined;
  const matchDeepLink = useMemo(() => targetRound === undefined
    ? null : { roundNumber: targetRound, tick: targetTick }, [active.id, targetRound, targetTick]);
  const fallbackContext = useMemo(() => createAnalysisContextPreset("explore"), []);
  const analysisContext = "context" in destination ? destination.context : fallbackContext;
  const canLeave = useCallback(() => {
    const frame = navigationRef.current.active;
    const dirty = frame.destination.page === "material" ? Boolean(frame.ui && "dirty" in frame.ui && frame.ui.dirty) : frame.destination.page === "materials" ? Boolean((frame.ui as MaterialsPageState | null)?.newNoteDirty || (frame.ui as MaterialsPageState | null)?.newPlaybookDirty || (frame.ui as MaterialsPageState | null)?.newAssignmentDirty || (frame.ui as MaterialsPageState | null)?.newMatchSheetDirty) : false;
    return !dirty || window.confirm("有未保存的修改。确定放弃修改并离开？");
  }, []);
  const navigate = useCallback((next: StudioDestination, intent: "open" | "evidence" = "open", sourceKey?: string) => {
    if (intent === "open" && !canLeave()) return;
    const id = `frame-${++nextFrameId.current}`;
    if (intent === "open") { setEvidenceSession(null); setRestoringFrameId(null); }
    setNavigation(current => studioNavigationReducer(intent === "open" ? discardMaterialDraft(current) : current, intent === "evidence" && next.page === "match"
      ? { intent, id, destination: next, scrollY: window.scrollY, sourceKey }
      : { intent: "open", id, destination: next, scrollY: window.scrollY }));
  }, [canLeave]);
  const openSavedAnalysis = useCallback(async (row: SavedAnalysis) => {
    if (!canLeave()) return;
    const source = navigationRef.current;
    const request = ++savedOpenRequest.current;
    try {
      const saved = await savedAnalyses.get(row.id);
      if (savedOpenRequest.current !== request || navigationRef.current !== source) return;
      if (!saved) throw new Error("原保存项已删除，可另存");
      const id = `frame-${++nextFrameId.current}`;
      // Check again in the state update: an intervening navigation or draft edit
      // must not be discarded by a late read.
      flushSync(() => setNavigation(current => current === source && savedOpenRequest.current === request
        ? studioNavigationReducer(discardMaterialDraft(current), { intent: "open-saved", id, saved, scrollY: window.scrollY })
        : current));
      if (navigationRef.current.active.id !== id) return;
      setEvidenceSession(null); setRestoringFrameId(null);
      void setLastWork({ kind: "saved-analysis", queryId: saved.id });
    } catch (e) {
      if (savedOpenRequest.current === request && navigationRef.current === source) setNotice(e instanceof Error ? e.message : "打开保存分析失败");
    }
  }, [canLeave, setNotice]);
  const resumeSection = useCallback((section: StudioSection) => {
    const current = navigationRef.current;
    if (PAGE_SECTION[current.active.destination.page] === section || !canLeave()) return;
    const id = `frame-${++nextFrameId.current}`;
    const target = current.history.find(frame => frame.id === current.resume[section]);
    setEvidenceSession(null);
    setRestoringFrameId(target?.id ?? null);
    setNavigation(state => studioNavigationReducer(discardMaterialDraft(state), { intent: "resume", id, section, scrollY: window.scrollY }));
  }, [canLeave]);
  const setAnalysisContext = useCallback((update: AnalysisContext | ((current: AnalysisContext) => AnalysisContext)) => {
    const id = active.id;
    touchedFrames.current.add(id);
    setNavigation(current => {
      if (current.active.id !== id || !("context" in current.active.destination)) return current;
      const context = current.active.destination.context;
      return studioNavigationReducer(current, { intent: "context", frameId: id, context: typeof update === "function" ? update(context) : update });
    });
  }, [active.id]);
  const goLibrary = useCallback(() => navigate({ page: "matches" }), [navigate]);
  const goPlayers = useCallback(() => navigate({ page: "player", context: createAnalysisContextPreset("explore") }), [navigate]);
  const goLineups = useCallback(() => navigate({ page: "lineups", context: createAnalysisContextPreset("explore") }), [navigate]);
  const analysisData = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const [evidenceSession, setEvidenceSession] = useState<EvidenceSession | null>(null);
  const [restoringFrameId, setRestoringFrameId] = useState<string | null>(null);
  const { update, checkingUpdate, dismissedVersion, setDismissedVersion, showLatestMsg, updateChannel, doCheckUpdate, changeUpdateChannel } = useDesktopUpdates({ onError: setNotice });
  const [contextEditorOpen, setContextEditorOpen] = useState(false);

  const eventScopes = useMemo<import("./lib/analysis-context").AnalysisEventScope[]>(() => {
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
  const selectedPlayerKey = analysisContext.focus.kind === "self" || analysisContext.focus.kind === "player"
    ? analysisContext.focus.playerKey
    : null;
  const selectedTeam = analysisContext.focus.kind === "team" ? analysisContext.focus.teamName : null;
  const identityOptions = useMemo<IdentityOptions | undefined>(
    () => identityState.version > 0
      ? { version: identityState.version, map: buildCohortIdentityMap(identityState.mappings), teamRenames: identityState.teamRenames }
      : undefined,
    [identityState.version, identityState.mappings, identityState.teamRenames]
  );
  const selectedTeams = useMemo(() => selectedTeam ? [selectedTeam] : [], [selectedTeam]);
  const [focusIdentity, setFocusIdentity] = useState<{ playerKey: string; steamIds: string[] } | null>(null);
  useEffect(() => {
    if (!selectedPlayerKey || scopedEntries.length === 0 || (destination.page !== "duel" && destination.page !== "utility")) { setFocusIdentity(null); return; }
    let cancelled = false;
    setFocusIdentity({ playerKey: selectedPlayerKey, steamIds: [] });
    void getSeasonSummary(scopedEntries, identityOptions).then(summary => {
      if (!cancelled) setFocusIdentity({ playerKey: selectedPlayerKey, steamIds: summary.profiles.find(p => p.playerKey === selectedPlayerKey)?.steamIds ?? [] });
    }).catch(() => { if (!cancelled) setFocusIdentity({ playerKey: selectedPlayerKey, steamIds: [] }); });
    return () => { cancelled = true; };
  }, [selectedPlayerKey, scopedEntries, identityOptions, destination.page]);
  const openCapabilityRepair = useCallback((action: CapabilityRepairAction) => {
    if (action === "install-tri") {
      navigate({ page: "management", tab: "assets" });
      return;
    }
    goLibrary();
  }, [goLibrary, navigate]);
  const selectRadarTeam = useCallback((teamName: string | null) => {
    setAnalysisContext((current) => ({
      ...current,
      goal: teamName ? "team-analysis" : current.goal === "team-analysis" ? "explore" : current.goal,
      focus: teamName ? { kind: "team", teamName } : current.focus.kind === "team" ? { kind: "aggregate" } : current.focus,
    }));
  }, [setAnalysisContext]);

  const openDemo = useCallback((id: string, target?: MatchDeepLink) => {
    navigate({ page: "match", entryId: id, ...target });
  }, [navigate]);

  const lastOpenedTarget = useRef<string | null>(null);
  const recordMatchOpened = useCallback((target: { roundNumber?: number; tick?: number }) => {
    const current = navigationRef.current.active;
    if (destination.page !== "match" || current.id !== active.id || current.destination.page !== "match" || current.destination.entryId !== destination.entryId || current.destination.roundNumber !== destination.roundNumber || current.destination.tick !== destination.tick) return;
    const key = JSON.stringify([active.id, destination.entryId, destination.roundNumber, destination.tick]);
    if (lastOpenedTarget.current === key) return;
    lastOpenedTarget.current = key;
    void setLastWork({ kind: "match", entryId: destination.entryId, ...target });
  }, [active.id, destination]);
  const recordReplayPaused = useCallback((target: { roundNumber: number; tick: number }) => {
    const current = navigationRef.current.active;
    if (destination.page !== "match" || current.id !== active.id || current.destination.page !== "match" || current.destination.entryId !== destination.entryId || current.destination.roundNumber !== destination.roundNumber || current.destination.tick !== destination.tick) return;
    void updateLastMatchPosition(destination.entryId, target);
  }, [active.id, destination]);
  const openWorkbenchPersonal = useCallback((pinned: PinnedPlayer | null) => {
    if (!pinned) { goPlayers(); return; }
    const matches = identityState.mappings.filter(mapping => mapping.steamIds.some(id => pinned.steamIds.includes(id)));
    const focus = matches.length === 1 ? { kind: "self" as const, playerKey: matches[0].playerKey, label: matches[0].displayName } : { kind: "self" as const, playerKey: pinned.playerKey, label: pinned.name };
    navigate({ page: "player", context: createAnalysisContextPreset("personal-review", focus ? { focus } : {}) });
  }, [goPlayers, identityState.mappings, navigate]);

  const openEvidence = useCallback<OpenEvidence>((request) => {
    const source = navigationRef.current.active;
    if (source.id !== active.id) return;
    const sourceFrame = source.destination.page === "utility" ? { ...source, ui: { ...source.ui, selectedEvidenceKey: request.sourceKey ?? null } } : source.destination.page === "duel" ? { ...source, ui: { ...source.ui, selectedRowId: request.sourceKey ?? null } } : source;
    setEvidenceSession(createEvidenceSession(request, { ...sourceFrame, scrollY: window.scrollY, anchorKey: request.sourceKey } as import("./lib/studio-navigation").StudioFrame));
    navigate({ page: "match", entryId: request.entryId, roundNumber: request.evidence.roundNumber, tick: request.evidence.tick }, "evidence", request.sourceKey);
  }, [active.id, navigate]);
  const openMaterialEvidence = useCallback((request: Parameters<OpenEvidence>[0], ui: MaterialsPageState | MaterialPageState) => {
    const source = navigationRef.current.active;
    const sourceFrame = { ...source, ui: structuredClone(ui), scrollY: window.scrollY, anchorKey: request.sourceKey } as import("./lib/studio-navigation").StudioFrame;
    setEvidenceSession(createEvidenceSession(request, sourceFrame));
    navigate({ page: "match", entryId: request.entryId, roundNumber: request.evidence.roundNumber, tick: request.evidence.tick }, "evidence", request.sourceKey);
  }, [navigate]);
  const openAssignmentAnalysis = useCallback((scope: { teamKey: string; mapName: string; side: "t" | "ct"; entryIds: string[] }) => {
    if (!scope.entryIds.length || !canLeave()) return;
    const id = `frame-${++nextFrameId.current}`;
    const context = createAnalysisContextPreset("team-analysis", {
      corpus: { eventIds: [], entryIds: scope.entryIds, entrySelectionActive: true, matchIds: [], maps: [scope.mapName], tags: [], excludedEntryIds: [] },
      focus: { kind: "team", teamName: scope.teamKey },
    });
    setEvidenceSession(null); setRestoringFrameId(null);
    setNavigation(current => {
      const next = studioNavigationReducer(discardMaterialDraft(current), { intent: "open", id, destination: { page: "roles", context }, scrollY: window.scrollY });
      return studioNavigationReducer(next, { intent: "ui", frameId: id, ui: { ...emptyRolesState(), team: { ...emptyRolesState().team, matrixMapName: scope.mapName, matrixSide: scope.side } } });
    });
  }, [canLeave]);
  const openStudyNoteEditor = useCallback((draft: StudyNoteDraft) => {
    if (!canLeave()) return;
    const id = `frame-${++nextFrameId.current}`;
    setEvidenceSession(null);
    setNavigation(current => {
      const next = studioNavigationReducer(discardMaterialDraft(current), { intent: "open", id, destination: { page: "materials" }, scrollY: window.scrollY });
      return studioNavigationReducer(next, { intent: "ui", frameId: id, ui: { ...emptyMaterialsPageState(), newNote: structuredClone(draft) } });
    });
  }, [canLeave]);
  const openMaterial = useCallback((materialRef: MaterialRef) => {
    navigate({ page: "material", materialRef });
  }, [navigate]);
  const createdMaterial = useCallback((materialRef: MaterialRef, ui: MaterialsPageState) => {
    const id = `frame-${++nextFrameId.current}`;
    setNavigation(current => {
      if (current.active.id !== active.id || current.active.destination.page !== "materials") return current;
      const updated = studioNavigationReducer(current, { intent: "ui", frameId: current.active.id, ui });
      return studioNavigationReducer(updated, { intent: "open", id, destination: { page: "material", materialRef }, scrollY: window.scrollY });
    });
  }, [active.id]);
  const moveEvidence = useCallback((index: number) => {
    if (!evidenceSession || index < 0 || index >= evidenceSession.queue.length) return;
    const item = evidenceSession.queue[index];
    setEvidenceSession({ ...evidenceSession, activeIndex: index });
    setNavigation(current => studioNavigationReducer(current, { intent: "evidence-target", destination: { page: "match", entryId: item.entryId, roundNumber: item.evidence.roundNumber, tick: item.evidence.tick } }));
  }, [evidenceSession]);
  const returnToEvidenceSource = useCallback(() => {
    if (!evidenceSession) return;
    const frame = evidenceSession.sourceFrame;
    setEvidenceSession(null);
    setRestoringFrameId(frame.id);
    setNavigation(current => studioNavigationReducer(current, { intent: "restore", frame }));
  }, [evidenceSession]);

  const goBack = useCallback(() => {
    if (evidenceSession) { returnToEvidenceSource(); return; }
    if (!canLeave()) return;
    const current = navigationRef.current;
    const id = `frame-${++nextFrameId.current}`;
    setRestoringFrameId(current.history.at(-1)?.id ?? id);
    setEvidenceSession(null);
    setNavigation(state => studioNavigationReducer(discardMaterialDraft(state), { intent: "back", id }));
  }, [canLeave, evidenceSession, returnToEvidenceSource]);

  const onPageReady = useCallback((frameId: string, availableAnchorKeys: string[]) => {
    const frame = navigationRef.current.active;
    if (!entriesReady || frame.id !== frameId || restoringFrameId !== frameId) return;
    if (frame.anchorKey && availableAnchorKeys.includes(frame.anchorKey)) {
      document.getElementById(frame.anchorKey)?.scrollIntoView({ block: "center" });
    } else {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.min(frame.scrollY, max), behavior: "instant" });
      if (frame.anchorKey) setNotice("原证据条目当前不存在，已保留筛选并恢复页面位置。");
    }
    setNavigation(current => studioNavigationReducer(current, { intent: "position", frameId, scrollY: window.scrollY }));
    setRestoringFrameId(null);
  }, [restoringFrameId, entriesReady]);

  useEffect(() => {
    if (restoringFrameId !== active.id) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [active.id]); // The restoration signal may clear without changing frames.

  useEffect(() => {
    if ((destination.page === "matches" || (destination.page === "management" && (active.ui as import("./lib/studio-page-state").StudioPageStateMap["management"]).tab === "library")) && entriesReady) {
      onPageReady(active.id, Array.from(document.querySelectorAll<HTMLElement>("[id]"), node => node.id));
    }
  }, [destination.page, active.id, active.ui, entriesReady, onPageReady]);

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

  const libraryView = (destination.page === "matches" || destination.page === "management") ? (
          <LibraryView
            key={active.id}
            mode={destination.page === "management" ? "maintenance" : "browse"}
            state={destination.page === "management" ? (active.ui as import("./lib/studio-page-state").StudioPageStateMap["management"]).library : active.ui as import("./lib/studio-page-state").MatchesPageState}
            onStateChange={ui => setNavigation(current => { if (current.active.destination.page === "management") return studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui: { ...(current.active.ui as import("./lib/studio-page-state").StudioPageStateMap["management"]), library: ui } }); return studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }); })}
            entries={destination.page === "matches" && destination.entryIds ? entries.filter(entry => destination.entryIds!.includes(entry.id)) : entries}
            importing={importing}
            importTagsRaw={importTagsRaw}
            onImportTagsChange={setImportTagsRaw}
            onImportFiles={importFiles}
            onNativeImport={nativeImportAvailable ? importViaNativeDialog : undefined}
            onNotice={setNotice}
            onLibraryChanged={() => { void refreshEntries().catch(() => {}); void refreshEventRecords().catch(() => {}); }}
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
  ) : null;

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
          {MAIN_NAV.map(item => {
            const Icon = item.icon;
            return <button key={item.section} type="button" className={section === item.section ? "stu-nav-item stu-nav-item-active" : "stu-nav-item"} aria-current={section === item.section ? "page" : undefined} onClick={() => resumeSection(item.section)}><Icon size={16} /><span><b>{item.label}</b><small>{item.hint}</small></span></button>;
          })}
        </nav>
        <div className="stu-sidebar-foot">
          <NavButton item={MANAGEMENT_NAV} active={section === "management"} onClick={() => resumeSection("management")} />
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
        <BackgroundActivity activity={activity} batch={batchSession}>
          <RivalHubBatchImportPanel session={batchSession} onStop={stopRivalHubBatch} onSelectTarget={selectRivalHubBatchTarget} onDismiss={dismissBatch} onLocalLinkUpdate={updateLocalLink} />
        </BackgroundActivity>
        {analysisData.status === "error" && (
          <div className="stu-notice" role="alert">
            <span>分析缓存不可用，请重试刷新。</span>
            <button type="button" onClick={() => { void invalidateAnalysisQueries().catch(() => {}); }}>重试刷新</button>
          </div>
        )}
        {entries.length > 0 && section === "analysis" && "context" in destination && (
          <AnalysisContextSummary context={analysisContext} entries={entries} events={eventScopes} onEdit={() => setContextEditorOpen((current) => !current)} onCompare={(destination.page === "player" && selectedPlayerKey || destination.page === "team" && selectedTeam) ? () => document.getElementById("analysis-comparison")?.scrollIntoView({ behavior: "smooth", block: "center" }) : undefined} />
        )}
        {entries.length > 0 && contextEditorOpen && section === "analysis" && "context" in destination && (
          <AnalysisScopeEditor
            key={active.id}
            entries={entries}
            context={analysisContext}
            onChange={setAnalysisContext}
            teamRenames={identityState.teamRenames}
            events={eventScopes}
          />
        )}
        {destination.page === "workbench" && <WorkbenchView onOpenSaved={row => void openSavedAnalysis(row)} events={eventScopes} entries={entries} entriesReady={entriesReady} onOpenMatch={openDemo} onPersonal={openWorkbenchPersonal} onResumeAnalysis={navigation.history.some(frame => PAGE_SECTION[frame.destination.page] === "analysis") ? () => resumeSection("analysis") : undefined} importing={importing} importTagsRaw={importTagsRaw} onImportFiles={importFiles} onNativeImport={nativeImportAvailable ? importViaNativeDialog : undefined} onMatches={() => navigate({ page: "matches" })} onOpenMaterial={openMaterial} onNewNote={() => openStudyNoteEditor(emptyStudyNoteDraft())} onNewPlaybook={() => { if (!canLeave()) return; const id = `frame-${++nextFrameId.current}`; setEvidenceSession(null); setNavigation(current => { const next = studioNavigationReducer(discardMaterialDraft(current), { intent: "open", id, destination: { page: "materials" }, scrollY: window.scrollY }); return studioNavigationReducer(next, { intent: "ui", frameId: id, ui: { ...emptyMaterialsPageState(), newPlaybook: emptyCoachPlaybookDraft() } }); }); }} prepMigrationStatus={prepMigrationStatus} retryPrepMigration={retryPrepMigration} />}
        {section === "matches" && <MatchesView page={destination.page} onMatches={() => navigate({ page: "matches" })} onEvents={() => navigate({ page: "events" })} />}
        {destination.page === "materials" && <MaterialsView identityOptions={identityOptions} onAnalyzeAssignments={openAssignmentAnalysis} onPageReady={keys => onPageReady(active.id, keys)} entries={entries} state={active.ui as MaterialsPageState} onStateChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))} onOpenMaterial={openMaterial} onCreatedMaterial={createdMaterial} onOpenEvidence={openMaterialEvidence} prepMigrationStatus={prepMigrationStatus} prepMigrationError={prepMigrationError} retryPrepMigration={retryPrepMigration} />}
        {destination.page === "material" && <MaterialDetailView onLecture={source => { const id = `frame-${++nextFrameId.current}`; setNavigation(current => { const next = studioNavigationReducer(current, { intent: "open", id, destination: { page: "lecture", materialRef: { kind: source.kind, id: source.id } }, scrollY: window.scrollY }); const ui: LecturePageState = source.kind === "playbook" ? { kind: "playbook", id: source.id, phaseId: source.phaseId, tab: "diagram", selectedEvidenceId: null, replayEntryId: null, replay: null } : { kind: "match-sheet", id: source.id, selectedSectionId: source.draft.sections[0]?.id ?? null, selectedRefKey: source.draft.sections[0] ? `${source.draft.sections[0].id}:${source.draft.sections[0].refs[0] ? `${source.draft.sections[0].refs[0].kind}:${source.draft.sections[0].refs[0].id}` : "text"}` : null, lectureIndex: 0, tab: "content", playbook: null }; return studioNavigationReducer(next, { intent: "ui", frameId: id, ui }); }); }} identityOptions={identityOptions} onAnalyzeAssignments={openAssignmentAnalysis} onPageReady={keys => onPageReady(active.id, keys)} refValue={destination.materialRef} entries={entries} state={active.ui as MaterialPageState | null} onStateChange={ui => setNavigation(current => {
          const frame = current.active;
          if (frame.id !== active.id || frame.destination.page !== "material" || frame.destination.materialRef.kind !== destination.materialRef.kind || frame.destination.materialRef.id !== destination.materialRef.id) return current;
          return studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui });
        })} onBack={cleanState => {
          const source = navigationRef.current.active;
          if (source.id !== active.id || source.destination.page !== "material" || source.destination.materialRef.kind !== destination.materialRef.kind || source.destination.materialRef.id !== destination.materialRef.id) return;
          if (cleanState === undefined) { goBack(); return; }
          const id = `frame-${++nextFrameId.current}`;
          setNavigation(current => {
            const frame = current.active;
            if (frame.id !== active.id || frame.destination.page !== "material" || frame.destination.materialRef.kind !== destination.materialRef.kind || frame.destination.materialRef.id !== destination.materialRef.id) return current;
            return studioNavigationReducer(studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui: cleanState }), { intent: "back", id });
          });
        }} onOpened={ref => { const frame = navigationRef.current.active; if (frame.id === active.id && frame.destination.page === "material" && frame.destination.materialRef.kind === ref.kind && frame.destination.materialRef.id === ref.id) void setLastWork({ kind: "material", materialRef: ref }); }} onOpenEvidence={openMaterialEvidence} />}
        {destination.page === "lecture" && destination.materialRef.kind === "playbook" && active.ui && (() => {
          const source = [...navigation.history].reverse().find(frame => frame.destination.page === "material" && frame.destination.materialRef.kind === "playbook" && frame.destination.materialRef.id === destination.materialRef.id);
          const material = source?.ui as MaterialPageState | null | undefined;
          const lecture = active.ui as LecturePageState;
          if (!material || material.kind !== "playbook" || material.id !== destination.materialRef.id || lecture.kind !== "playbook" || lecture.id !== material.id) return <p>战术来源不可用。</p>;
          return <PlaybookLectureView draft={material.draft} entries={entries} state={lecture} onChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))} onBack={() => { const id = `frame-${++nextFrameId.current}`; setRestoringFrameId(source?.id ?? null); setNavigation(current => { const saved = current.active.ui as LecturePageState | null; const paused = saved?.kind === "playbook" && saved.replay ? { ...saved, replay: { ...saved.replay, playing: false } } : saved; const withLecture = studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui: paused }); const back = studioNavigationReducer(withLecture, { intent: "back", id }); return source ? studioNavigationReducer(back, { intent: "ui", frameId: source.id, ui: { ...material, phaseId: lecture.phaseId } }) : back; }); }} />;
        })()}
        {destination.page === "lecture" && destination.materialRef.kind === "match-sheet" && active.ui && (() => {
          const source = [...navigation.history].reverse().find(frame => frame.destination.page === "material" && frame.destination.materialRef.kind === "match-sheet" && frame.destination.materialRef.id === destination.materialRef.id);
          const material = source?.ui as MaterialPageState | null | undefined; const lecture = active.ui as LecturePageState;
          if (!material || material.kind !== "match-sheet" || lecture.kind !== "match-sheet") return <p>比赛单来源不可用。</p>;
          return <MatchSheetView draft={material.draft} entries={entries} state={lecture} onChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))} onBack={goBack} />;
        })()}
        {destination.page === "matches" && <>{destination.entryIds && <div className="stu-card">当前显示所选分析范围的比赛 <button type="button" className="stu-button-sm" onClick={() => navigate({ page: "matches" })}>查看全部比赛</button></div>}{libraryView}</>}
        {destination.page === "match" && (
          <MatchView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            entries={entries}
            openStudyNoteEditor={openStudyNoteEditor}
            onAnalyzePlayer={(steamId, label) => {
              const mapping = identityState.mappings.find(item => item.steamIds.includes(steamId));
              navigate({ page: "player", context: { ...createAnalysisContextPreset("explore", { corpus: { eventIds: [], entryIds: [destination.entryId], matchIds: [], maps: [], tags: [], excludedEntryIds: [] }, focus: { kind: "player", playerKey: mapping?.playerKey ?? `steam:${steamId}`, label: mapping?.displayName ?? label } }), goal: "player-analysis" } });
            }}
            onOpened={recordMatchOpened}
            onReplayPaused={recordReplayPaused}
            demoId={selectedDemoId}
            deepLink={evidenceSession || !active.ui ? matchDeepLink : null}
            onSelectDemo={(id) => openDemo(id)}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            onGoLibrary={() => goLibrary()}
            evidenceSession={evidenceSession}
            onMoveEvidence={moveEvidence}
            onReturnToSource={returnToEvidenceSource}
            workspaceState={active.ui as import("./lib/match-workspace-state").MatchWorkspaceState | null}
            onWorkspaceStateChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))}
          />
        )}
        {section === "analysis" && active.originSavedAnalysisId && <p>已保存分析：按当前资料库重新计算。</p>}
        {section === "analysis" && <AnalysisView key={active.id} page={destination.page as import("./lib/studio-navigation").AnalysisPageId} focus={analysisContext.focus} onBeginSave={async () => { const frame = navigationRef.current.active; if (frame.id !== active.id) throw new Error("分析页面已切换"); const id = frame.originSavedAnalysisId; if (!id) return null; const row = await savedAnalyses.get(id); if (!row) throw new Error("原保存项已删除，可另存"); return { title: row.title, shortcut: row.workbenchShortcut }; }} savedPanel={<SavedAnalysesPanel onReset={() => navigate({ page: "analysis", context: createAnalysisContextPreset("explore") })} entries={entries} events={eventScopes} onOpen={row => void openSavedAnalysis(row)} />} onSave={async (title, workbenchShortcut, copy) => {
          const frame = navigationRef.current.active;
          if (frame.id !== active.id || !("context" in frame.destination)) throw new Error("分析页面已切换");
          const input = { page: frame.destination.page, context: frame.destination.context, ui: frame.ui, title, workbenchShortcut } as SavedAnalysisInput;
          const saved = frame.originSavedAnalysisId && !copy ? await savedAnalyses.update(frame.originSavedAnalysisId, input) : await savedAnalyses.create(input);
          setNavigation(current => studioNavigationReducer(current, { intent: "saved-origin", frameId: frame.id, id: saved.id }));
        }} onSelect={page => {
          if (page === destination.page) return;
          const id = `frame-${++nextFrameId.current}`;
          const target = { page, context: analysisContext };
          setRestoringFrameId(findAnalysisFrame(navigationRef.current.history, target, navigationRef.current.active.originSavedAnalysisId)?.id ?? null);
          setNavigation(current => studioNavigationReducer(current, { intent: "switch-analysis", id, destination: target, scrollY: window.scrollY }));
        }}>
        {destination.page === "player" && (
          <PlayersView
            activity={activity}
            onCapabilityRepair={openCapabilityRepair}
            key={active.id}
            allEntries={entries}
            entries={scopedEntries}
            selectedTeam={selectedTeam}
            selectedPlayerKey={selectedPlayerKey}
            onSelectPlayer={openPlayer}
            onOpenMatch={openDemo}
            onOpenEvidence={openEvidence}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            state={active.ui as import("./lib/studio-page-state").PlayerPageState}
            onStateChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            identityOptions={identityOptions}
            contextSummary={summarizeAnalysisContext(analysisContext, entries, eventScopes)}
            onOpenMaterials={() => navigate({ page: "materials" })}
            onOpenOpening={() => navigate({ page: "opening", context: analysisContext })}
            onOpenRoles={() => navigate({ page: "roles", context: analysisContext })}
            onGoLibrary={() => goLibrary()}
          />
        )}
        {destination.page === "team" && (
          <TeamView
            activity={activity}
            onCapabilityRepair={openCapabilityRepair}
            key={active.id}
            entries={scopedEntries}
            selectedTeam={analysisContext.focus.kind === "team" ? analysisContext.focus.teamName : null}
            onSelectTeam={openTeam}
            onOpenMatch={openDemo}
            onOpenCapability={(key) => navigate({ page: key, context: key === "patterns" && analysisContext.focus.kind === "team" ? { ...analysisContext, goal: "own-review", roles: { ...analysisContext.roles, beneficiary: { kind: "team", id: analysisContext.focus.teamName.toLowerCase(), label: analysisContext.focus.teamName } } } : analysisContext })}
            state={active.ui as import("./lib/studio-page-state").TeamPageState}
            onStateChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            onGoLibrary={() => goLibrary()}
            identityOptions={identityOptions}
          />
        )}
        {destination.page === "roles" && (analysisContext.focus.kind === "player" || analysisContext.focus.kind === "self" ? (
          <PlayerRolesPanel key={active.id} entries={scopedEntries} onCapabilityRepair={openCapabilityRepair} playerKey={selectedPlayerKey!} playerLabel={(analysisContext.focus as Extract<AnalysisContext["focus"], { kind: "player" | "self" }>).label}
            selectedTeam={selectedTeam} identityOptions={identityOptions} onOpenEvidence={openEvidence}
            state={(active.ui as import("./lib/studio-page-state").RolesPageState).player}
            onStateChange={player => setNavigation(current => {
              if (current.active.id !== active.id) return current;
              const previous = current.active.ui as import("./lib/studio-page-state").RolesPageState;
              return studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui: { ...previous, player } });
            })} onPageReady={keys => onPageReady(active.id, keys)} />
        ) : analysisContext.focus.kind === "team" ? (
          <TeamRolesPanel key={active.id} entries={scopedEntries} onCapabilityRepair={openCapabilityRepair} teamName={selectedTeam!} identityOptions={identityOptions}
            onOpenEvidence={openEvidence} state={(active.ui as import("./lib/studio-page-state").RolesPageState).team}
            onStateChange={team => setNavigation(current => {
              if (current.active.id !== active.id) return current;
              const previous = current.active.ui as import("./lib/studio-page-state").RolesPageState;
              return studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui: { ...previous, team } });
            })} onPageReady={keys => onPageReady(active.id, keys)} />
        ) : <div className="stu-card"><h2>选择分析对象</h2><p>请先选择一名选手或一支队伍。</p><button type="button" className="stu-button" onClick={() => navigate({ page: "player", context: analysisContext })}>选择选手</button><button type="button" className="stu-button" onClick={() => navigate({ page: "team", context: analysisContext })}>选择队伍</button></div>)}
        {destination.page === "opening" && (
          <TrailsView
            onCapabilityRepair={openCapabilityRepair}
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            allEntries={entries}
            entries={scopedEntries}
            identityOptions={identityOptions}
            focusPlayerKey={selectedPlayerKey}
            onSelectPlayer={(playerKey, label) => setAnalysisContext(current => ({ ...current, focus: { kind: "player", playerKey, label } }))}
            state={active.ui as import("./lib/spatial-view-state").OpeningPageState}
            onStateChange={update => setNavigation(current => {
              if (current.active.id !== active.id) return current;
              const previous = current.active.ui as import("./lib/spatial-view-state").OpeningPageState;
              return studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui: typeof update === "function" ? update(previous) : update });
            })}
            onOpenMatch={(entryId, target, rounds) => openEvidence({ entryId, evidence: { ...target, reason: "开局动线" }, sourceKey: "opening:rounds",
              selectedKey: `${target.matchId}#R${target.roundNumber}`,
              queue: rounds.flatMap(round => { const entry = scopedEntries.find(item => matchIdForEntry(item) === round.matchId); return entry ? [{ key: `${round.matchId}#R${round.roundNumber}`, entryId: entry.id, evidence: { matchId: round.matchId, roundNumber: round.roundNumber, reason: "开局动线" } }] : []; })
            })}
            onGoLibrary={() => goLibrary()}
          />
        )}
        {destination.page === "duel" && (
          <CapabilityPanel entries={scopedEntries} capability="duel" onRepair={openCapabilityRepair}>{eligible =>
          <DuelView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            allEntries={entries}
            entries={eligible}
            selectedTeams={selectedTeams}
            playerSteamIds={selectedPlayerKey ? focusIdentity?.playerKey === selectedPlayerKey ? focusIdentity.steamIds : [] : null}
            state={active.ui as import("./lib/analysis-theme-state").DuelPageState}
            onStateChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))}
            onOpenEvidence={openEvidence}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            onGoLibrary={goLibrary}
            identityOptions={identityOptions}
            teamRenames={identityState.teamRenames}
          />
          }</CapabilityPanel>
        )}
        {destination.page === "utility" && (
          <CapabilityPanel entries={scopedEntries} capability="utility" onRepair={openCapabilityRepair}>{eligible =>
          <UtilityView
            key={active.id}
            allEntries={entries}
            entries={eligible}
            selectedTeams={selectedTeams}
            playerFocus={selectedPlayerKey ? focusIdentity?.playerKey === selectedPlayerKey ? focusIdentity : { playerKey: selectedPlayerKey, steamIds: [] } : null}
            onGoLineups={() => navigate({ page: "lineups", context: analysisContext })}
            state={active.ui as import("./lib/studio-page-state").UtilityPageState}
            onStateChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))}
            onOpenEvidence={openEvidence}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            identityOptions={identityOptions}
            onGoLibrary={() => goLibrary()}
          />
          }</CapabilityPanel>
        )}
        {destination.page === "lineups" && (
          <CapabilityPanel entries={scopedEntries} capability="lineup" onRepair={openCapabilityRepair}>{eligible =>
          <LineupsView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            onRebuild={handleRebuildSelected}
            state={active.ui as import("./lib/analysis-theme-state").LineupsPageState}
            onStateChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))}
            allEntries={entries}
            entries={eligible}
            onOpenEvidence={openEvidence}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            onGoLibrary={() => goLibrary()}
          />
          }</CapabilityPanel>
        )}
        {destination.page === "economy" && (
          <CapabilityPanel entries={scopedEntries} capability="economy" onRepair={openCapabilityRepair}>{eligible =>
          <EconomyView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            allEntries={entries}
            entries={eligible}
            selectedTeams={selectedTeams}
            playerFocused={selectedPlayerKey !== null}
            onViewMatches={() => navigate({ page: "matches", entryIds: eligible.map(entry => entry.id) })}
            state={active.ui as import("./lib/analysis-theme-state").EconomyPageState}
            onStateChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))}
            identityOptions={identityOptions}
            onGoLibrary={() => goLibrary()}
          />
          }</CapabilityPanel>
        )}
        {(destination.page === "patterns") && (
          <CapabilityPanel entries={scopedEntries} capability="tactical" onRepair={openCapabilityRepair}>{eligible =>
          <PatternsPage
            key={active.id}
            state={active.ui as import("./lib/pattern-page-state").PatternPageState}
            onStateChange={update => setNavigation(current => {
              if (current.active.id !== active.id) return current;
              const previous = current.active.ui as import("./lib/pattern-page-state").PatternPageState;
              return studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui: typeof update === "function" ? update(previous) : update });
            })}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            allEntries={entries}
            entries={eligible}
            onOpenMatch={(entryId, target) => {
              const entry = entries.find(item => item.id === entryId);
              if (entry && target) openEvidence({ entryId, evidence: { matchId: matchIdForEntry(entry), roundNumber: target.roundNumber, tick: target.tick, reason: "战术模式示例" }, sourceKey: "patterns:evidence" });
            }}
            onWatchDemo={nativeImportAvailable ? watchRawDemo : undefined}
            onGoLibrary={() => goLibrary()}
            teamRenames={identityState.teamRenames}
            analysisContext={analysisContext}
            onAnalysisContextChange={setAnalysisContext}
          />
          }</CapabilityPanel>
        )}
        {destination.page === "control" && (
          <RadarFieldView
            onCapabilityRepair={openCapabilityRepair}
            key={active.id}
            state={active.ui as import("./lib/spatial-view-state").ControlPageState}
            onStateChange={update => setNavigation(current => {
              if (current.active.id !== active.id) return current;
              const previous = current.active.ui as import("./lib/spatial-view-state").ControlPageState;
              return studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui: typeof update === "function" ? update(previous) : update });
            })}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            entries={scopedEntries}
            teamRenames={identityState.teamRenames}
            selectedTeam={selectedTeam}
            onOpenMatch={openDemo}
            onSelectTeam={selectRadarTeam}
          />

        )}
        {(destination.page === "event-analysis" || destination.page === "analysis") && (
          <TournamentDashboardView
            activity={activity}
            onCapabilityRepair={openCapabilityRepair}
            key={active.id}
            state={active.ui as import("./lib/studio-page-state").AnalysisPageState}
            onStateChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            allEntries={entries}
            entries={scopedEntries}
            selectedTeam={selectedTeam}
            identityOptions={identityOptions}
            onOpenMatch={openDemo}
            onOpenTeam={openTeam}
            onOpenPlayer={openPlayer}
            onGoLibrary={() => goLibrary()}
            onGoEconomy={() => navigate({ page: "economy", context: analysisContext })}
            onGoDirectory={destination.page === "event-analysis" ? () => {
              const directory = [...navigationRef.current.history].reverse().find(frame => frame.destination.page === "events");
              if (directory) { setRestoringFrameId(directory.id); setNavigation(current => studioNavigationReducer(current, { intent: "restore", frame: directory })); }
              else navigate({ page: "events" });
            } : undefined}
          />
        )}
        </AnalysisView>}
        {destination.page === "events" && (
          <EventsView
            key={active.id}
            events={eventRecords}
            series={seriesRecords}
            eventsStatus={eventsStatus}
            seriesStatus={seriesStatus}
            onRetry={() => { void refreshEventRecords().catch(() => {}); }}
            eventTools={<EventManager defaultOpen={false} entries={entries} onNotice={setNotice} onLibraryChanged={() => { void refreshEntries(); void refreshEventRecords(); }} onLoadBuiltin={loadBuiltinEvent} />}
            state={active.ui as import("./lib/studio-page-state").EventsPageState}
            onStateChange={ui => setNavigation(current => studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui }))}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            entries={entries}
            onOpenMatch={openDemo}
            onAnalyzeEvent={startEventAnalysis}
            onGoLibrary={() => goLibrary()}
            rivalHubConnection={rivalHubConnection}
            onConnectRivalHub={handleConnectRivalHub}
            onRevokeRivalHub={handleRevokeRivalHub}
            onRefreshRivalHub={refreshRivalHub}
            onImportOnlineFiles={importOnlineFiles}
            onPickOnlineFiles={nativeImportAvailable ? pickRivalHubFiles : undefined}
            onSyncLocalDemos={syncLocalRivalHubDemos}
          />
        )}
        {destination.page === "management" && (
          <ManagementView
            key={active.id}
            onPageReady={(keys) => onPageReady(active.id, keys)}
            entries={entries}
            identity={identityState}
            onIdentityChange={() => { void refreshIdentity(); }}
            identityOptions={identityOptions}
            teamRenames={identityState.teamRenames}
            onGoLibrary={() => goLibrary()}
            onNotice={setNotice}
            onLibraryChanged={() => { void refreshEntries().catch(() => {}); void refreshEventRecords().catch(() => {}); }}
            tab={(active.ui as import("./lib/studio-page-state").StudioPageStateMap["management"]).tab}
            onTabChange={tab => setNavigation(current => { if (current.active.destination.page !== "management") return current; return studioNavigationReducer(current, { intent: "ui", frameId: active.id, ui: { ...(current.active.ui as import("./lib/studio-page-state").StudioPageStateMap["management"]), tab } }); })}
            library={libraryView}
          />
        )}
      </main>
    </div>
  );
}
