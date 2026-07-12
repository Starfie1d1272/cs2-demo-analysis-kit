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

  it("已有新记录时仍会逐条搬迁并删除残留旧记录", async () => {
    const adapter = createIdbAdapter();
    const current = adapter.records("prep-items-partial-test");
    const legacy = adapter.records("legacy-playlist-partial-test");
    await current.put("existing", { ...legacyItem, id: "existing" });
    await legacy.put(legacyItem.id, legacyItem);

    const items = await createPrepItemsStore(current, legacy).list();

    expect(items.map((item) => item.id).sort()).toEqual(["existing", legacyItem.id].sort());
    expect(await legacy.getAll()).toEqual([]);
  });
});
