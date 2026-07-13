import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlayerMapRoleProfile, TeamMapRoleMatrix } from "@cs2dak/contract";
import { PlayerMapRoleProfilePanel, TeamMapRoleMatrixPanel } from "./MapRoles";

const profile = {
  version: "cs2-demo-analysis-kit/player-map-role-profile-2.0", playerKey: "p1", teamKeys: ["T"],
  declaredRoles: [{ playerKey: "p1", role: "igl", priority: "primary", source: "user", provenance: "user" }],
  inferredPrimaryRole: "awper", runnerUpRole: "anchor", separationMargin: 0.4,
  roleSimilarities: { awper: 0.9, anchor: 0.5, opener: 0.2, closer: 0.1 },
  headlineRole: "IGL / AWPer", status: "ready", confidence: 0.8, weaponDuty: "primary_awper",
  positionGroupDisplay: [{ mapName: "de_mirage", side: "ct", positionGroupId: "a_site", displayName: "A包", officialName: "BombsiteA", resolved: true }],
  alignment: { declaredPrimary: "igl", declaredSecondary: [], inferredPrimary: "awper", overall: "not_comparable", tSide: "T 方观察职责：unknown", ctSide: "CT 方观察职责：anchor", disagreementReasons: [], sampleLimitations: [] },
  perMapEvidence: [{
    version: 2, playerKey: "p1", teamKey: "T", mapName: "de_mirage", side: "ct", status: "ready", confidence: 0.8,
    sample: { observedRounds: 12, eligibleRounds: 12, eligibleSeconds: 240, matchCount: 3, dataQuality: 1, coverage: 1 },
    positionGroups: [{ positionGroupId: "a_site", seconds: 200, share: 0.83, roundCount: 10 }],
    spatial: { dominantGroupStability: 0.83, teamRelativeGroupShare: 0.2, isolationSeconds: 0, isolationShare: 0, rejoinCount: 0, movementSync: 0.5, openingMainComponentShare: 0.4, openingIsolatedShare: 0.4, formationShares: { "4+1": 1 } },
    responsibility: "anchor",
    awp: { duty: "primary_awper", eligibleRounds: 12, qualifiedLongGunRounds: 12, freezeOwnershipRounds: 8, activeSeconds: 100, shots: 12, kills: 5, teamActiveShare: 1, usageConcentration: 1, matchConsistency: 1 },
    representativeRounds: [{ matchId: "m1", roundNumber: 2 }], basis: ["facts"], limitations: ["limit"],
  }],
  evidence: [{ matchId: "m1", roundNumber: 2, reason: "example", role: "example" }], basis: ["basis"], limitations: ["IGL 无法由 demo 统计验证。"],
} satisfies PlayerMapRoleProfile;

describe("Map role display", () => {
  it("keeps declared and inferred role labels side-by-side and hides internal position ids", () => {
    const html = renderToStaticMarkup(React.createElement(PlayerMapRoleProfilePanel, { profile, onOpenEvidence: () => {} }));
    expect(html).toContain("自动画像"); expect(html).toContain("IGL / AWPer"); expect(html).toContain("A包"); expect(html).not.toContain("a_site"); expect(html).toContain("dak-evidence");
  });
  it("renders an honest insufficient matrix state", () => {
    const html = renderToStaticMarkup(React.createElement(TeamMapRoleMatrixPanel, { matrix: null }));
    expect(html).toContain("该地图暂无职责矩阵");
  });
  void ({} as TeamMapRoleMatrix);
});
