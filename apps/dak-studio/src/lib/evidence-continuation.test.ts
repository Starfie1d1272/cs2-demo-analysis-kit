import { describe, expect, it } from "vitest";
import { createAnalysisContextPreset } from "./analysis-context.js";
import { createEvidenceContinuation } from "./evidence-continuation.js";

describe("EvidenceContinuation", () => {
  it("keeps the source analysis context and reason in runtime-only navigation state", () => {
    const context = createAnalysisContextPreset("team-analysis", {
      focus: { kind: "team", teamName: "FURIA" },
      corpus: { eventIds: ["event:cologne"], entryIds: [], matchIds: [], maps: [], tags: [], excludedEntryIds: [] },
    });
    const continuation = createEvidenceContinuation({
      sourceView: "utility",
      context,
      sourceKey: "utility:m1:12",
      evidence: { matchId: "m1", roundNumber: 12, tick: 128, reason: "HE 手雷伤害事件位于当前样本前列", role: "example" },
      finding: { key: "utility:he:m1", title: "HE 手雷伤害证据", statement: "FalleN 在 R12 造成 86 点伤害。" },
    });

    expect(continuation).toMatchObject({
      sourceView: "utility",
      context: { focus: { kind: "team", teamName: "FURIA" } },
      evidence: { matchId: "m1", roundNumber: 12, reason: "HE 手雷伤害事件位于当前样本前列" },
      finding: { title: "HE 手雷伤害证据" },
    });
    expect(continuation.context).not.toBe(context);
  });
});
