import { describe, expect, it } from "vitest";
import { generateMapPositionCandidates, materializeReviewedPositionAsset } from "./position-candidates.js";

const rows = [1, 2].map((roundNumber) => ({ matchId: "m1", mapName: "de_inferno", roundNumber, teamKey: "teamA", side: "t" as const, playerIndex: 0, steamId64: "p1", openingEligibleSeconds: 20, openingPositionGroupDwell: [{ positionGroupId: "banana", seconds: 16, share: 0.8 }], openingPath: [{ tick: 100, callout: "Banana", positionGroupId: "banana", x: 1, y: 2, z: 3 }] }));

describe("map position candidates", () => {
  it("generates deterministic candidates and materializes reviewed assets with provenance", () => {
    const first = generateMapPositionCandidates(rows); const second = generateMapPositionCandidates([...rows].reverse());
    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({ proposedId: "banana", proposedDisplayName: "香蕉道", sampleCount: 2 });
    const asset = materializeReviewedPositionAsset(first, [{ candidateId: first[0]!.id, action: "rename", displayName: "香蕉道默认" }], { mapName: "de_inferno", side: "t", reviewedAt: "2026-07-14T00:00:00.000Z", reviewer: "test" });
    expect(asset.groups[0]).toMatchObject({ id: "banana", name: "香蕉道默认", callouts: ["Banana"] });
    expect(asset.provenance.decisions).toHaveLength(1);
  });

  it("keeps unresolved candidates unresolved without guessing a name", () => {
    const candidates = generateMapPositionCandidates([{ ...rows[0]!, openingPositionGroupDwell: [], openingPath: [] }]);
    expect(candidates[0]).toMatchObject({ type: "unresolved", proposedDisplayName: "未命名候选" });
    expect(materializeReviewedPositionAsset(candidates, [], { mapName: "de_inferno", side: "t", reviewedAt: "2026-07-14T00:00:00.000Z", reviewer: "test" }).unresolvedCandidateIds).toEqual([candidates[0]!.id]);
  });

  it("separates deterministic unknown spatial clusters and classifies transit paths without naming them", () => {
    const unknown = [
      { ...rows[0]!, roundNumber: 1, openingPositionGroupDwell: [], openingPath: [{ tick: 100, callout: null, positionGroupId: null, x: 0, y: 0, z: 0 }, { tick: 200, callout: null, positionGroupId: null, x: 50, y: 40, z: 0 }] },
      { ...rows[0]!, roundNumber: 2, openingPositionGroupDwell: [], openingPath: [{ tick: 100, callout: null, positionGroupId: null, x: 10, y: 10, z: 0 }, { tick: 200, callout: null, positionGroupId: null, x: 60, y: 50, z: 0 }] },
      { ...rows[0]!, roundNumber: 3, openingPositionGroupDwell: [], openingPath: [{ tick: 100, callout: null, positionGroupId: null, x: 1600, y: 0, z: 0 }, { tick: 200, callout: null, positionGroupId: null, x: 1660, y: 20, z: 0 }] },
      { ...rows[0]!, roundNumber: 4, openingPositionGroupDwell: [], openingPath: [{ tick: 100, callout: "A", positionGroupId: null, x: 0, y: 0, z: 0 }, { tick: 200, callout: "B", positionGroupId: null, x: 1200, y: 0, z: 0 }] },
    ];
    const candidates = generateMapPositionCandidates(unknown);
    expect(candidates.filter((candidate) => candidate.type === "stable_spatial_position")).toHaveLength(1);
    expect(candidates.some((candidate) => candidate.type === "transit")).toBe(true);
    expect(new Set(candidates.map((candidate) => candidate.proposedId)).size).toBe(candidates.length);
    expect(candidates.every((candidate) => candidate.proposedDisplayName === "未命名候选")).toBe(true);
  });

  it("keeps semantic candidate ids stable when unrelated candidates are added", () => {
    const base = generateMapPositionCandidates(rows);
    const extended = generateMapPositionCandidates([...rows, { ...rows[0]!, playerIndex: 9, steamId64: "p9", openingPositionGroupDwell: [{ positionGroupId: "alt", seconds: 16, share: 0.8 }], openingPath: [{ tick: 100, callout: "Alt", positionGroupId: "alt", x: 900, y: 2, z: 3 }] }]);
    expect(extended.find((candidate) => candidate.proposedId === "banana")?.id).toBe(base.find((candidate) => candidate.proposedId === "banana")?.id);
  });

  it("materializes a reviewer-specified split as independently reviewable children", () => {
    const input = [
      { ...rows[0]!, roundNumber: 1 },
      { ...rows[0]!, roundNumber: 2 },
      { ...rows[0]!, roundNumber: 3 },
    ];
    const candidate = generateMapPositionCandidates(input)[0]!;
    const groups = candidate.representativeEvidence.map((evidence, index) => ({ id: index === 0 ? "left" : "right", evidence: [evidence] }));
    const asset = materializeReviewedPositionAsset([candidate], [{ candidateId: candidate.id, action: "split", splitGroups: [groups[0]!, { id: "right", evidence: groups.slice(1).flatMap((group) => group.evidence) }] }], { mapName: "de_inferno", side: "t", reviewedAt: "2026-07-14T00:00:00.000Z", reviewer: "test" });
    expect(asset.splitCandidates).toHaveLength(2);
    expect(asset.splitCandidates.every((child) => child.parentCandidateId === candidate.id)).toBe(true);
    expect(asset.unresolvedCandidateIds).toEqual(asset.splitCandidates.map((child) => child.id).sort());
    expect(() => materializeReviewedPositionAsset([candidate], [{ candidateId: candidate.id, action: "split" }], { mapName: "de_inferno", side: "t", reviewedAt: "2026-07-14T00:00:00.000Z", reviewer: "test" })).toThrow("至少需要两个");
  });

  it("surfaces legacy review ids that no longer match stable candidates", () => {
    const candidate = generateMapPositionCandidates(rows)[0]!;
    const asset = materializeReviewedPositionAsset([candidate], [{ candidateId: "de_inferno:t:001", action: "rename", displayName: "旧编号" }], { mapName: "de_inferno", side: "t", reviewedAt: "2026-07-14T00:00:00.000Z", reviewer: "test" });
    expect(asset.unmatchedDecisionIds).toEqual(["de_inferno:t:001"]);
  });
});
