import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getFactsStore } from "./facts";
import { importDemoFile, matchIdForEntry } from "./library";

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
    expect(await factsStore.getMatchWorkspaces({ matchIds: [matchId] })).toHaveLength(1);
    expect(await factsStore.getCohortRows({ matchIds: [matchId] })).not.toHaveLength(0);
  });
});
