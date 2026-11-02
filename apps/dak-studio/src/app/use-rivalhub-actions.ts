import { useCallback, useEffect, useRef, useState } from "react";
import { backfillDemoIdentities, listDemoEntries } from "../lib/library";
import type { StudioDemoEntry } from "../lib/demo-entry";
import { detectDemBackend, exportDemToZip } from "../lib/dem";
import { listSeriesRecords } from "../lib/series";
import { markRivalHubEventsStale, matchesRivalHubDemo, upsertRivalHubEvents } from "../lib/events";
import { assertRivalHubConnected, rivalHubFailureMessage, connectRivalHub, fetchRivalHubEvents, loadRivalHubConnection, revokeRivalHubPairing, type RivalHubConnectionState } from "../lib/rivalhub";
import { confirmRivalHubBatchReceipts, recountRivalHubBatch, rivalHubBatchCompletionMessage, runRivalHubBatch, type RivalHubBatchInput, type RivalHubBatchItem, type RivalHubBatchSession, type RivalHubImportContext } from "../lib/rivalhub-import";
import { importRivalHubFromNativePicker } from "../lib/rivalhub-acquisition";
type Activity = { importing: boolean; setImporting: (value: boolean) => void; setNotice: (message: string | null) => void };
type Options = { entries: StudioDemoEntry[]; refreshEntries: () => Promise<StudioDemoEntry[]>; refreshEventRecords: () => Promise<void>; activity: Activity };
export function useRivalHubActions({ entries, refreshEntries, refreshEventRecords, activity }: Options) {
  const { importing, setImporting, setNotice } = activity;
  const [rivalHubConnection, setRivalHubConnection] = useState<RivalHubConnectionState>({ baseUrl: "", pairingId: null, connectedAt: 0, lastSyncAt: null, status: "disconnected", error: null });
  const [rivalHubRefreshToken, setRivalHubRefreshToken] = useState(0);
  const [batchSession, setBatchSession] = useState<RivalHubBatchSession | null>(null);
  const batchSessionRef = useRef(batchSession);
  const batchStopRequested = useRef(false);
  const batchTargetResolvers = useRef(new Map<string, (matchMapId: string | null) => void>());
  useEffect(() => { void loadRivalHubConnection().then(setRivalHubConnection).catch(() => undefined); return () => { batchStopRequested.current = true; batchTargetResolvers.current.forEach(resolve => resolve(null)); batchTargetResolvers.current.clear(); }; }, []);
  const refreshRivalHub = useCallback(async (options: { announce?: boolean; confirmationSession?: RivalHubBatchSession } = {}): Promise<boolean> => {
    const announce = options.announce !== false;
    setRivalHubConnection((current) => ({ ...current, status: "connecting", error: null }));
    try {
      const response = await fetchRivalHubEvents();
      await upsertRivalHubEvents(response, await listDemoEntries());
      await refreshEventRecords();
      const connected = await loadRivalHubConnection();
      assertRivalHubConnected(connected);
      setRivalHubConnection(connected);
      const pending = options.confirmationSession ?? batchSessionRef.current;
      if (pending?.status === "completed" && pending.items.some(item => item.pendingReceipt)) {
        const confirmed = await confirmRivalHubBatchReceipts(pending, response);
        const applyConfirmation = (current: RivalHubBatchSession | null) => current?.id === confirmed.id
          ? recountRivalHubBatch({ ...current, items: current.items.map(item => item.pendingReceipt
            ? confirmed.items.find(updated => updated.id === item.id) ?? item : item) })
          : current;
        batchSessionRef.current = applyConfirmation(batchSessionRef.current);
        setBatchSession(applyConfirmation);
      }
      setRivalHubRefreshToken((current) => current + 1);
      if (announce) setNotice(`已刷新 RivalHub 赛事：${response.events.length} 个赛事`);
      return true;
    } catch (error) {
      await markRivalHubEventsStale().catch(() => undefined);
      await refreshEventRecords().catch(() => undefined);
      const current = await loadRivalHubConnection().catch(() => rivalHubConnection);
      const message = rivalHubFailureMessage(error, current);
      setRivalHubConnection({ ...current, status: "error", error: message });
      if (announce) setNotice(`RivalHub 刷新失败：${message}`);
      return false;
    }
  }, [refreshEventRecords, rivalHubConnection]);

  const handleConnectRivalHub = useCallback(async (baseUrl: string) => {
    setRivalHubConnection((current) => ({ ...current, baseUrl: baseUrl.trim(), status: "connecting", error: null }));
    try {
      const connected = await connectRivalHub(baseUrl, setNotice);
      setRivalHubConnection(connected);
      await refreshRivalHub();
    } catch (error) {
      const message = rivalHubFailureMessage(error);
      setRivalHubConnection((current) => ({ ...current, status: "error", error: message }));
      setNotice(`RivalHub 连接失败：${message}`);
    }
  }, [refreshRivalHub]);

  const handleRevokeRivalHub = useCallback(async () => {
    if (!window.confirm("将断开 RivalHub 并撤销此设备的访问凭据，之后需要重新授权才能连接。继续？")) return;
    try {
      await revokeRivalHubPairing();
      setRivalHubConnection(await loadRivalHubConnection());
      setRivalHubRefreshToken((current) => current + 1);
      setNotice("已断开 RivalHub，并撤销此设备的访问凭据");
    } catch (error) {
      const current = await loadRivalHubConnection().catch(() => rivalHubConnection);
      const message = rivalHubFailureMessage(error, current);
      setRivalHubConnection({ ...current, status: current.status === "disconnected" ? "disconnected" : "error", error: message });
      setNotice(`断开并撤销 RivalHub 失败：${message}`);
    }
  }, [rivalHubConnection]);

  const runRivalHubBatchInputs = useCallback(async (batchInputs: Iterable<RivalHubBatchInput>, context: RivalHubImportContext) => {
    if (importing) return;
    let inputs = [...batchInputs];
    if (inputs.length === 0) return;
    batchStopRequested.current = false;
    batchTargetResolvers.current.clear();
    batchSessionRef.current = null;
    setBatchSession(null);
    setImporting(true);
    setNotice("正在启动 RivalHub Demo 批处理…");
    let demBackend: Awaited<ReturnType<typeof detectDemBackend>> | undefined;
    try {
      const batchPromise = runRivalHubBatch(inputs, context, {
        exportDem: async (file, onProgress) => {
          demBackend ??= await detectDemBackend();
          return exportDemToZip(file, demBackend, onProgress);
        },
        shouldStop: () => batchStopRequested.current,
        resolveTarget: async (item: RivalHubBatchItem) => new Promise<string | null>((resolve) => {
          if (batchStopRequested.current) { resolve(null); return; }
          batchTargetResolvers.current.set(item.id, resolve);
        }),
        onUpdate: (next) => {
          batchSessionRef.current = next;
          setBatchSession(next);
          const current = next.items[next.currentIndex];
          setNotice(current ? `${current.fileName}：${current.message}` : null);
        },
      });
      // runRivalHubBatch copies the iterable synchronously before its first
      // await; do not keep a second batch-wide input array in the App closure.
      inputs = [];
      const session = await batchPromise;
      batchSessionRef.current = session;
      setBatchSession(session);
      const remoteRefreshSucceeded = await refreshRivalHub({ announce: false, confirmationSession: session });
      const confirmed = batchSessionRef.current?.id === session.id ? batchSessionRef.current : session;
      setBatchSession(current => current?.id === session.id ? confirmed : current);
      await refreshEntries();
      await refreshEventRecords();
      setNotice(rivalHubBatchCompletionMessage(confirmed, remoteRefreshSucceeded));
    } catch (error) {
      setNotice(`在线 Demo 批处理失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      batchTargetResolvers.current.forEach(resolve => resolve(null));
      batchTargetResolvers.current.clear();
      inputs = [];
      setImporting(false);
    }
  }, [importing, refreshEventRecords, refreshRivalHub]);

  const importOnlineFiles = useCallback(async (files: Iterable<File>, context: RivalHubImportContext) => {
    await runRivalHubBatchInputs(files, context);
  }, [runRivalHubBatchInputs]);

  const syncLocalRivalHubDemos = useCallback(async (context: RivalHubImportContext) => {
    if (importing) return;
    try {
      const { entries: refreshedEntries } = await backfillDemoIdentities();
      await refreshEntries();
      const currentSeries = await listSeriesRecords();
      const candidateKeys = new Set(context.candidates.map((candidate) => `${candidate.series.id}:${candidate.map.id}`));
      const linkedEntryIds = new Set(
        currentSeries.flatMap((series) => (series.mapAssignments ?? [])
          .filter((assignment) => assignment.entryId && assignment.rivalHub && candidateKeys.has(`${series.id}:${assignment.rivalHub.id}`))
          .map((assignment) => assignment.entryId!)),
      );
      const localEntries = refreshedEntries.filter((entry) => linkedEntryIds.has(entry.id) || context.candidates.some((candidate) => matchesRivalHubDemo(entry, candidate.series, candidate.map)));
      if (localEntries.length === 0) {
        setNotice("当前 Event / Stage 范围没有可同步的本地 Demo");
        return;
      }
      await runRivalHubBatchInputs(localEntries.map((entry) => ({ kind: "local", entry })), context);
    } catch (error) {
      setNotice(`扫描本地 Demo 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, [importing, runRivalHubBatchInputs]);

  const stopRivalHubBatch = useCallback(() => {
    batchStopRequested.current = true;
    batchTargetResolvers.current.forEach((resolve) => resolve(null));
    batchTargetResolvers.current.clear();
    setBatchSession((current) => current ? { ...current, status: "stopping" } : current);
  }, []);

  const pickRivalHubFiles = useCallback(async (context: RivalHubImportContext) => {
    try {
      const started = await importRivalHubFromNativePicker(context, importOnlineFiles);
      if (!started) setNotice(null);
    } catch (error) {
      setNotice(`选择 RivalHub Demo 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, [importOnlineFiles]);

  const selectRivalHubBatchTarget = useCallback((itemId: string, matchMapId: string) => {
    const resolve = batchTargetResolvers.current.get(itemId);
    if (!resolve) return;
    batchTargetResolvers.current.delete(itemId);
    resolve(matchMapId || null);
  }, []);

  const dismissBatch = () => { batchSessionRef.current = null; setBatchSession(null); };
  const updateLocalLink = (updated: RivalHubBatchItem) => {
    const current = batchSessionRef.current;
    if (!current) return;
    const next = { ...current, items: current.items.map(item => item.id === updated.id ? updated : item) };
    batchSessionRef.current = next;
    setBatchSession(next);
  };
  return { rivalHubConnection, rivalHubRefreshToken, batchSession, dismissBatch, updateLocalLink, refreshRivalHub, handleConnectRivalHub, handleRevokeRivalHub, importOnlineFiles, syncLocalRivalHubDemos, stopRivalHubBatch, pickRivalHubFiles, selectRivalHubBatchTarget };
}
