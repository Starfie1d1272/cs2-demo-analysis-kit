import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createIdbAdapter } from "./idb-adapter";

/**
 * StorageAdapter 的 IndexedDB 实现以真实 IDB 行为（fake-indexeddb）验证。
 * node 单测原本跑不到浏览器 IndexedDB，而 entries() 的事务时序与 blob 字节往返
 * 正是解耦后的风险点，这里专门覆盖。各用例用独立命名空间隔离，避免跨用例串数据。
 */
describe("createIdbAdapter", () => {
  it("records: put/get/getAll/keys/entries/delete 往返", async () => {
    const store = createIdbAdapter().records("t-records");
    await store.put("a", { name: "Alpha", n: 1 });
    await store.put("b", { name: "Bravo", n: 2 });

    expect(await store.get<{ name: string }>("a")).toEqual({ name: "Alpha", n: 1 });
    expect(await store.get("missing")).toBeUndefined();

    const all = await store.getAll<{ n: number }>();
    expect(all.map((v) => v.n).sort()).toEqual([1, 2]);

    expect((await store.keys()).sort()).toEqual(["a", "b"]);

    const entries = await store.entries<{ n: number }>();
    expect(new Map(entries.map(([k, v]) => [k, v.n]))).toEqual(new Map([["a", 1], ["b", 2]]));

    await store.delete("a");
    expect(await store.get("a")).toBeUndefined();
    expect(await store.keys()).toEqual(["b"]);
  });

  it("blobs: ArrayBuffer 字节按 key 原样往返", async () => {
    const blobs = createIdbAdapter().blobs("t-blobs");
    const bytes = new Uint8Array([1, 2, 3, 4, 255, 0, 128]).buffer;
    await blobs.put("de_ancient", bytes);

    const out = await blobs.get("de_ancient");
    expect(out).toBeDefined();
    expect([...new Uint8Array(out!)]).toEqual([1, 2, 3, 4, 255, 0, 128]);

    expect(await blobs.keys()).toEqual(["de_ancient"]);
    await blobs.delete("de_ancient");
    expect(await blobs.get("de_ancient")).toBeUndefined();
  });

  it("命名空间互相隔离；record 与 blob 同名不串", async () => {
    const adapter = createIdbAdapter();
    await adapter.records("t-iso").put("x", { from: "record" });
    await adapter.blobs("t-iso").put("x", new Uint8Array([9]).buffer);

    expect(await adapter.records("t-iso").get("x")).toEqual({ from: "record" });
    expect([...new Uint8Array((await adapter.blobs("t-iso").get("x"))!)]).toEqual([9]);
    // 不同 record 命名空间互不可见
    expect(await adapter.records("t-iso-other").get("x")).toBeUndefined();
  });
});
