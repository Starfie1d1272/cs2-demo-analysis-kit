import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { PrepItem } from "./playlist";
import { createPrepItemsStore } from "./series";
import { createIdbAdapter } from "./storage/idb-adapter";

const legacyItem: PrepItem = {
  id: "prep:legacy", group: "Mirage A", matchId: "match-1", mapName: "de_mirage", roundNumber: 8, note: "慢两秒", addedAt: 10,
};

describe("PrepItemsStore", () => {
  it("首次读取搬迁旧 playlist 后删除旧记录，之后只由 prep-items 持有", async () => {
    const adapter = createIdbAdapter();
    const legacy = adapter.records("legacy-playlist-test");
    const current = adapter.records("prep-items-test");
    await legacy.put(legacyItem.id, legacyItem);
    const store = createPrepItemsStore(current, legacy);

    await expect(store.list()).resolves.toMatchObject([{ id: "prep:legacy", source: "tactical-pattern" }]);
    await expect(legacy.getAll()).resolves.toEqual([]);
    await expect(current.getAll()).resolves.toMatchObject([{ id: "prep:legacy" }]);

    await store.save({ ...legacyItem, id: "prep:user", source: "user" });
    await expect(store.list()).resolves.toHaveLength(2);
    await store.remove("prep:legacy");
    await expect(store.list()).resolves.toMatchObject([{ id: "prep:user", source: "user" }]);
  });
});
