import { eventPackageSchema, type EventPackage, type EventStage } from "@cs2dak/contract";
import { getStorage } from "./storage";
import { deleteSeriesRecord, saveSeriesRecord, type StudioSeriesRecord } from "./series";
import type { StudioDemoEntry } from "./library";

export interface StudioEventRecord {
  id: string;
  slug: string;
  name: string;
  kind: string;
  source: EventPackage["source"];
  stages: EventStage[];
  seriesIds: string[];
  readOnly: boolean;
  importedAt: number;
  updatedAt: number;
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
        const matched = candidates.find((entry) =>
          !used.has(entry.id) && (
            (map.demoHint?.sha256 && entry.id === map.demoHint.sha256) ||
            (map.demoHint?.fileName && entry.fileName === map.demoHint.fileName) ||
            entry.meta.mapName === map.mapName
          ),
        ) ?? null;
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
    stages: pkg.event.stages,
    seriesIds: savedSeries.map((series) => series.id),
    readOnly: pkg.source === "r2",
    importedAt: previous?.importedAt ?? now,
    updatedAt: now,
  };
  await eventStore.put(event.id, event);
  return { event, series: savedSeries, matchedMaps, missingMaps };
}

export async function importEventPackageFile(file: File, entries: StudioDemoEntry[]): Promise<EventImportResult> {
  return importEventPackage(JSON.parse(await file.text()), entries);
}

export async function deleteEventRecord(event: StudioEventRecord): Promise<void> {
  await Promise.all(event.seriesIds.map(deleteSeriesRecord));
  await eventStore.delete(event.id);
}
