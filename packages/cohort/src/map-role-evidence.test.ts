import { describe, expect, it } from "vitest";
import type { PlayerPositionRoundFact, TeamShapeRoundFact } from "@cs2dak/contract";
import { buildPlayerMapRoleEvidence, buildTeamMapResponsibilityEvidence } from "./index.js";

function row(playerIndex: number, roundNumber: number, overrides: Partial<PlayerPositionRoundFact> = {}): PlayerPositionRoundFact {
  return {
    analysisVersion: 5, matchId: "m1", mapName: "de_ancient", roundNumber, teamKey: "teamA", side: "ct",
    playerIndex, steamId64: `7656119800000000${playerIndex + 1}`, eligibleSeconds: 20,
    economyType: "full", openingWindow: { version: 1, startTick: 100, endTick: 1380, configuredSeconds: 20 },
    openingEligibleSeconds: 20, openingPositionGroupDwell: [{ positionGroupId: playerIndex === 0 ? "a_anchor" : "b_anchor", seconds: 16, share: 0.8 }],
    openingMeanComponentSize: 3, openingIsolationSeconds: 0, openingUtilityUseCount: 0,
    openingPath: [],
    positionGroupDwell: [{ positionGroupId: playerIndex === 0 ? "a_anchor" : "b_anchor", seconds: 16, share: 0.8 }],
    unresolvedCalloutSeconds: 0, calloutCoverage: 1, meanNearestTeammateDistance: 200, meanTeamCentroidDistance: 300,
    meanComponentSize: 3, isolationSegments: [], rejoinTicks: [], delayedConvergences: [], movementSync: 0.6, utilityUseCount: 0,
    freezeAwpOwnership: playerIndex === 0, activeAwpSeconds: playerIndex === 0 ? 12 : 0, awpShots: playerIndex === 0 ? 2 : 0, awpKills: playerIndex === 0 ? 1 : 0,
    availability: { replay: "available", nav: "available", callouts: "available", shots: "available" },
    ...overrides,
  };
}

