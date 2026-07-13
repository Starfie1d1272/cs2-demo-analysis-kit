import { describe, expect, it } from "vitest";
import type { PlayerMapRoleEvidence, TeamMapResponsibilityEvidence } from "@cs2dak/contract";
import { buildPlayerMapRoleProfiles, buildTeamMapRoleMatrices } from "./index.js";

function evidence(playerKey: string, overrides: Partial<PlayerMapRoleEvidence> = {}): PlayerMapRoleEvidence {
  return {
    version: 2, playerKey, teamKey: "Team One", mapName: "de_ancient", side: "ct", status: "ready", confidence: 0.9,
    sample: { observedRounds: 16, eligibleRounds: 16, eligibleSeconds: 320, matchCount: 3, dataQuality: 1, coverage: 1 },
    positionGroups: [{ positionGroupId: "a_anchor", seconds: 120, share: 0.7, roundCount: 7 }],
    spatial: { dominantGroupStability: 0.875, teamRelativeGroupShare: 0.3, isolationSeconds: 4, isolationShare: 0.03, rejoinCount: 0, movementSync: 0.6, openingMainComponentShare: 0.4, openingIsolatedShare: 0.4, formationShares: { "4+1": 1 } },
    responsibility: "anchor",
    awp: { duty: "primary_awper", eligibleRounds: 16, qualifiedLongGunRounds: 16, freezeOwnershipRounds: 12, activeSeconds: 160, shots: 24, kills: 10, teamActiveShare: 0.8, usageConcentration: 0.8, matchConsistency: 1 },
    representativeRounds: [{ matchId: "m1", roundNumber: 1, positionGroupId: "a_anchor" }, { matchId: "m2", roundNumber: 1 }, { matchId: "m3", roundNumber: 1 }], basis: ["facts"], limitations: ["approximation"],
    ...overrides,
  };
}

describe("map role presentation", () => {
  it("never infers IGL and retains a conflicting declaration beside AWPer inference", () => {
    const profiles = buildPlayerMapRoleProfiles([evidence("p1"), evidence("p1", { mapName: "de_mirage" })], [{ playerKey: "p1", role: "igl", priority: "primary", source: "user", provenance: "coach roster" }]);
    expect(profiles[0]).toMatchObject({ inferredPrimaryRole: "awper", headlineRole: "IGL / AWPer" });
    expect(profiles[0]?.declaredRoles).toHaveLength(1);
    expect(profiles[0]?.inferredPrimaryRole).not.toBe("igl");
  });

  it("uses inferred headline without declared IGL and never lets non-IGL declarations replace it", () => {
    const profile = buildPlayerMapRoleProfiles([evidence("p1"), evidence("p1", { mapName: "de_mirage" })], [{ playerKey: "p1", role: "anchor", priority: "primary", source: "trusted_metadata", provenance: "roster" }])[0]!;
    expect(profile.headlineRole).toBe("awper");
    expect(profile.inferredPrimaryRole).toBe("awper");
  });

  it("projects overlap and unstable coverage without a five-slot template", () => {
    const first = evidence("p1");
    const second = evidence("p2", { awp: { ...evidence("p2").awp, duty: "rifler", activeSeconds: 0, teamActiveShare: 0 }, positionGroups: [{ positionGroupId: "a_anchor", seconds: 100, share: 0.6, roundCount: 7 }] });
    const team: TeamMapResponsibilityEvidence = {
      version: 2, teamKey: "Team One", mapName: "de_ancient", side: "ct", status: "mixed", confidence: 0.7,
      players: [first, second], positionOverlap: [{ positionGroupId: "a_anchor", playerKeys: ["p1", "p2"], share: 1 }],
      responsibilityConflict: true, unstableCoverage: true, representativeRounds: first.representativeRounds, basis: ["facts"], limitations: ["no slots"],
    };
    const profiles = buildPlayerMapRoleProfiles([first, second]);
    const matrix = buildTeamMapRoleMatrices([team], profiles)[0]!;
    expect(matrix).toMatchObject({ responsibilityConflict: true, unstableCoverage: true });
    expect(matrix.players).toHaveLength(2);
  });
});
