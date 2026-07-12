import { describe, expect, it } from "vitest";
import {
  createAnalysisContext,
  createAnalysisContextPreset,
  applyCohortScopeProjection,
  cohortScopeProjection,
  filterCorpusEntriesByTeam,
  missingAnalysisCoordinates,
  resolveAnalysisCorpus,
  summarizeAnalysisContext,
  summarizeAnalysisContextParts,
} from "./analysis-context.js";
import type { StudioDemoEntry } from "./library.js";

function entry(id: string, fileName: string, teamAName: string, teamBName: string, mapName: string, tags: string[] = []): StudioDemoEntry {
  return {
    id,
    fileName,
    importedAt: 0,
    tags,
    meta: { teamAName, teamBName, teamAScore: 13, teamBScore: 8, mapName, serverName: null, matchDate: null },
  } as StudioDemoEntry;
}

const entries = [
  entry("e1", "2026-07-01_de_inferno_FURIA-vs-Spirit.zip", "FURIA", "Spirit", "de_inferno", ["Cologne"]),
  entry("e2", "2026-07-03_de_nuke_FURIA-vs-NAVI.zip", "FURIA", "NAVI", "de_nuke", ["Cologne"]),
  entry("e3", "2026-06-18_de_mirage_G2-vs-Vitality.zip", "G2", "Vitality", "de_mirage", ["BLAST"]),
];

const events = [{ id: "event:cologne", name: "Cologne", entryIds: ["e1", "e2"] }];

describe("AnalysisContext", () => {
  it("creates direct-entry presets without inventing a focus or role", () => {
    const context = createAnalysisContextPreset("team-analysis");

    expect(context).toMatchObject({
      goal: "team-analysis",
      focus: { kind: "aggregate" },
      roles: {},
      baseline: { kind: "corpus" },
    });
    expect(missingAnalysisCoordinates(context, "team")).toEqual(["分析队伍"]);
  });

  it("keeps a Team focus separate from explicitly filtering its matches", () => {
    const context = createAnalysisContext({
      goal: "team-analysis",
      corpus: { eventIds: [], entryIds: [], matchIds: [], maps: [], tags: [], excludedEntryIds: [] },
      focus: { kind: "team", teamName: "FURIA" },
      roles: {},
      baseline: { kind: "corpus" },
    });

    expect(resolveAnalysisCorpus(entries, context.corpus, events).map((item) => item.id)).toEqual(["e1", "e2", "e3"]);
    expect(filterCorpusEntriesByTeam(entries, "FURIA").map((item) => item.id)).toEqual(["e1", "e2"]);
  });

  it("preserves an explicit corpus when an object entry creates its Team preset", () => {
    const context = createAnalysisContextPreset("team-analysis", {
      corpus: { eventIds: ["event:cologne"], entryIds: [], matchIds: [], maps: [], tags: [], excludedEntryIds: [] },
      focus: { kind: "team", teamName: "FURIA" },
    });

    expect(context.focus).toEqual({ kind: "team", teamName: "FURIA" });
    expect(resolveAnalysisCorpus(entries, context.corpus, events).map((entry) => entry.id)).toEqual(["e1", "e2"]);
  });

  it("projects legacy scope controls from, and only back into, the AnalysisContext owner", () => {
    const context = createAnalysisContextPreset("explore");
    const next = applyCohortScopeProjection(context, {
      eventIds: ["event:cologne"], maps: ["de_inferno"], tags: [], excludedIds: ["e3"], teams: ["FURIA"],
    });

    expect(next).toMatchObject({
      goal: "team-analysis",
      focus: { kind: "team", teamName: "FURIA" },
      corpus: { eventIds: ["event:cologne"], maps: ["de_inferno"], excludedEntryIds: ["e3"] },
    });
    expect(cohortScopeProjection(next)).toMatchObject({ teams: ["FURIA"], eventIds: ["event:cologne"] });
  });

  it("resolves Event corpus together with maps, tags and manual exclusions", () => {
    const context = createAnalysisContext({
      goal: "event-analysis",
      corpus: { eventIds: ["event:cologne"], entryIds: [], matchIds: [], maps: ["de_nuke"], tags: ["Cologne"], excludedEntryIds: [] },
      focus: { kind: "event", eventId: "event:cologne", label: "Cologne" },
      roles: {},
      baseline: { kind: "event-peers", eventId: "event:cologne" },
    });

    expect(resolveAnalysisCorpus(entries, context.corpus, events).map((item) => item.id)).toEqual(["e2"]);
    expect(summarizeAnalysisContext(context, entries, events)).toBe("Cologne · Cologne · 赛事整体 · 赛事分析");
  });

  it("requires an explicit beneficiary and opponent only for opponent preparation", () => {
    const context = createAnalysisContext({
      goal: "opponent-prep",
      focus: { kind: "team", teamName: "Spirit" },
      roles: { beneficiary: { kind: "team", id: "furia", label: "FURIA" } },
      baseline: { kind: "descriptive" },
    });

    expect(missingAnalysisCoordinates(context, "coach")).toEqual(["对手"]);
    expect(missingAnalysisCoordinates({ ...context, roles: { ...context.roles, opponent: { kind: "team", id: "spirit", label: "Spirit" } } }, "coach")).toEqual([]);
  });

  it("keeps corpus, focus, roles and baseline as separately readable context fields", () => {
    const context = createAnalysisContext({
      goal: "opponent-prep",
      corpus: { eventIds: ["event:cologne"], entryIds: [], matchIds: [], maps: [], tags: [], excludedEntryIds: [] },
      focus: { kind: "team", teamName: "Spirit" },
      roles: {
        beneficiary: { kind: "team", id: "furia", label: "FURIA" },
        opponent: { kind: "team", id: "spirit", label: "Spirit" },
      },
      baseline: { kind: "event-peers", eventId: "event:cologne" },
    });

    expect(summarizeAnalysisContextParts(context, entries, events)).toEqual({
      corpus: "Cologne", focus: "Spirit", roles: "我方：FURIA · 对手：Spirit", baseline: "赛事整体", goal: "对手备战",
    });
  });
});