describe("map role evidence", () => {
  it("merges identities, computes team-relative AWP duty, and keeps unsupported maps out", () => {
    const rows = Array.from({ length: 6 }, (_, index) => [row(0, index + 1), row(1, index + 1)]).flat();
    rows.push(row(2, 1, { mapName: "de_vertigo" }));
    const options = {
      identityMap: { "76561198000000001": { playerKey: "player:one" } },
      teamIdentityMap: { "m1:teamA": "Team One" },
    };
    const players = buildPlayerMapRoleEvidence({ playerPositionRounds: rows, teamShapeRounds: [] }, options);
    const awper = players.find((player) => player.playerKey === "player:one")!;
    expect(players).toHaveLength(2);
    expect(awper.teamKey).toBe("Team One");
    expect(awper.awp.duty).toBe("secondary_awper");
    expect(awper.spatial.teamRelativeGroupShare).toBeGreaterThan(0);

    const teams = buildTeamMapResponsibilityEvidence({ playerPositionRounds: rows, teamShapeRounds: [] }, options);
    expect(teams).toHaveLength(1);
    expect(teams[0]?.players).toHaveLength(2);
  });

  it("keeps missing replay data unknown and null instead of making a zero-valued role", () => {
    const missing = row(0, 1, {
      eligibleSeconds: null, positionGroupDwell: [], activeAwpSeconds: null, awpShots: null, awpKills: null,
      availability: { replay: "missing", nav: "missing", callouts: "missing", shots: "missing" },
    });
    const evidence = buildPlayerMapRoleEvidence({ playerPositionRounds: [missing], teamShapeRounds: [] });
    expect(evidence[0]).toMatchObject({ status: "unknown", awp: { activeSeconds: null, teamActiveShare: null } });
  });

  it("consumes opening component membership and formation continuity from TeamShapeRoundFact", () => {
    const rows = Array.from({ length: 6 }, (_, index) => [row(0, index + 1), row(4, index + 1)]).flat();
    const shapes: TeamShapeRoundFact[] = Array.from({ length: 6 }, (_, index) => ({
      analysisVersion: 5, matchId: "m1", mapName: "de_ancient", roundNumber: index + 1, teamKey: "teamA", side: "ct",
      openingWindow: { version: 1, startTick: 100, endTick: 1380, configuredSeconds: 20 },
      openingWindows: [{ startTick: 100, endTick: 1380, coverageSeconds: 20, componentSizes: [4, 1], partition: "4+1", componentPlayerIndices: [[0, 1, 2, 3], [4]] }],
      coverageSeconds: 40, windows: [{ startTick: 100, endTick: 2660, coverageSeconds: 40, componentSizes: [4, 1], partition: "4+1", componentPlayerIndices: [[0, 1, 2, 3], [4]] }],
      availability: { replay: "available", nav: "available", callouts: "available", shots: "available" },
    }));
    const evidence = buildPlayerMapRoleEvidence({ playerPositionRounds: rows, teamShapeRounds: shapes });
    expect(evidence.find((item) => item.playerKey.endsWith("1"))?.spatial).toMatchObject({ openingMainComponentShare: 1, formationShares: { "4+1": 1 } });
    expect(evidence.find((item) => item.playerKey.endsWith("5"))?.spatial.openingIsolatedShare).toBe(1);
  });

  it("does not assign main-component credit when the opening has no unique majority core", () => {
    const rows = Array.from({ length: 6 }, (_, index) => row(0, index + 1));
    const shapes: TeamShapeRoundFact[] = Array.from({ length: 6 }, (_, index) => ({
      analysisVersion: 5, matchId: "m1", mapName: "de_ancient", roundNumber: index + 1, teamKey: "teamA", side: "ct",
      openingWindow: { version: 1, startTick: 100, endTick: 1380, configuredSeconds: 20 },
      openingWindows: [{ startTick: 100, endTick: 1380, coverageSeconds: 20, componentSizes: [2, 2, 1], partition: "2+2+1", componentPlayerIndices: [[0, 1], [2, 3], [4]] }],
      coverageSeconds: 20, windows: [], availability: { replay: "available", nav: "available", callouts: "available", shots: "available" },
    }));
    const evidence = buildPlayerMapRoleEvidence({ playerPositionRounds: rows, teamShapeRounds: shapes })[0]!;
    expect(evidence.spatial.openingMainComponentShare).toBe(0);
    expect(evidence.spatial.openingNoUniqueCoreShare).toBe(1);
  });

  it("aggregates team matrices to one row per unique player before overlap", () => {
    const sameGroup = { openingPositionGroupDwell: [{ positionGroupId: "a_anchor", seconds: 16, share: 0.8 }], positionGroupDwell: [{ positionGroupId: "a_anchor", seconds: 16, share: 0.8 }] };
    const rows = Array.from({ length: 6 }, (_, index) => [
      row(0, index + 1, sameGroup), row(1, index + 1, sameGroup),
      row(0, index + 1, { ...sameGroup, matchId: "m2" }), row(1, index + 1, { ...sameGroup, matchId: "m2" }),
    ]).flat();
    const teams = buildTeamMapResponsibilityEvidence({ playerPositionRounds: rows, teamShapeRounds: [] }, { teamIdentityMap: { "m1:teamA": "Team One", "m2:teamA": "Team One" } });
    expect(teams[0]?.players).toHaveLength(2);
    expect(teams[0]?.positionOverlap[0]?.playerKeys).toHaveLength(2);
    expect(new Set(teams[0]?.positionOverlap[0]?.playerKeys).size).toBe(2);
  });

  it("produces support responsibilities only from observable utility timing and team coordination", () => {
    const shapes: TeamShapeRoundFact[] = Array.from({ length: 6 }, (_, index) => ({
      analysisVersion: 5, matchId: "m1", mapName: "de_ancient", roundNumber: index + 1, teamKey: "teamA", side: "t",
      openingWindow: { version: 1, startTick: 100, endTick: 1380, configuredSeconds: 20 },
      openingWindows: [{ startTick: 100, endTick: 1380, coverageSeconds: 20, componentSizes: [5], partition: "5", componentPlayerIndices: [[0, 1, 2, 3, 4]] }],
      coverageSeconds: 20, windows: [], availability: { replay: "available", nav: "available", callouts: "available", shots: "available" },
    }));
    const supported = Array.from({ length: 6 }, (_, index) => row(0, index + 1, { side: "t", utilityUseCount: 1, openingUtilityUseCount: 1 }));
    expect(buildPlayerMapRoleEvidence({ playerPositionRounds: supported, teamShapeRounds: shapes })[0]?.modifiers).toContain("utility_supportive");
    expect(buildPlayerMapRoleEvidence({ playerPositionRounds: supported.map((item) => ({ ...item, utilityUseCount: 0, openingUtilityUseCount: 0 })), teamShapeRounds: shapes })[0]?.modifiers).not.toContain("utility_supportive");
    expect(buildPlayerMapRoleEvidence({ playerPositionRounds: supported.map((item) => ({ ...item, side: "ct" })), teamShapeRounds: shapes })[0]?.modifiers).toContain("utility_supportive");
  });
});
