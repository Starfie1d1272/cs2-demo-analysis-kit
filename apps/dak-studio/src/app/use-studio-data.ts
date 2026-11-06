import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidateLibrarySourceCaches, listDemoEntries } from '../lib/library';
import type { StudioDemoEntry } from '../lib/demo-entry';
import { listSeriesRecords, pruneOrphanSeries, type StudioSeriesRecord } from '../lib/series';
import { listEventRecords, type StudioEventRecord } from '../lib/events';
import { loadIdentityState } from '../lib/identity-commands';
import type { IdentityStoreState } from '../lib/identity';
import {
  ensureAnalysisDataReady,
  getAnalysisDataSnapshot,
  subscribeAnalysisDataInvalidation,
} from '../lib/queries/query-cache';
export type DirectoryLoadStatus = 'loading' | 'ready' | 'error';

export function useStudioData({
  onError,
  importing,
}: {
  onError: (message: string) => void;
  importing: boolean;
}) {
  const [entries, setEntries] = useState<StudioDemoEntry[]>([]);
  const [entriesReady, setEntriesReady] = useState(false);
  const [entriesStatus, setEntriesStatus] = useState<DirectoryLoadStatus>('loading');
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [eventsStatus, setEventsStatus] = useState<DirectoryLoadStatus>('loading');
  const [seriesStatus, setSeriesStatus] = useState<DirectoryLoadStatus>('loading');
  const [eventRecords, setEventRecords] = useState<StudioEventRecord[]>([]);
  const [seriesRecords, setSeriesRecords] = useState<StudioSeriesRecord[]>([]);
  const [identityStatus, setIdentityStatus] = useState<DirectoryLoadStatus>('loading');
  const [identityReady, setIdentityReady] = useState(false);
  const [identityState, setIdentityState] = useState<IdentityStoreState>({
    version: 0,
    mappings: [],
    teamRenames: {},
  });
  const mounted = useRef(false);
  const directoryRefreshPending = useRef(false);
  const versions = useRef({ entries: 0, events: 0, identity: 0 });
  const refreshEntries = useCallback(async () => {
    const id = ++versions.current.entries;
    if (mounted.current) {
      setEntriesStatus('loading');
      setEntriesError(null);
    }
    try {
      const rows = await listDemoEntries();
      if (mounted.current && id === versions.current.entries) {
        setEntries(rows);
        setEntriesReady(true);
        setEntriesStatus('ready');
      }
      return rows;
    } catch (error) {
      if (mounted.current && id === versions.current.entries) {
        setEntriesError(error instanceof Error ? error.message : String(error));
        setEntriesStatus('error');
      }
      throw error;
    }
  }, []);
  const refreshEventRecords = useCallback(async () => {
    const id = ++versions.current.events;
    if (mounted.current) {
      setEventsStatus('loading');
      setSeriesStatus('loading');
    }
    const results = await Promise.allSettled([
      listEventRecords().then(
        (events) => {
          if (mounted.current && id === versions.current.events) {
            setEventRecords(events);
            setEventsStatus('ready');
          }
        },
        (error) => {
          if (mounted.current && id === versions.current.events) {
            setEventsStatus('error');
            onError(`读取赛事失败：${String(error)}`);
          }
          throw error;
        },
      ),
      listSeriesRecords().then(
        (series) => {
          if (mounted.current && id === versions.current.events) {
            setSeriesRecords(series);
            setSeriesStatus('ready');
          }
        },
        (error) => {
          if (mounted.current && id === versions.current.events) {
            setSeriesStatus('error');
            onError(`读取系列失败：${String(error)}`);
          }
          throw error;
        },
      ),
    ]);
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('读取赛事或系列失败');
  }, [onError]);
  const refreshIdentity = useCallback(async () => {
    const id = ++versions.current.identity;
    if (mounted.current) setIdentityStatus('loading');
    try {
      const identity = await loadIdentityState();
      if (mounted.current && id === versions.current.identity) {
        setIdentityState(identity);
        setIdentityReady(true);
        setIdentityStatus('ready');
      }
    } catch (error) {
      if (mounted.current && id === versions.current.identity) setIdentityStatus('error');
      throw error;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void ensureAnalysisDataReady().catch(() => {});
    const initialVersion = versions.current.entries + 1;
    void refreshEntries()
      .then(async (rows) => {
        if (mounted.current && versions.current.entries === initialVersion) {
          await pruneOrphanSeries(new Set(rows.map((row) => row.id))).catch((error) => {
            if (mounted.current) onError(`清理系列失败：${String(error)}`);
          });
          await refreshEventRecords().catch(() => {});
        }
      })
      .catch((err) => {
        if (mounted.current && versions.current.entries === initialVersion)
          onError(`读取本地资料库失败：${err instanceof Error ? err.message : String(err)}`);
      });
    void refreshEventRecords().catch(() => {});
    void refreshIdentity().catch((err) => {
      if (mounted.current) onError(`读取身份失败：${String(err)}`);
    });
    return () => {
      mounted.current = false;
      versions.current.entries++;
      versions.current.events++;
      versions.current.identity++;
    };
  }, [onError, refreshEntries, refreshEventRecords, refreshIdentity]);
  useEffect(() => {
    let generation = getAnalysisDataSnapshot().generation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (
        !directoryRefreshPending.current ||
        importing ||
        getAnalysisDataSnapshot().status !== 'ready'
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        directoryRefreshPending.current = false;
        void refreshEntries().catch(() => {});
      }, 500);
    };
    const unsubscribe = subscribeAnalysisDataInvalidation(() => {
      const next = getAnalysisDataSnapshot();
      if (next.generation !== generation) {
        generation = next.generation;
        invalidateLibrarySourceCaches();
        // A read started before this revision must never publish its old rows.
        versions.current.entries++;
        directoryRefreshPending.current = true;
      }
      schedule();
    });
    schedule();
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [importing, refreshEntries]);
  return {
    entries,
    entriesReady,
    entriesStatus,
    entriesError,
    identityStatus,
    identityReady,
    eventsStatus,
    seriesStatus,
    eventRecords,
    seriesRecords,
    identityState,
    refreshEntries,
    refreshEventRecords,
    refreshIdentity,
  };
}
