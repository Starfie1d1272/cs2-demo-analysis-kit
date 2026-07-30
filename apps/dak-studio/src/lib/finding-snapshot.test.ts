import { describe, expect, it } from "vitest";
import { createAnalysisContextPreset } from "./analysis-context";
import { captureFindingSnapshot } from "./finding-snapshot";

const finding = {
  key: "finding:one", capability: "mistake-review" as const, title: "首死", statement: "测试结论",
  subject: { id: "steam:1", label: "A" },
  sample: { label: "样本", numerator: 1, denominator: 2 }, baseline: null,
  basis: ["事实"], limitations: ["限制"], producerVersion: "producer/1", origin: "system" as const, evidence: [],
};

describe("FindingSnapshotV1", () => {
  it("captures immutable finding identity, source hashes, and a stable context fingerprint", async () => {
    const context = createAnalysisContextPreset("personal-review", { focus: { kind: "self", playerKey: "steam:1", label: "A" } });
    const first = await captureFindingSnapshot(finding, context, { m1: "zip-a" });
    const second = await captureFindingSnapshot(finding, context, { m1: "zip-a" });

    expect(first).toMatchObject({ snapshotVersion: "finding-snapshot/1", sourceIdentity: { findingKey: "finding:one" }, sourcePackageHashes: { m1: "zip-a" } });
    expect(first.analysisContextFingerprint).toBe(second.analysisContextFingerprint);
  });
});
