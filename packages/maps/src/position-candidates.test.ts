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
});
