import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { deleteEventRecord, importEventPackage, listEventRecords, upsertRivalHubEvents } from "./events";
import type { StudioDemoEntry } from "./library";
import type { RivalHubEventsResponse } from "./rivalhub-contract";
import { listSeriesRecords } from "./series";

function entry(id: string, mapName: string): StudioDemoEntry {
  return {
    id,
    fileName: `${mapName}.zip`,
    importedAt: 1,
    demoSha256: null,
    tags: [],
    sourceDemPath: null,
    meta: {
      mapName,
      durationSeconds: 1,
      teamAName: "Spirit",
      teamBName: "Falcons",
      teamAScore: 13,
      teamBScore: 10,
      playerCount: 10,
      roundCount: 23,
      hasReplay: true,
      source: "test",
      serverName: null,
      matchDate: null,
    },
  };
}

describe("importEventPackage", () => {
  it("creates Event and Series records and pairs local maps", async () => {
    const result = await importEventPackage({
      version: "cs2-demo-analysis-kit/event-package-1.0",
      source: "manual",
      exportedAt: "2026-06-20T00:00:00Z",
      event: { slug: "test-event", name: "Test Event", kind: "major", stages: [{ key: "final", name: "决赛", type: "single_elim", teamCount: 2, advanceCount: 1 }] },
      teams: [{ key: "spirit", name: "Spirit", players: [] }, { key: "falcons", name: "Falcons", players: [] }],
      series: [{
        key: "s1", stage: "final", round: 1, format: "bo3", teamAKey: "spirit", teamBKey: "falcons",
        maps: [{ order: 1, mapName: "de_ancient" }, { order: 2, mapName: "de_dust2" }],
      }],
    }, [entry("a", "de_ancient")]);

    expect(result.event.id).toBe("event:test-event");
    expect(result.series[0]).toMatchObject({ eventId: "event:test-event", entryIds: ["a"] });
    expect(result.matchedMaps).toBe(1);
    expect(result.missingMaps).toBe(1);
  });

  it("按 sha256 全局匹配，不被 demo 与包的队名拼写差异（Team Liquid vs Liquid）挡住", async () => {
    // demo 内嵌队名是 "Team Liquid"，包内队名是 "Liquid"：sameTeams 不相等，但 sha256 一致应命中。
    const demo = entry("hash-xyz", "de_nuke");
    demo.meta.teamAName = "Team Liquid";
    demo.meta.teamBName = "BIG";
    const result = await importEventPackage({
      version: "cs2-demo-analysis-kit/event-package-1.0",
      source: "manual",
      exportedAt: "2026-06-20T00:00:00Z",
      event: { slug: "ev2", name: "Ev2", kind: "major", stages: [{ key: "s", name: "瑞士轮", type: "swiss", teamCount: 16, advanceCount: 8 }] },
      teams: [{ key: "liquid", name: "Liquid", players: [] }, { key: "big", name: "BIG", players: [] }],
      series: [{
        key: "s1", stage: "s", round: 1, format: "bo1", teamAKey: "liquid", teamBKey: "big",
        maps: [{ order: 1, mapName: "de_nuke", demoHint: { fileName: "x.zip", sha256: "hash-xyz" } }],
      }],
    }, [demo]);

    expect(result.matchedMaps).toBe(1);
    expect(result.missingMaps).toBe(0);
    expect(result.series[0]?.entryIds).toEqual(["hash-xyz"]);
  });

  it("keeps refresh-time local association separate from the remote sync status", async () => {
    const seasonId = "00000000-0000-4000-0000-000000000001";
    const eventId = "00000000-0000-4000-0000-000000000002";
    const seriesId = "00000000-0000-4000-0000-000000000003";
    const mapId = "00000000-0000-4000-0000-000000000004";
    const matchId = "00000000-0000-4000-0000-000000000005";
    const entryAId = "00000000-0000-4000-0000-000000000006";
    const entryBId = "00000000-0000-4000-0000-000000000007";
    const teamAId = "00000000-0000-4000-0000-000000000008";
    const teamBId = "00000000-0000-4000-0000-000000000009";
    const response = {
      contractVersion: "rivalhub-dak-events/1",
      generatedAt: "2026-09-14T00:00:00.000Z",
      events: [{
        id: eventId,
        seasonId,
        slug: "auto-link-test",
        name: "Auto link test",
        kind: "league",
        revision: "revision-1",
        stages: [],
        teams: [],
        series: [{
          id: seriesId,
          key: "series-1",
          stageKey: "stage-1",
          round: 1,
          entryRound: null,
          bracketNodeId: null,
          status: "finished",
          format: "bo1",
          entryAId,
          entryBId,
          teamAKey: teamAId,
          teamBKey: teamBId,
          teamAName: "Spirit",
          teamBName: "Falcons",
          scoreA: 13,
          scoreB: 10,
          scheduledAt: "2026-09-13T00:00:00.000Z",
          completedAt: "2026-09-13T00:00:00.000Z",
          teamARecordBefore: null,
          teamBRecordBefore: null,
          veto: null,
          maps: [{
            id: mapId,
            order: 1,
            mapName: "de_ancient",
            scoreA: 13,
            scoreB: 10,
            completedAt: "2026-09-13T00:00:00.000Z",
            evidenceRevision: "revision-1",
            target: {
              seasonId,
              stageKey: "stage-1",
              stageRunId: null,
              matchId,
              matchMapId: mapId,
              mapOrder: 1,
              entryAId,
              entryBId,
              expectedMapName: "de_ancient",
              evidenceRevision: "revision-1",
            },
            lineup: [],
            demoStatus: "finished_pending_demo",
            demoIssues: [],
            importId: null,
            demoSha256: null,
          }],
        }],
      }],
    } as unknown as RivalHubEventsResponse;

    await upsertRivalHubEvents(response, [entry("local-auto-link", "de_ancient")]);
    const savedSeries = (await listSeriesRecords()).find((record) => record.id === `event:rivalhub:${seasonId}:series:${seriesId}`);
    expect(savedSeries?.mapAssignments?.[0]).toMatchObject({
      entryId: "local-auto-link",
      rivalHub: { id: mapId, demoStatus: "finished_pending_demo" },
    });
    expect(savedSeries?.mapAssignments?.[0]?.rivalHub?.demoStatus).not.toBe("synced");

    const savedEvent = (await listEventRecords()).find((event) => event.id === `event:rivalhub:${seasonId}`);
    if (savedEvent) await deleteEventRecord(savedEvent);
  });
});
