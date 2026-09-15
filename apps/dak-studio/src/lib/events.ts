import { eventPackageSchema, type EventPackage, type EventStage } from "@cs2dak/contract";
import { getStorage } from "./storage";
import { deleteSeriesRecord, listSeriesRecords, saveSeriesRecord, type StudioSeriesRecord } from "./series";
import type { StudioDemoEntry } from "./library";
import type { RivalHubEventsResponse, RivalHubRemoteMap, RivalHubRemoteSeries, RivalHubRemoteTeam } from "./rivalhub-contract";

export interface StudioEventRecord {
  id: string;
  slug: string;
  name: string;
  kind: string;
  source: EventPackage["source"];
  sourceUrl?: string | null;
  stages: EventStage[];
  seriesIds: string[];
  readOnly: boolean;
  importedAt: number;
  updatedAt: number;
  /** 远程赛事同步元数据是现有 Event record 的增量字段，不另建 RivalHubEventRecord。 */
  rivalHub?: {
    seasonId: string;
    revision: string;
    lastSyncedAt: number;
    stale: boolean;
    /** EventRoster projection used for canonical Demo team identity. */
    teams?: RivalHubRemoteTeam[];
  };
}

export interface EventImportResult {
  event: StudioEventRecord;
  series: StudioSeriesRecord[];
  matchedMaps: number;
  missingMaps: number;
}

const eventStore = getStorage().records("events");

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function sameTeams(entry: StudioDemoEntry, teamA: string, teamB: string): boolean {
  const actual = [normalized(entry.meta.teamAName), normalized(entry.meta.teamBName)].sort();
  const expected = [normalized(teamA), normalized(teamB)].sort();
  return actual[0] === expected[0] && actual[1] === expected[1];
}

function sameRemoteMap(entry: StudioDemoEntry, series: Pick<RivalHubRemoteSeries, "teamAName" | "teamBName">, map: RivalHubRemoteMap): boolean {
  if (normalized(entry.meta.mapName) !== normalized(map.mapName)) return false;
  if (!sameTeams(entry, series.teamAName, series.teamBName)) return false;
  if (map.scoreA == null || map.scoreB == null) return true;
  const direct = normalized(entry.meta.teamAName) === normalized(series.teamAName);
  return direct
    ? entry.meta.teamAScore === map.scoreA && entry.meta.teamBScore === map.scoreB
    : entry.meta.teamAScore === map.scoreB && entry.meta.teamBScore === map.scoreA;
}

/** 与远程赛事刷新使用同一匹配口径，供显式本地 Demo 同步筛选当前范围。 */
export function matchesRivalHubDemo(
  entry: StudioDemoEntry,
  series: Pick<RivalHubRemoteSeries, "teamAName" | "teamBName">,
  map: RivalHubRemoteMap,
): boolean {
  return sameRemoteMap(entry, series, map);
}

function matchRemoteMap(
  entries: StudioDemoEntry[],
  series: RivalHubRemoteSeries,
  map: RivalHubRemoteMap,
  used: Set<string>,
  previousId?: string | null,
): string | null {
  const previous = previousId ? entries.find((entry) => entry.id === previousId) : undefined;
  if (previous && !used.has(previous.id) && sameRemoteMap(previous, series, map)) return previous.id;
  const candidates = entries.filter((entry) => !used.has(entry.id) && sameRemoteMap(entry, series, map));
  return candidates.length === 1 ? candidates[0]!.id : null;
}

