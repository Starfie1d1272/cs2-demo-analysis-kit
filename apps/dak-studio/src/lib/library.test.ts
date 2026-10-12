import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getFactsStore } from "./facts-store";
import { importDemoFile, isFactsStale, listDemoEntries, matchIdForEntry, rebuildFactsFromZip, removeDemo, updateDemoSourcePath, updateDemoTags } from "./library";
import { ANALYSIS_MANIFEST } from "./analysis-manifest";

const samplePath = fileURLToPath(
  new URL("../../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url)
);
const sampleBytes = readFile(samplePath);
const sampleName = "sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip";

async function sampleFile(): Promise<File> {
  return new File([await sampleBytes], sampleName, { type: "application/zip" });
}

describe("Demo import / rebuild lifecycle", () => {
  it("preserves metadata, manifest and fact identity through reimport, rebuild and deletion", async () => {
    const first = await importDemoFile(await sampleFile(), {
      tags: ["initial"], sourceDemPath: "/demos/source.dem", matchDate: "2026-09-01"
    });
    const id = first.entry.id;
    const matchId = matchIdForEntry(first.entry);
    const factsStore = getFactsStore();
    try {
      expect(first.entry.builtWith?.factsRevision).toBe(ANALYSIS_MANIFEST.factsRevision);
      expect(first.entry.builtWith?.formatVersion).toBe(ANALYSIS_MANIFEST.formatVersion);
      expect(isFactsStale(first.entry)).toBe(false);

      await updateDemoTags(id, ["edited"]);
      await updateDemoSourcePath(id, "/demos/edited.dem");
      const duplicate = await importDemoFile(await sampleFile(), { tags: ["incoming"] });
      expect(duplicate.duplicate).toBe(true);
      expect(duplicate.entry.id).toBe(id);
      expect(duplicate.entry.tags).toEqual(expect.arrayContaining(["edited", "incoming"]));
      expect(duplicate.entry.sourceDemPath).toBe("/demos/edited.dem");

      await factsStore.deleteMatchFacts(matchId);
      const reimported = await importDemoFile(await sampleFile(), { tags: ["reimport"] });
      expect(reimported.duplicate).toBe(true);
      expect(reimported.entry.id).toBe(id);
      expect(reimported.entry.sourceDemPath).toBe("/demos/edited.dem");
      expect(reimported.entry.meta.matchDate).toBe("2026-09-01");
      expect(await factsStore.getRrSignalRows({ matchIds: [matchId] })).not.toHaveLength(0);
      expect(await factsStore.getPlayerPositionRounds({ matchIds: [matchId] })).not.toHaveLength(0);
      expect(await factsStore.getTeamShapeRounds({ matchIds: [matchId] })).not.toHaveLength(0);
      expect(await factsStore.getCtRotationRounds({ matchIds: [matchId] })).not.toHaveLength(0);
      expect(await factsStore.getTacticalRounds({ matchIds: [matchId] })).not.toHaveLength(0);

      await factsStore.deleteMatchFacts(matchId);
      const rebuilt = await rebuildFactsFromZip(id);
      expect(rebuilt?.id).toBe(id);
      expect(rebuilt?.builtWith?.factsRevision).toBe(ANALYSIS_MANIFEST.factsRevision);
      expect(await factsStore.getRrSignalRows({ matchIds: [matchId] })).not.toHaveLength(0);
      expect(await factsStore.getCtRotationRounds({ matchIds: [matchId] })).not.toHaveLength(0);
      expect((await listDemoEntries()).find(entry => entry.id === id)?.builtWith?.factsRevision)
        .toBe(ANALYSIS_MANIFEST.factsRevision);

      await removeDemo(id);
      const afterDelete = await importDemoFile(await sampleFile());
      expect(afterDelete.duplicate).toBe(false);
      await removeDemo(afterDelete.entry.id);
    } finally {
      await removeDemo(id);
    }
  });
});
