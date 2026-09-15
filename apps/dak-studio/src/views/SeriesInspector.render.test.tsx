import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SeriesVeto } from "@cs2dak/contract";
import type { StudioDemoEntry } from "../lib/library";
import type { StudioSeriesRecord } from "../lib/series";
import type { RivalHubMatchCandidate } from "../lib/rivalhub-match";
import type { RivalHubRemoteMap } from "../lib/rivalhub-contract";
import { SeriesInspector } from "./SeriesInspector";

const entry: StudioDemoEntry = {
  id: "demo-1",
  fileName: "2026-09-13_de_ancient_A-vs-B.zip",
  importedAt: 1,
  demoSha256: "a".repeat(64),
  tags: [],
  sourceDemPath: null,
  meta: {
    mapName: "de_ancient",
    teamAName: "A",
    teamBName: "B",
    teamAScore: 13,
    teamBScore: 10,
    roundCount: 23,
    durationSeconds: 1,
    playerCount: 10,
    hasReplay: true,
    source: "test",
    serverName: null,
    matchDate: null,
  },
};

const veto = {
  version: "cs2-demo-analysis-kit/series-veto-0.1",
  seriesId: "series-1",
  format: "bo3",
  teamAName: "A",
  teamBName: "B",
  mapPool: ["de_ancient"],
  maps: { picked: [], banned: [], decider: null },
  sideChoices: [],
  steps: [{ stepOrder: 1, actionType: "ban", mapName: "de_ancient", teamKey: "teamA", side: null }],
} as SeriesVeto;

const series: StudioSeriesRecord = {
  id: "series-1",
  name: "A vs B",
  entryIds: [entry.id],
  format: "bo3",
  teamAName: "A",
  teamBName: "B",
  scoreA: 1,
  scoreB: 0,
  veto,
  mapAssignments: [
    { order: 1, mapName: "de_ancient", entryId: entry.id },
    { order: 2, mapName: "de_mirage", entryId: null },
  ],
  createdAt: 1,
  updatedAt: 1,
};

describe("SeriesInspector", () => {
  it("keeps map/demo/BP details under the selected series", () => {
    const html = renderToStaticMarkup(createElement(SeriesInspector, {
      series,
      entries: [entry],
      eventId: "event-1",
      candidates: [],
      onOpenMatch: () => undefined,
    }));

    expect(html).toContain("M1");
    expect(html).toContain("打开 Demo");
    expect(html).toContain("BP · BO3");
    expect(html).toContain("<details");
    expect(html).not.toContain("StageRun");
    expect(html).not.toContain("revision 已随刷新更新");
    expect(html).not.toContain("详细列表与 BP");
  });

  it("keeps the browser file input fallback for an online RivalHub map", () => {
    const onlineMap = {
      id: "map-1",
      order: 1,
      mapName: "de_ancient",
      scoreA: 13,
      scoreB: 10,
      completedAt: "2026-09-13T00:00:00.000Z",
      evidenceRevision: "revision-1",
      target: {
        seasonId: "00000000-0000-4000-8000-000000000001",
        stageKey: "stage",
        stageRunId: null,
        matchId: "00000000-0000-4000-8000-000000000002",
        matchMapId: "map-1",
        mapOrder: 1,
        entryAId: "00000000-0000-4000-8000-000000000004",
        entryBId: "00000000-0000-4000-8000-000000000005",
        expectedMapName: "de_ancient",
        evidenceRevision: "revision-1",
      },
      lineup: [],
      demoStatus: "finished_pending_demo",
      demoIssues: [],
      importId: null,
      demoSha256: null,
    } as RivalHubRemoteMap;
    const onlineSeries = {
      ...series,
      mapAssignments: [{ order: 1, mapName: "de_ancient", entryId: null, rivalHub: onlineMap }],
    };
    const candidate: RivalHubMatchCandidate = {
      series: { id: series.id, stageKey: "stage", teamAName: "A", teamBName: "B", completedAt: series.completedAt ?? null, status: "finished" },
      map: onlineMap,
    };
    const html = renderToStaticMarkup(createElement(SeriesInspector, {
      series: onlineSeries,
      entries: [],
      eventId: "event-1",
      candidates: [candidate],
      onOpenMatch: () => undefined,
      onImportOnlineFiles: async () => undefined,
    }));

    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".dem,.zip,application/zip"');
    expect(html).toContain("选择 Demo");
    expect(html).not.toContain("data-rivalhub-drop-zone");
  });
});
