import { describe, expect, it } from "vitest";
import type { PlayerPositionRoundFact, TResponsibilityResearchFeatures, TeamShapeRoundFact } from "@cs2dak/contract";
import { buildPlayerMapRoleEvidence } from "./map-role-evidence.js";
import { buildTResponsibilityResearchProjections, scoreFrozenTResponsibilityFeatures } from "./t-role-research-projection.js";

const LUCHOV_FEATURES: TResponsibilityResearchFeatures = {
  dominantGroupStability: 0.8125875,
  teamRelativeGroupShare: 0.1741208333,
  openingIsolatedShare: 0.275425,
  isolationShare: 0.3739791667,
  delayedConvergenceShare: 0.1209125,
  movementSync: 0.3243583333,
  positionTopShare: 0.4567125,
  openingLargestShare: 0.7837100236,
  fullLargestShare: 0.784060982,
  meanTeamCentroidDistance: 683.9742873697,
  openingPathDisplacement: 1926.1863987284,
  openingPathTransitions: 0.3837471185,
  openingPositionEntropy: 0.8382271237,
  fullPositionEntropy: 0.8975500986,
  rejoinsPerMinute: 5.2426204323,
};

function row(playerIndex: number, roundNumber: number, overrides: Partial<PlayerPositionRoundFact> = {}): PlayerPositionRoundFact {
  return {
    analysisVersion: 6,
    matchId: "m1",
    mapName: "de_ancient",
    roundNumber,
    teamKey: "teamA",
    side: "t",
    playerIndex,
    steamId64: `7656119800000000${playerIndex + 1}`,
    economyType: "full",
    openingWindow: { version: 1, startTick: 100, endTick: 1380, configuredSeconds: 20 },
    openingEligibleSeconds: 20,
    openingPositionGroupDwell: [{ positionGroupId: playerIndex === 0 ? "a_default" : "mid_default", seconds: 20, share: 1 }],
    openingMeanComponentSize: 2,
    openingIsolationSeconds: 0,
    openingUtilityUseCount: 0,
    openingPath: [
      { tick: 100, callout: "Start", positionGroupId: "spawn", x: 0, y: 0, z: 0 },
      { tick: 1380, callout: "A", positionGroupId: "a_default", x: 1000, y: 0, z: 0 },
    ],
    eligibleSeconds: 40,
    positionGroupDwell: [{ positionGroupId: playerIndex === 0 ? "a_default" : "mid_default", seconds: 40, share: 1 }],
    unresolvedCalloutSeconds: 0,
    calloutCoverage: 1,
    meanNearestTeammateDistance: 250,
    meanTeamCentroidDistance: 500,
    meanComponentSize: 2,
    isolationSegments: [],
    rejoinTicks: [],
    delayedConvergences: [],
    movementSync: 0.3,
    utilityUseCount: 0,
    freezeAwpOwnership: false,
    activeAwpSeconds: 0,
    awpShots: 0,
    awpKills: 0,
    availability: { replay: "available", nav: "available", callouts: "available", shots: "available" },
    ...overrides,
  };
}

function shape(roundNumber: number): TeamShapeRoundFact {
  const window = {
    startTick: 100,
    endTick: 1380,
    coverageSeconds: 20,
    componentSizes: [2, 2, 1],
    partition: "2+2+1",
    componentPlayerIndices: [[0, 1], [2, 3], [4]],
  };
  return {
    analysisVersion: 6,
    matchId: "m1",
    mapName: "de_ancient",
    roundNumber,
    teamKey: "teamA",
    side: "t",
    openingWindow: { version: 1, startTick: 100, endTick: 1380, configuredSeconds: 20 },
    openingWindows: [window],
    coverageSeconds: 20,
    windows: [window],
    availability: { replay: "available", nav: "available", callouts: "available", shots: "available" },
  };
}

describe("T responsibility research projection", () => {
  it("reproduces the frozen full-fit score for a committed feature vector", () => {
    expect(scoreFrozenTResponsibilityFeatures(LUCHOV_FEATURES)).toEqual({
      packScore: 0.750651,
      lurkerScore: 0.249349,
      confidence: 0.750651,
      candidate: "pack",
    });
  });

  it("credits tied two-player action units without redefining them as a unique core", () => {
    const rows = Array.from({ length: 12 }, (_, index) => [row(0, index + 1), row(1, index + 1)]).flat();
    const shapes = Array.from({ length: 12 }, (_, index) => shape(index + 1));
    const oldEvidence = buildPlayerMapRoleEvidence({ playerPositionRounds: rows, teamShapeRounds: shapes });
    expect(oldEvidence[0]?.spatial.openingMainComponentShare).toBe(0);

    const projection = buildTResponsibilityResearchProjections({ playerPositionRounds: rows, teamShapeRounds: shapes });
    expect(projection).toHaveLength(2);
    expect(projection[0]?.features).toMatchObject({ openingLargestShare: 1, fullLargestShare: 1 });
    expect(projection[0]?.candidate).not.toBeNull();
    expect(projection[0]?.basis[0]).toContain("正式 responsibility 保持不变");
  });

  it("keeps missing replay and unobserved features unknown instead of imputing a role", () => {
    const missing = row(0, 1, {
      openingWindow: null,
      openingEligibleSeconds: null,
      openingPositionGroupDwell: [],
      openingPath: [],
      eligibleSeconds: null,
      positionGroupDwell: [],
      calloutCoverage: null,
      meanTeamCentroidDistance: null,
      movementSync: null,
      availability: { replay: "missing", nav: "missing", callouts: "missing", shots: "missing" },
    });
    expect(buildTResponsibilityResearchProjections({ playerPositionRounds: [missing], teamShapeRounds: [] })[0]).toMatchObject({
      status: "unknown",
      candidate: null,
      packScore: null,
      lurkerScore: null,
    });
  });
});
