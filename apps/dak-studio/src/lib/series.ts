import type { SeriesFormat, SeriesVeto, SeriesVetoStep } from "@cs2dak/contract";
import type { PlaylistItem } from "./playlist";
import { ACTIVE_DUTY_MAPS } from "@cs2dak/maps";
import { entryDate, type StudioDemoEntry } from "./library";
import { displayTeamName } from "./identity";
import { getStorage } from "./storage";

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
  eventId?: string | null;
  externalKey?: string | null;
  stageKey?: string | null;
  round?: number | null;
  entryRound?: string | null;
  bracketNodeId?: string | null;
  status?: "scheduled" | "in_progress" | "finished" | "cancelled";
  scoreA?: number | null;
  scoreB?: number | null;
  teamARecordBefore?: string | null;
  teamBRecordBefore?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  mapAssignments?: Array<{ order: number; mapName: string; entryId: string | null }>;
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
  opponentTeamName: string | null;
}

const SETTINGS_KEY = "coach";

const seriesStore = getStorage().records("series");
const settingsStore = getStorage().records("series-settings");
const playbookStore = getStorage().records("playbook");
const playlistStore = getStorage().records("playlist");
const mapPoolNotesStore = getStorage().records("map-pool-notes");

/** 按 demo 数量推断初始赛制（用户可在 UI 中手动调整）。
 *  启发式：>=4 场只可能是 BO5；2-3 场大概率 BO3。
 *  无法区分 BO3(2:1) 与 BO5(3:0)，保守偏 BO3。 */
export function formatForCount(count: number): SeriesFormat {
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
    const date = entryDate(entry) ?? "unknown-date";
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
      const date = entryDate(first) ?? "未标日期";
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
    const rows = await seriesStore.getAll<StudioSeriesRecord>();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function saveSeriesRecord(record: Omit<StudioSeriesRecord, "createdAt" | "updatedAt">): Promise<StudioSeriesRecord> {
  const existing = await seriesStore.get<StudioSeriesRecord>(record.id);
  const now = Date.now();
  const next: StudioSeriesRecord = { ...record, createdAt: existing?.createdAt ?? now, updatedAt: now };
  await seriesStore.put(next.id, next);
  return next;
}

export async function deleteSeriesRecord(id: string): Promise<void> {
  await seriesStore.delete(id);
}

/**
 * 清理孤儿系列赛 record：无 eventId（loose——由 suggestSeriesGroups + BP 录入产生）且 entryIds
 * 全部已不在资料库的记录删掉。赛事关联的 series 由 deleteEventRecord 管理，不在此动。
 * 删 demo 后调用可避免残留的旧系列赛（含其 BP）继续显示，造成 records>suggestions 的计数错位。
 * 返回删除条数。
 */
export async function pruneOrphanSeries(existingEntryIds: Set<string>): Promise<number> {
  const records = await listSeriesRecords();
  let removed = 0;
  for (const record of records) {
    if (record.eventId) continue;
    const stillLinked = record.entryIds.some((id) => existingEntryIds.has(id));
    if (!stillLinked) {
      await deleteSeriesRecord(record.id);
      removed += 1;
    }
  }
  return removed;
}

export async function loadCoachSettings(): Promise<CoachSettings> {
  try {
    const value = await settingsStore.get<CoachSettings>(SETTINGS_KEY);
    return { myTeamName: value?.myTeamName ?? null, opponentTeamName: value?.opponentTeamName ?? null };
  } catch {
    return { myTeamName: null, opponentTeamName: null };
  }
}

export async function saveCoachSettings(settings: CoachSettings): Promise<CoachSettings> {
  await settingsStore.put(SETTINGS_KEY, settings);
  return settings;
}

export async function listPlaybookNames(): Promise<Record<string, string>> {
  try {
    const entries = await playbookStore.entries<string>();
    return Object.fromEntries(entries.map(([key, value]) => [key, value ?? ""]));
  } catch {
    return {};
  }
}

export async function savePlaybookName(clusterId: string, name: string): Promise<void> {
  await playbookStore.put(clusterId, name.trim());
}

export async function listPlaylist(): Promise<PlaylistItem[]> {
  try {
    const rows = await playlistStore.getAll<PlaylistItem>();
    return rows.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
  } catch {
    return [];
  }
}

export async function savePlaylistItem(item: PlaylistItem): Promise<void> {
  await playlistStore.put(item.id, { ...item, addedAt: item.addedAt ?? Date.now() });
}

export async function removePlaylistItem(id: string): Promise<void> {
  await playlistStore.delete(id);
}

export async function listMapPoolNotes(): Promise<Record<string, string>> {
  try {
    const entries = await mapPoolNotesStore.entries<string>();
    return Object.fromEntries(entries.map(([mapName, note]) => [mapName, note ?? ""]));
  } catch {
    return {};
  }
}

export async function saveMapPoolNote(mapName: string, note: string): Promise<void> {
  await mapPoolNotesStore.put(mapName, note);
}
