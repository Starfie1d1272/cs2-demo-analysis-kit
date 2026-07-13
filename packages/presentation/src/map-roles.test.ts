import { describe, expect, it } from "vitest";
import type { PlayerMapRoleEvidence, TeamMapResponsibilityEvidence } from "@cs2dak/contract";
import { buildPlayerMapRoleProfiles, buildTeamMapRoleMatrices } from "./index.js";

function evidence(playerKey: string, overrides: Partial<PlayerMapRoleEvidence> = {}): PlayerMapRoleEvidence {
  return {
    version: 3, playerKey, teamKey: "Team One", mapName: "de_ancient", side: "ct", status: "ready", confidence: 0.9,
    sample: { observedRounds: 16, eligibleRounds: 16, eligibleSeconds: 320, matchCount: 3, dataQuality: 1, coverage: 1 },
    matchIds: ["m1", "m2", "m3"],
    positionGroups: [{ positionGroupId: "a_anchor", seconds: 120, share: 0.7, roundCount: 7 }],
    spatial: { dominantGroupStability: 0.875, teamRelativeGroupShare: 0.3, isolationSeconds: 4, isolationShare: 0.03, rejoinCount: 0, movementSync: 0.6, openingMainComponentShare: 0.4, openingIsolatedShare: 0.4, formationShares: { "4+1": 1 } },
    support: { utilityUses: 0, openingUtilityUses: 0, utilityUsePerRound: 0, openingUtilityUsePerRound: 0 },
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
      version: 3, teamKey: "Team One", mapName: "de_ancient", side: "ct", status: "mixed", confidence: 0.7,
      players: [first, second], positionOverlap: [{ positionGroupId: "a_anchor", playerKeys: ["p1", "p2"], share: 1 }],
      responsibilityConflict: true, unstableCoverage: true, representativeRounds: first.representativeRounds, basis: ["facts"], limitations: ["no slots"],
    };
    const profiles = buildPlayerMapRoleProfiles([first, second]);
    const matrix = buildTeamMapRoleMatrices([team], profiles)[0]!;
    expect(matrix).toMatchObject({ responsibilityConflict: true, unstableCoverage: true });
    expect(matrix.players).toHaveLength(2);
  });

  it("returns mixed rather than ready with a null role when candidates are not separated", () => {
    const rifle = { ...evidence("p1").awp, duty: "rifler" as const, qualifiedLongGunRounds: 20, freezeOwnershipRounds: 0, activeSeconds: 0, teamActiveShare: 0, matchConsistency: 0 };
    const profile = buildPlayerMapRoleProfiles([
      evidence("p1", { side: "ct", responsibility: "anchor", awp: rifle }),
      evidence("p1", { side: "t", mapName: "de_mirage", responsibility: "core_pack", awp: rifle }),
    ])[0]!;
    expect(profile.status).toBe("mixed");
    expect(profile.inferredPrimaryRole).toBeNull();
    expect(profile.runnerUpRole).not.toBeNull();
  });

  it("does not promote one-map AWP usage to global Primary AWPer", () => {
    const profile = buildPlayerMapRoleProfiles([evidence("p1")])[0]!;
    expect(profile.weaponDuty).toBe("secondary_awper");
    expect(profile.weaponDuty).not.toBe("primary_awper");
  });

  it("uses complete match coverage rather than the capped representative evidence sample for global AWP duty", () => {
    const first = evidence("p1", { representativeRounds: [{ matchId: "m1", roundNumber: 1 }] });
    const second = evidence("p1", { mapName: "de_mirage", representativeRounds: [{ matchId: "m1", roundNumber: 2 }] });
    expect(buildPlayerMapRoleProfiles([first, second])[0]?.weaponDuty).toBe("primary_awper");
  });

  it("matches declaration time scope by match occurrence time and preserves missing-time limitations", () => {
    const declaration = { playerKey: "p1", role: "anchor", priority: "primary", source: "self_report", provenance: "public interview", validFrom: "2026-06-01T00:00:00.000Z", validTo: "2026-06-30T23:59:59.000Z" } as const;
    expect(buildPlayerMapRoleProfiles([evidence("p1")], [declaration], { matchTimes: { m1: "2026-05-01T00:00:00.000Z", m2: "2026-05-02T00:00:00.000Z", m3: "2026-05-03T00:00:00.000Z" } })[0]?.declaredRoles).toHaveLength(0);
    const missingTime = buildPlayerMapRoleProfiles([evidence("p1")], [declaration])[0]!;
    expect(missingTime.declaredRoles).toHaveLength(1);
    expect(missingTime.limitations).toContain("比赛时间缺失，声明时间作用域无法严格验证。");
  });

  it("matches time-scoped declarations against all covered matches, not representative rounds", () => {
    const declaration = { playerKey: "p1", role: "anchor", priority: "primary", source: "self_report", provenance: "public interview", validFrom: "2026-06-01T00:00:00.000Z", validTo: "2026-06-30T23:59:59.000Z" } as const;
    const row = evidence("p1", { matchIds: ["m1", "m4"], representativeRounds: [{ matchId: "m1", roundNumber: 1 }] });
    const profile = buildPlayerMapRoleProfiles([row], [declaration], { matchTimes: { m1: "2026-05-01T00:00:00.000Z", m4: "2026-06-15T00:00:00.000Z" } })[0]!;
    expect(profile.declaredRoles).toHaveLength(1);
  });
});
