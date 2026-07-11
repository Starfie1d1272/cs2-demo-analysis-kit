import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createIdbAdapter } from "./storage/idb-adapter";
import { createTrainingFocusStore } from "./training-focus";

const finding = {
  key: "mistake:full-buy-first-death:self",
  capability: "mistake-review" as const,
  title: "优先复盘：长枪局首死",
  statement: "FalleN 在 9 个长枪局中有 3 次首死。",
  sample: { label: "长枪局", numerator: 3, denominator: 9 },
  baseline: null,
  basis: ["按回合首个死亡事件统计。"],
  limitations: ["不判断首死成因。"],
  producerVersion: "test",
  origin: "system" as const,
};

describe("TrainingFocusStore", () => {
  it("persists user-confirmed focuses separately and supports edit/delete", async () => {
    const adapter = createIdbAdapter();
    const store = createTrainingFocusStore(adapter.records("training-focus-test"));
    const created = await store.create({
      playerKey: "self",
      finding,
      evidence: [{ matchId: "m1", roundNumber: 12, reason: "长枪局首死", role: "example" }],
      contextSummary: "FalleN · 7 场 · 当前样本 · 个人复盘",
      reviewCondition: "下次 10 个长枪局后复查",
    });

    expect((await store.list("self"))[0]).toMatchObject({ id: created.id, reviewCondition: "下次 10 个长枪局后复查" });
    expect(await store.update(created.id, { note: "先复盘 R12 的交火前站位", reviewCondition: "再打 10 个长枪局" })).toMatchObject({ note: "先复盘 R12 的交火前站位" });
    await adapter.records("facts-test").put("m1", { derived: true });
    await adapter.records("facts-test").deleteByPrefix("m1");
    expect(await store.list("self")).toHaveLength(1);
    await store.remove(created.id);
    expect(await store.list("self")).toEqual([]);
  });
});
