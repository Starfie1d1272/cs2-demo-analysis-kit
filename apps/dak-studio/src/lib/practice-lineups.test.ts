import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { LineupCluster } from "@cs2dak/maps";
import { createPracticeLineupStore } from "./practice-lineups";
import { createIdbAdapter } from "./storage/idb-adapter";

const cluster: LineupCluster = {
  id: "smoke-a", mapName: "de_mirage", mode: "strict", grenade: "smoke", throwPosition: { x: 1, y: 2, z: 3 }, effectPosition: { x: 4, y: 5, z: 6 }, count: 3, roundNumbers: [5], throwerIndices: [0], throws: [{ entryId: "m1", roundNumber: 5, tick: 120 }], winRatePercent: null, entryIds: ["m1"], demoCount: 1, throwTimeBucket: null, throwerPlaceName: "Top Mid", effectCallout: "Window", effectCalloutConfidence: null, effectCalloutSamples: null, side: "t",
};

describe("PracticeLineupStore", () => {
  it("persists only user-saved lineup snapshots outside facts namespaces", async () => {
    const adapter = createIdbAdapter();
    const store = createPracticeLineupStore(adapter.records("practice-lineups-test"));
    await store.save(cluster, "setpos 1 2 3");
    await adapter.records("facts-test").put("m1", { rebuildable: true });
    await adapter.records("facts-test").deleteByPrefix("m1");
    expect(await store.list()).toMatchObject([{ mapName: "de_mirage", evidence: { roundNumber: 5 } }]);
  });
});
