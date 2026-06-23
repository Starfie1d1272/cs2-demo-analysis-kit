import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getFactsStore } from "./facts";
import { importDemoFile, isFactsStale, listDemoEntries, matchIdForEntry, rebuildFactsFromZip } from "./library";
import { ANALYSIS_MANIFEST, isAnalysisStale } from "./analysis-manifest";

async function sampleFile(): Promise<File> {
  const path = fileURLToPath(
    new URL("../../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url)
  );
  const bytes = await readFile(path);
  return new File([bytes], "sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", {
    type: "application/zip"
  });
}

describe("importDemoFile", () => {
  it("rebuilds facts when re-importing an existing demo", async () => {
    const first = await importDemoFile(await sampleFile(), { tags: ["initial"] });
    const matchId = matchIdForEntry(first.entry);
    const factsStore = getFactsStore();
    await factsStore.deleteMatchFacts(matchId);

    const duplicate = await importDemoFile(await sampleFile(), { tags: ["reimport"] });

    expect(duplicate.duplicate).toBe(true);
    expect(await factsStore.getCohortRows({ matchIds: [matchId] })).not.toHaveLength(0);
    expect(await factsStore.getTacticalRounds({ matchIds: [matchId] })).not.toHaveLength(0);
  });

  it("stamps current AnalysisManifest version on import", async () => {
    const result = await importDemoFile(await sampleFile(), { tags: ["versioned"] });
    expect(result.entry.builtWith?.analysisVersion).toBe(ANALYSIS_MANIFEST.analysisVersion);
    expect(result.entry.builtWith?.formatVersion).toBe(ANALYSIS_MANIFEST.formatVersion);
    expect(isFactsStale(result.entry)).toBe(false);
  });
});

describe("isAnalysisStale", () => {
  it("treats missing builtWith (historic entries) as stale", () => {
    expect(isAnalysisStale(undefined)).toBe(true);
    expect(isAnalysisStale(null)).toBe(true);
  });

  it("flags entries built with an older analysisVersion", () => {
    expect(isAnalysisStale({ analysisVersion: ANALYSIS_MANIFEST.analysisVersion - 1, formatVersion: "x" })).toBe(true);
    expect(isAnalysisStale({ analysisVersion: ANALYSIS_MANIFEST.analysisVersion, formatVersion: "x" })).toBe(false);
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
    expect(rebuilt?.builtWith?.analysisVersion).toBe(ANALYSIS_MANIFEST.analysisVersion);
    expect(await factsStore.getCohortRows({ matchIds: [matchId] })).not.toHaveLength(0);
    // entry 仍在库中且非 stale
    const entries = await listDemoEntries();
    expect(entries.find((e) => e.id === id)?.builtWith?.analysisVersion).toBe(ANALYSIS_MANIFEST.analysisVersion);
  });

  it("returns null for an unknown id", async () => {
    expect(await rebuildFactsFromZip("does-not-exist")).toBeNull();
  });
});
