import { useCallback, useEffect, useRef, useState } from "react";
import { listDemoEntries } from "../lib/library";
import type { StudioDemoEntry } from "../lib/demo-entry";
import { listSeriesRecords, pruneOrphanSeries, type StudioSeriesRecord } from "../lib/series";
import { listEventRecords, type StudioEventRecord } from "../lib/events";
import { loadIdentityState, type IdentityStoreState } from "../lib/identity";
import { ensureAnalysisDataReady } from "../lib/queries/query-cache";
export function useStudioData({ onError }: { onError: (message: string) => void }) {
  const [entries, setEntries] = useState<StudioDemoEntry[]>([]);
  const [entriesReady, setEntriesReady] = useState(false);
  const [eventRecords, setEventRecords] = useState<StudioEventRecord[]>([]);
  const [seriesRecords, setSeriesRecords] = useState<StudioSeriesRecord[]>([]);
  const [identityState, setIdentityState] = useState<IdentityStoreState>({ version: 0, mappings: [], teamRenames: {} });
  const mounted = useRef(false);
  const versions = useRef({ entries: 0, events: 0, identity: 0 });
  const refreshEntries = useCallback(async () => { const id = ++versions.current.entries; const rows = await listDemoEntries(); if (mounted.current && id === versions.current.entries) setEntries(rows); return rows; }, []);
  const refreshEventRecords = useCallback(async () => {
    const id = ++versions.current.events;
    const report = (kind: string, error: unknown) => {
      if (mounted.current && id === versions.current.events) onError(`读取${kind}失败：${String(error)}`);
      throw error;
    };
    const results = await Promise.allSettled([
      listEventRecords().then(events => { if (mounted.current && id === versions.current.events) setEventRecords(events); }, error => report("赛事", error)),
      listSeriesRecords().then(series => { if (mounted.current && id === versions.current.events) setSeriesRecords(series); }, error => report("系列", error)),
    ]);
    if (results.some(result => result.status === "rejected")) throw new Error("读取赛事或系列失败");
  }, [onError]);
  const refreshIdentity = useCallback(async () => { const id = ++versions.current.identity; const identity = await loadIdentityState(); if (mounted.current && id === versions.current.identity) setIdentityState(identity); }, []);
  useEffect(() => {
    mounted.current = true;
    void ensureAnalysisDataReady().catch(() => {});
    const initialVersion = versions.current.entries + 1;
    void refreshEntries().then(async rows => { if (mounted.current && versions.current.entries === initialVersion) { await pruneOrphanSeries(new Set(rows.map(row => row.id))); await refreshEventRecords().catch(() => {}); } }).catch(err => { if (mounted.current) onError(`读取本地资料库失败：${err instanceof Error ? err.message : String(err)}`); }).finally(() => { if (mounted.current) setEntriesReady(true); });
    void refreshEventRecords().catch(() => {});
    void refreshIdentity().catch(err => { if (mounted.current) onError(`读取身份失败：${String(err)}`); });
    return () => { mounted.current = false; versions.current.entries++; versions.current.events++; versions.current.identity++; };
  }, [onError, refreshEntries, refreshEventRecords, refreshIdentity]);
  return { entries, entriesReady, eventRecords, seriesRecords, identityState, refreshEntries, refreshEventRecords, refreshIdentity };
}
