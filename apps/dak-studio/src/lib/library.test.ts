import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getFactsStore } from "./facts-store";
import { importDemoFile, isFactsStale, listDemoEntries, matchIdForEntry, rebuildFactsFromZip } from "./library";
import { ANALYSIS_MANIFEST, isAnalysisStale } from "./analysis-manifest";

const samplePath = fileURLToPath(
  new URL("../../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url)
);
const sampleBytes = readFile(samplePath);
const sampleName = "sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip";

async function sampleFile(): Promise<File> {
  return new File([await sampleBytes], sampleName, { type: "application/zip" });
}

describe("importDemoFile", () => {
  it("rebuilds facts when re-importing an existing demo", async () => {
    const first = await importDemoFile(await sampleFile(), { tags: ["initial"] });
    const matchId = matchIdForEntry(first.entry);
    const factsStore = getFactsStore();
    await factsStore.deleteMatchFacts(matchId);

    const duplicate = await importDemoFile(await sampleFile(), { tags: ["reimport"] });

    expect(duplicate.duplicate).toBe(true);
    expect(await factsStore.getRrSignalRows({ matchIds: [matchId] })).not.toHaveLength(0);
    expect(await factsStore.getPlayerPositionRounds({ matchIds: [matchId] })).not.toHaveLength(0);
    expect(await factsStore.getTeamShapeRounds({ matchIds: [matchId] })).not.toHaveLength(0);
    expect(await factsStore.getTacticalRounds({ matchIds: [matchId] })).not.toHaveLength(0);
  });

  it("stamps current AnalysisManifest version on import", async () => {
    const result = await importDemoFile(await sampleFile(), { tags: ["versioned"] });
    expect(result.entry.builtWith?.factsRevision).toBe(ANALYSIS_MANIFEST.factsRevision);
    expect(result.entry.builtWith?.formatVersion).toBe(ANALYSIS_MANIFEST.formatVersion);
    expect(isFactsStale(result.entry)).toBe(false);
  });
});

describe("isAnalysisStale", () => {
  it("treats missing builtWith (historic entries) as stale", () => {
    expect(isAnalysisStale(undefined)).toBe(true);
    expect(isAnalysisStale(null)).toBe(true);
  });

  it("flags entries built with an older factsRevision", () => {
    expect(isAnalysisStale({ factsRevision: "stale", formatVersion: "x" })).toBe(true);
    expect(isAnalysisStale({ factsRevision: ANALYSIS_MANIFEST.factsRevision, formatVersion: "x" })).toBe(false);
  });
});

describe("rebuildFactsFromZip", () => {
  it("re-extracts facts from the stored ZIP and refreshes builtWith, keeping the same id", async () => {
    const first = await importDemoFile(await sampleFile(), { tags: ["initial"] });
    const id = first.entry.id;
    const matchId = matchIdForEntry(first.entry);
    const factsStore = getFactsStore();
    await factsStore.deleteMatchFacts(matchId);

    const rebuilt = await rebuildFactsFromZip(id);

    expect(rebuilt?.id).toBe(id);
    expect(rebuilt?.builtWith?.factsRevision).toBe(ANALYSIS_MANIFEST.factsRevision);
    expect(await factsStore.getRrSignalRows({ matchIds: [matchId] })).not.toHaveLength(0);
    // entry 仍在库中且非 stale
    const entries = await listDemoEntries();
    expect(entries.find((e) => e.id === id)?.builtWith?.factsRevision).toBe(ANALYSIS_MANIFEST.factsRevision);
  });

  it("returns null for an unknown id", async () => {
    expect(await rebuildFactsFromZip("does-not-exist")).toBeNull();
  });
});
