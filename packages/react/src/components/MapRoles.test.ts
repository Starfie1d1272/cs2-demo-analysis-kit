import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlayerMapRoleProfile, TeamMapRoleMatrix } from "@cs2dak/contract";
import { PlayerMapRoleProfilePanel, TeamMapRoleMatrixPanel } from "./MapRoles";

const profile = { version: "cs2-demo-analysis-kit/player-map-role-profile-1.0", playerKey: "p1", teamKeys: ["T"], declaredRoles: [{ playerKey: "p1", role: "igl", source: "user", provenance: "user" }], inferredPrimaryRole: "awper", headlineRole: "IGL / AWPer", status: "ready", confidence: 0.8, weaponDuty: "primary_awper", perMapEvidence: [{ version: 1, playerKey: "p1", teamKey: "T", mapName: "de_mirage", side: "ct", status: "ready", confidence: 0.8, sample: { observedRounds: 8, eligibleRounds: 8, matchCount: 1, coverage: 1 }, positionGroups: [{ positionGroupId: "a", seconds: 10, share: 1, roundCount: 8 }], spatial: { dominantGroupStability: 1, teamRelativeGroupShare: 0.2, isolationSeconds: 0, isolationShare: 0, rejoinCount: 0, movementSync: 0.5 }, awp: { duty: "primary_awper", eligibleRounds: 8, freezeOwnershipRounds: 5, activeSeconds: 10, shots: 2, kills: 1, teamActiveShare: 1, mapStability: 1 }, representativeRounds: [{ matchId: "m1", roundNumber: 2 }], basis: ["facts"], limitations: ["limit"] }], evidence: [{ matchId: "m1", roundNumber: 2, reason: "example", role: "example" }], basis: ["basis"], limitations: ["limit"] } as PlayerMapRoleProfile;

describe("Map role display", () => {
  it("keeps declared and inferred role labels side-by-side with MetricInfo and EvidenceLink", () => {
    const html = renderToStaticMarkup(React.createElement(PlayerMapRoleProfilePanel, { profile, onOpenEvidence: () => {} }));
    expect(html).toContain("自动画像"); expect(html).toContain("声明"); expect(html).toContain("IGL / AWPer"); expect(html).toContain("dak-info"); expect(html).toContain("dak-evidence");
  });
  it("renders an honest insufficient matrix state", () => {
    const html = renderToStaticMarkup(React.createElement(TeamMapRoleMatrixPanel, { matrix: null }));
    expect(html).toContain("该地图暂无职责矩阵");
  });
  void ({} as TeamMapRoleMatrix);
});
