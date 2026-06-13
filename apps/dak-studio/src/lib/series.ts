import type { SeriesFormat, SeriesVeto, SeriesVetoStep } from "@cs2dak/contract";
import { ACTIVE_DUTY_MAPS } from "@cs2dak/maps";
import { matchDateFromFileName, type StudioDemoEntry } from "./library";
import { displayTeamName } from "./identity";

/** BP 录入默认图池：CS2 现役 7 张（de_ 形式，与 entry.meta.mapName 对齐）。 */
export const SERIES_MAP_POOL: string[] = [...ACTIVE_DUTY_MAPS];

/** de_mirage → Mirage（BP 录入/展示统一用此显示名）。 */
export function mapDisplayName(mapName: string): string {
  const base = mapName.replace(/^de_/, "");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

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
      const stableTeamKey = [teamAName, teamBName].sort().join("|");
      return {
        id: `series:${date}:${stableTeamKey}`,
        name: `${date} · ${teamAName} vs ${teamBName}`,
        entryIds: sorted.map((entry) => entry.id),
        format: formatForCount(sorted.length),
        teamAName,
        teamBName
      };
    })
    .sort((a, b) => b.entryIds.length - a.entryIds.length || a.name.localeCompare(b.name));
}

/**
 * 各赛制标准 BP 步骤骨架（队伍与动作，地图/选边留空）：
 * - BO1：A/B 轮流 ban 6 张 → decider（B 选边）
 * - BO3：A/B 各 ban → A/B 各 pick → A/B 各 ban → decider（剩图，拼刀）
 * - BO5：A/B 各 ban → 四张 pick 交替 → decider（剩图，拼刀）
 */
export function vetoSkeleton(format: SeriesFormat): Array<Pick<SeriesVetoStep, "actionType" | "teamKey">> {
  if (format === "bo1") {
    return [
      { actionType: "ban", teamKey: "teamA" },
      { actionType: "ban", teamKey: "teamA" },
      { actionType: "ban", teamKey: "teamB" },
      { actionType: "ban", teamKey: "teamB" },
      { actionType: "ban", teamKey: "teamB" },
      { actionType: "ban", teamKey: "teamA" },
      { actionType: "decider", teamKey: "teamB" }
    ];
  }
  if (format === "bo3") {
    return [
      { actionType: "ban", teamKey: "teamA" },
      { actionType: "ban", teamKey: "teamB" },
      { actionType: "pick", teamKey: "teamA" },
      { actionType: "pick", teamKey: "teamB" },
      { actionType: "ban", teamKey: "teamB" },
      { actionType: "ban", teamKey: "teamA" },
      { actionType: "decider", teamKey: null }
    ];
  }
  // bo5：2 ban 各一 + 4 pick 交替 + decider（拼刀）
  return [
    { actionType: "ban", teamKey: "teamA" },
    { actionType: "ban", teamKey: "teamB" },
    { actionType: "pick", teamKey: "teamA" },
    { actionType: "pick", teamKey: "teamB" },
    { actionType: "pick", teamKey: "teamA" },
    { actionType: "pick", teamKey: "teamB" },
    { actionType: "decider", teamKey: null }
  ];
}

/** 按 BP 顺序排序 entries（pick→decider→其余在最后）。可用于系列工作台地图 tab 排序。 */
export function sortEntriesByVeto(entries: StudioDemoEntry[], veto: SeriesVeto): StudioDemoEntry[] {
  const order = new Map<string, number>();
  let idx = 0;
  for (const step of veto.steps) {
    if (step.actionType === "pick" || step.actionType === "decider") {
      if (!order.has(step.mapName)) order.set(step.mapName, idx++);
    }
  }
  return [...entries].sort(
    (a, b) => (order.get(a.meta.mapName) ?? 999) - (order.get(b.meta.mapName) ?? 999)
  );
}

export function deriveVetoSummary(steps: SeriesVetoStep[]): Pick<SeriesVeto, "maps" | "sideChoices"> {
  return {
    maps: {
      picked: steps
        .filter((step) => step.actionType === "pick")
        .map((step) => ({ mapName: step.mapName, teamKey: step.teamKey })),
      banned: steps
        .filter((step) => step.actionType === "ban")
        .map((step) => ({ mapName: step.mapName, teamKey: step.teamKey })),
      decider: steps.find((step) => step.actionType === "decider")?.mapName ?? null
    },
    sideChoices: steps
      .filter((step): step is SeriesVetoStep & { side: "t" | "ct" } => step.side != null)
      .map((step) => ({ mapName: step.mapName, teamKey: step.teamKey, side: step.side }))
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