export async function listEventRecords(): Promise<StudioEventRecord[]> {
  return (await eventStore.getAll<StudioEventRecord>()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function importEventPackage(input: unknown, entries: StudioDemoEntry[]): Promise<EventImportResult> {
  const pkg = eventPackageSchema.parse(input);
  const teamByKey = new Map(pkg.teams.map((team) => [team.key, team]));
  const eventId = `event:${pkg.event.slug}`;
  const savedSeries: StudioSeriesRecord[] = [];
  let matchedMaps = 0;
  let missingMaps = 0;

  for (const external of pkg.series) {
    const teamA = teamByKey.get(external.teamAKey)!;
    const teamB = teamByKey.get(external.teamBKey)!;
    const candidates = entries.filter((entry) => sameTeams(entry, teamA.name, teamB.name));
    const used = new Set<string>();
    const assignments = [...external.maps]
      .sort((a, b) => a.order - b.order)
      .map((map) => {
        // sha256 / fileName 全局唯一 → 优先全局匹配，不被 demo 内嵌队名与包内队名的拼写差异挡住
        // （如 demo "Team Liquid"/"BetBoom Team" vs 包 "Liquid"/"BetBoom"）；无 hint 命中再按同队伍 + 地图兜底。
        const matched =
          entries.find((entry) =>
            !used.has(entry.id) && (
              (map.demoHint?.sha256 && entry.id === map.demoHint.sha256) ||
              (map.demoHint?.fileName && entry.fileName === map.demoHint.fileName)
            ),
          ) ??
          candidates.find((entry) => !used.has(entry.id) && entry.meta.mapName === map.mapName) ??
          null;
        if (matched) {
          used.add(matched.id);
          matchedMaps += 1;
        } else {
          missingMaps += 1;
        }
        return { order: map.order, mapName: map.mapName, entryId: matched?.id ?? null };
      });
    const id = `${eventId}:series:${external.key}`;
    const veto = external.veto ? { ...external.veto, seriesId: id, teamAName: teamA.name, teamBName: teamB.name } : null;
    savedSeries.push(await saveSeriesRecord({
      id,
      name: `${teamA.name} vs ${teamB.name}`,
      entryIds: assignments.flatMap((assignment) => assignment.entryId ? [assignment.entryId] : []),
      format: external.format,
      teamAName: teamA.name,
      teamBName: teamB.name,
      veto,
      eventId,
      externalKey: external.key,
      stageKey: external.stage ?? null,
      round: external.round ?? null,
      entryRound: external.entryRound ?? null,
      bracketNodeId: external.bracketNodeId ?? null,
      status: external.status,
      scoreA: external.scoreA ?? null,
      scoreB: external.scoreB ?? null,
      teamARecordBefore: external.teamARecordBefore ?? null,
      teamBRecordBefore: external.teamBRecordBefore ?? null,
      scheduledAt: external.scheduledAt ?? null,
      completedAt: external.completedAt ?? null,
      matchUrl: external.matchUrl ?? null,
      rawDemoHint: external.rawDemoHint ?? null,
      mapAssignments: assignments,
    }));
  }

  const now = Date.now();
  const previous = await eventStore.get<StudioEventRecord>(eventId);
  const event: StudioEventRecord = {
    id: eventId,
    slug: pkg.event.slug,
    name: pkg.event.name,
    kind: pkg.event.kind,
    source: pkg.source,
    sourceUrl: pkg.event.sourceUrl ?? null,
    stages: pkg.event.stages,
    seriesIds: savedSeries.map((series) => series.id),
    readOnly: pkg.source === "r2",
    importedAt: previous?.importedAt ?? now,
    updatedAt: now,
  };
  await eventStore.put(event.id, event);
  return { event, series: savedSeries, matchedMaps, missingMaps };
}

export async function deleteEventRecord(event: StudioEventRecord): Promise<void> {
  await Promise.all(event.seriesIds.map(deleteSeriesRecord));
  await eventStore.delete(event.id);
}

function stageFromRemote(stage: RivalHubEventsResponse["events"][number]["stages"][number]): EventStage {
  return {
    key: stage.key,
    name: stage.name,
    type: stage.type,
    teamCount: stage.teamCount,
    advanceCount: stage.advanceCount,
    ...(stage.matchFormat ? { matchFormat: stage.matchFormat } : {}),
    ...(stage.finalFormat ? { finalFormat: stage.finalFormat } : {}),
    ...(stage.bracketNodes ? { bracketNodes: stage.bracketNodes } : {}),
    ...(stage.standings ? { standings: stage.standings } : {}),
  };
}

/** 只更新指定 RivalHub Map 的本地 Demo 引用；远程 map 状态仍归 RivalHub 所有。 */
export async function linkDemoToRivalHubMap(seriesId: string, matchMapId: string, entryId: string): Promise<void> {
  const record = (await listSeriesRecords()).find((series) => series.id === seriesId);
  if (!record?.mapAssignments) throw new Error("本地赛事系列不存在或缺少地图分配");
  const assignments = record.mapAssignments.map((assignment) => assignment.rivalHub?.id === matchMapId
    ? { ...assignment, entryId }
    : assignment);
  if (!assignments.some((assignment) => assignment.rivalHub?.id === matchMapId)) {
    throw new Error("本地赛事系列中不存在指定 RivalHub Map");
  }
  const entryIds = [...new Set(assignments.flatMap((assignment) => assignment.entryId ? [assignment.entryId] : []))];
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...editable } = record;
  await saveSeriesRecord({ ...editable, entryIds, mapAssignments: assignments });
}

/**
 * 把 RivalHub 远程赛事增量写入现有 Event/Series/Map record。
 * 本地 Demo 仍由 library owner 管理；这里只做 stable target/status 元数据的 upsert。
 */
export async function upsertRivalHubEvents(
  response: RivalHubEventsResponse,
  entries: StudioDemoEntry[],
): Promise<void> {
  const [previousEvents, previousSeries] = await Promise.all([listEventRecords(), listSeriesRecords()]);
  const previousSeriesById = new Map(previousSeries.map((row) => [row.id, row]));
  const nextEventIds = new Set<string>();
  for (const remote of response.events) {
    const eventId = `event:rivalhub:${remote.seasonId}`;
    nextEventIds.add(eventId);
    const previousEvent = previousEvents.find((event) => event.id === eventId);
    const savedSeries: StudioSeriesRecord[] = [];
    for (const external of remote.series) {
      const id = `${eventId}:series:${external.id}`;
      const previous = previousSeriesById.get(id);
      const used = new Set<string>();
      const assignments = external.maps
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((map) => {
          const previousAssignment = previous?.mapAssignments?.find((assignment) => assignment.rivalHub?.id === map.id);
          const entryId = matchRemoteMap(entries, external, map, used, previousAssignment?.entryId);
          if (entryId) used.add(entryId);
          return {
            order: map.order,
            mapName: map.mapName,
            entryId,
            rivalHub: map,
          };
        });
      const veto = external.veto ? { ...external.veto, seriesId: id } : null;
      savedSeries.push(await saveSeriesRecord({
        id,
        name: `${external.teamAName} vs ${external.teamBName}`,
        entryIds: assignments.flatMap((assignment) => assignment.entryId ? [assignment.entryId] : []),
        format: external.format,
        teamAName: external.teamAName,
        teamBName: external.teamBName,
        veto,
        eventId,
        externalKey: external.key,
        stageKey: external.stageKey,
        round: external.round,
        entryRound: external.entryRound,
        bracketNodeId: external.bracketNodeId,
        status: external.status,
        scoreA: external.scoreA,
        scoreB: external.scoreB,
        teamARecordBefore: external.teamARecordBefore,
        teamBRecordBefore: external.teamBRecordBefore,
        scheduledAt: external.scheduledAt,
        completedAt: external.completedAt,
        matchUrl: null,
        rawDemoHint: null,
        mapAssignments: assignments,
        rivalHub: {
          seasonId: remote.seasonId,
          matchId: external.id,
          stageRunId: external.stageKey ? (external.maps[0]?.target.stageRunId ?? null) : null,
          entryAId: external.entryAId,
          entryBId: external.entryBId,
          revision: remote.revision,
        },
      }));
    }
    const nextSeriesIds = new Set(savedSeries.map((row) => row.id));
    await Promise.all((previousEvent?.seriesIds ?? []).filter((id) => !nextSeriesIds.has(id)).map(deleteSeriesRecord));
    const now = Date.now();
    await eventStore.put(eventId, {
      id: eventId,
      slug: remote.slug,
      name: remote.name,
      kind: remote.kind,
      source: "rivalhub",
      sourceUrl: null,
      stages: remote.stages.map(stageFromRemote),
      seriesIds: savedSeries.map((row) => row.id),
      readOnly: true,
      importedAt: previousEvent?.importedAt ?? now,
      updatedAt: now,
      rivalHub: { seasonId: remote.seasonId, revision: remote.revision, lastSyncedAt: now, stale: false, teams: remote.teams },
    } satisfies StudioEventRecord);
  }

  // A successful refresh is authoritative for the connected season scope.
  // Remove only remote records absent from the response; local Demo entries are
  // owned by the library and remain untouched.
  await Promise.all(previousEvents
    .filter((event) => event.source === "rivalhub" && event.rivalHub && !nextEventIds.has(event.id))
    .map(async (event) => {
      await Promise.all(event.seriesIds.map(deleteSeriesRecord));
      await eventStore.delete(event.id);
    }));
}

export async function markRivalHubEventsStale(): Promise<void> {
  const events = await listEventRecords();
  await Promise.all(events.filter((event) => event.source === "rivalhub" && event.rivalHub).map((event) => eventStore.put(event.id, {
    ...event,
    rivalHub: { ...event.rivalHub!, stale: true },
  })));
}
