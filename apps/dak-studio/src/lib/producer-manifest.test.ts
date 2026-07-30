import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createFactsStore } from "./facts-store";
import { createProducerManifestStore, producerStatus } from "./producer-manifest";
import { createIdbAdapter } from "./storage/idb-adapter";
import type { MatchFacts } from "./fact-types";

const emptyFacts = (matchId: string): MatchFacts => ({
  matchId,
  mapName: "de_ancient",
  playerMatchStats: [], playerWeapons: [], mechanicsSamples: [], rrSignalRows: [], lineups: [],
  tacticalRounds: [{ matchId, roundNumber: 1, side: "t" } as MatchFacts["tacticalRounds"][number]],
  playerPositionRounds: [], teamShapeRounds: [], teamAwpRounds: [], ctRotationRounds: [],
});

describe("producer generation manifest", () => {
  it("keeps candidate facts invisible until the active pointer switches", async () => {
    const adapter = createIdbAdapter();
    const facts = createFactsStore(adapter, "producer-generation-facts");
    const manifests = createProducerManifestStore(adapter, "producer-generation-facts:producer-manifests");
    const value = emptyFacts("m1");

    await facts.stageMatchFacts(value, "tactical", "candidate");
    expect(await facts.getTacticalRounds({ matchIds: ["m1"] })).toEqual([]);

    await manifests.activate("m1", "tactical", {
      generation: "candidate",
      producerRevision: "test/1",
      sourcePackageHash: "package-a",
      rowCounts: { tactical_rounds: 1 },
      storageGenerations: { facts: "candidate" },
      startedAt: 1,
    });
    expect(await facts.getTacticalRounds({ matchIds: ["m1"] })).toHaveLength(1);
  });

  it("reports a failed rebuild with a prior active snapshot as stale", async () => {
    const adapter = createIdbAdapter();
    const manifests = createProducerManifestStore(adapter, "producer-status");
    await manifests.activate("m1", "duel", {
      generation: "g1", producerRevision: "duel/1", sourcePackageHash: "package-a",
      rowCounts: {}, storageGenerations: { facts: "g1" }, startedAt: 1,
    });
    const failed = await manifests.fail("m1", "duel", "duel/2", 2, new Error("decode failed"));

    expect(producerStatus(failed, "package-a", "duel/2")).toBe("stale");
    expect(failed.active?.generation).toBe("g1");
  });
});
