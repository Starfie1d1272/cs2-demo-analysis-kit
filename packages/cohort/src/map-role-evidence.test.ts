import { describe, expect, it } from "vitest";
import type { PlayerPositionRoundFact } from "@cs2dak/contract";
import { buildPlayerMapRoleEvidence, buildTeamMapResponsibilityEvidence } from "./index.js";

function row(playerIndex: number, roundNumber: number, overrides: Partial<PlayerPositionRoundFact> = {}): PlayerPositionRoundFact {
  return {
    analysisVersion: 2, matchId: "m1", mapName: "de_ancient", roundNumber, teamKey: "teamA", side: "ct",
    playerIndex, steamId64: `7656119800000000${playerIndex + 1}`, eligibleSeconds: 20,
    economyType: "full", openingWindow: { version: 1, startTick: 100, endTick: 1380, configuredSeconds: 20 },
    openingEligibleSeconds: 20, openingPositionGroupDwell: [{ positionGroupId: playerIndex === 0 ? "a_anchor" : "b_anchor", seconds: 16, share: 0.8 }],
    openingMeanComponentSize: 3, openingIsolationSeconds: 0,
    positionGroupDwell: [{ positionGroupId: playerIndex === 0 ? "a_anchor" : "b_anchor", seconds: 16, share: 0.8 }],
    unresolvedCalloutSeconds: 0, calloutCoverage: 1, meanNearestTeammateDistance: 200, meanTeamCentroidDistance: 300,
    meanComponentSize: 3, isolationSegments: [], rejoinTicks: [], movementSync: 0.6,
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
});
