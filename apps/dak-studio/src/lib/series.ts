import type { SeriesFormat, SeriesVeto, SeriesVetoStep } from "@cs2dak/contract";
import { matchDateFromFileName, type StudioDemoEntry } from "./library";
import { displayTeamName } from "./identity";

export interface StudioSeriesRecord {
  id: string;
  name: string;
  entryIds: string[];
  format: SeriesFormat;
  teamAName: string;
  teamBName: string;
  veto: SeriesVeto | null;
  createdAt: number;
  updatedAt: number;
}

export interface SeriesSuggestion {
  id: string;
  name: string;
  entryIds: string[];
  format: SeriesFormat;
  teamAName: string;
  teamBName: string;
}

export interface CoachSettings {
  myTeamName: string | null;
}

const DB_NAME = "dak-studio-series";
const DB_VER = 1;
const SERIES_STORE = "series";
const SETTINGS_STORE = "settings";
const PLAYBOOK_STORE = "playbook";
const SETTINGS_KEY = "coach";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SERIES_STORE)) db.createObjectStore(SERIES_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE);
      if (!db.objectStoreNames.contains(PLAYBOOK_STORE)) db.createObjectStore(PLAYBOOK_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("无法打开 series 库"));
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function formatForCount(count: number): SeriesFormat {
  if (count >= 4) return "bo5";
  if (count >= 2) return "bo3";
  return "bo1";
}

export function suggestSeriesGroups(
  entries: StudioDemoEntry[],
  teamRenames: Record<string, string> = {}
): SeriesSuggestion[] {
  const groups = new Map<string, StudioDemoEntry[]>();
  for (const entry of entries) {
    const date = matchDateFromFileName(entry.fileName) ?? "unknown-date";
    const teams = [displayTeamName(entry.meta.teamAName, teamRenames), displayTeamName(entry.meta.teamBName, teamRenames)].sort();
    const key = `${date}:${teams.join("|")}`;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return [...groups.values()]
    .map((list) => {
      const sorted = [...list].sort((a, b) => a.fileName.localeCompare(b.fileName));
      const first = sorted[0];
      const teamAName = displayTeamName(first.meta.teamAName, teamRenames);
      const teamBName = displayTeamName(first.meta.teamBName, teamRenames);
      const date = matchDateFromFileName(first.fileName) ?? "未标日期";
      return {
        id: sorted.map((entry) => entry.id).sort().join("|"),
        name: `${date} · ${teamAName} vs ${teamBName}`,
        entryIds: sorted.map((entry) => entry.id),
        format: formatForCount(sorted.length),
        teamAName,
        teamBName
      };
    })
    .sort((a, b) => b.entryIds.length - a.entryIds.length || a.name.localeCompare(b.name));
}

export function buildVetoTemplate(
  seriesId: string,
  format: SeriesFormat,
  teamAName: string,
  teamBName: string,
  mapPool: string[]
): SeriesVeto {
  const raw: Array<Omit<SeriesVetoStep, "stepOrder" | "mapName" | "side"> & { side?: "t" | "ct" | null }> =
    format === "bo1"
      ? [
          { actionType: "ban", teamKey: "teamA" },
          { actionType: "ban", teamKey: "teamA" },
          { actionType: "ban", teamKey: "teamB" },
          { actionType: "ban", teamKey: "teamB" },
          { actionType: "ban", teamKey: "teamB" },
          { actionType: "ban", teamKey: "teamA" },
          { actionType: "decider", teamKey: "teamB" }
        ]
      : format === "bo3"
        ? [
            { actionType: "ban", teamKey: "teamA" },
            { actionType: "ban", teamKey: "teamB" },
            { actionType: "pick", teamKey: "teamA" },
            { actionType: "pick", teamKey: "teamB" },
            { actionType: "ban", teamKey: "teamB" },
            { actionType: "ban", teamKey: "teamA" },
            { actionType: "decider", teamKey: null }
          ]
        : [
            { actionType: "ban", teamKey: "teamA" },
            { actionType: "ban", teamKey: "teamA" },
            { actionType: "pick", teamKey: "teamB" },
            { actionType: "pick", teamKey: "teamA" },
            { actionType: "pick", teamKey: "teamB" },
            { actionType: "pick", teamKey: "teamA" },
            { actionType: "decider", teamKey: null }
          ];
  return {
    version: "cs2-demo-analysis-kit/series-veto-0.1",
    seriesId,
    format,
    teamAName,
    teamBName,
    mapPool,
    steps: raw.map((step, index) => ({
      stepOrder: index + 1,
      actionType: step.actionType,
      teamKey: step.teamKey,
      mapName: mapPool[index % Math.max(mapPool.length, 1)] ?? "",
      side: step.side ?? null
    }))
  };
}

export async function listSeriesRecords(): Promise<StudioSeriesRecord[]> {
  try {
    const db = await openDb();
    const rows = await idbReq(db.transaction(SERIES_STORE, "readonly").objectStore(SERIES_STORE).getAll() as IDBRequest<StudioSeriesRecord[]>);
    db.close();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function saveSeriesRecord(record: Omit<StudioSeriesRecord, "createdAt" | "updatedAt">): Promise<StudioSeriesRecord> {
  const db = await openDb();
  const existing = await idbReq(db.transaction(SERIES_STORE, "readonly").objectStore(SERIES_STORE).get(record.id) as IDBRequest<StudioSeriesRecord | undefined>);
  const now = Date.now();
  const next: StudioSeriesRecord = { ...record, createdAt: existing?.createdAt ?? now, updatedAt: now };
  await idbReq(db.transaction(SERIES_STORE, "readwrite").objectStore(SERIES_STORE).put(next));
  db.close();
  return next;
}

export async function loadCoachSettings(): Promise<CoachSettings> {
  try {
    const db = await openDb();
    const value = await idbReq(db.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(SETTINGS_KEY) as IDBRequest<CoachSettings | undefined>);
    db.close();
    return value ?? { myTeamName: null };
  } catch {
    return { myTeamName: null };
  }
}

export async function saveCoachSettings(settings: CoachSettings): Promise<CoachSettings> {
  const db = await openDb();
  await idbReq(db.transaction(SETTINGS_STORE, "readwrite").objectStore(SETTINGS_STORE).put(settings, SETTINGS_KEY));
  db.close();
  return settings;
}

export async function listPlaybookNames(): Promise<Record<string, string>> {
  try {
    const db = await openDb();
    const store = db.transaction(PLAYBOOK_STORE, "readonly").objectStore(PLAYBOOK_STORE);
    const keys = await idbReq(store.getAllKeys() as IDBRequest<IDBValidKey[]>);
    const values = await idbReq(store.getAll() as IDBRequest<string[]>);
    db.close();
    return Object.fromEntries(keys.map((key, index) => [String(key), values[index] ?? ""]));
  } catch {
    return {};
  }
}

export async function savePlaybookName(clusterId: string, name: string): Promise<void> {
  const db = await openDb();
  await idbReq(db.transaction(PLAYBOOK_STORE, "readwrite").objectStore(PLAYBOOK_STORE).put(name.trim(), clusterId));
  db.close();
}
