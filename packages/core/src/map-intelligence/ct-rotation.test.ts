import { describe, expect, it } from "vitest";
import { FLAG_ALIVE, type DemoPackage } from "@cs2dak/contract";
import type { ReplayRoundContext, ReplayRoundTrack } from "../tactics/replay-round-context.js";
import { extractCtRotationRoundFacts } from "./ct-rotation.js";
import { buildRoundSpatialFrames } from "./spatial.js";

const frameCount = 71;
const placeDict = ["BombsiteA", "CTSpawn", "BombsiteB", "TRamp", "Apartments"];
const round = {
  roundNumber: 1,
  freezeEndTick: 100,
  endTick: 800,
  teamASide: "ct",
  teamBSide: "t",
} as DemoPackage["rounds"][number];

function track(
  playerIndex: number,
  teamKey: "teamA" | "teamB",
  side: "ct" | "t",
  places: number[],
  flags = Array(frameCount).fill(FLAG_ALIVE),
): ReplayRoundTrack {
  return {
    playerIndex,
    teamKey,
    side,
    steamId64: `7656119800000000${playerIndex + 1}`,
    x: Array(frameCount).fill(playerIndex * 100),
    y: Array(frameCount).fill(0),
    z: Array(frameCount).fill(0),
    flags,
    place: places,
    weapon: Array(frameCount).fill(-1),
  };
}

function scenario(options: { dieDuringResponse?: boolean } = {}) {
  const rotatingFlags = Array(frameCount).fill(FLAG_ALIVE);
  if (options.dieDuringResponse) rotatingFlags.fill(0, 23);
  const rotatingPlaces = Array.from({ length: frameCount }, (_, index) => index <= 20 ? 0 : index < 30 ? 1 : 2);
  const context: ReplayRoundContext = {
    round,
    startTick: 100,
    tickStep: 10,
    frameCount,
    placeDict,
    weaponDict: [],
    tracks: [
      track(0, "teamA", "ct", rotatingPlaces, rotatingFlags),
      track(1, "teamA", "ct", Array(frameCount).fill(0)),
      track(2, "teamB", "t", Array.from({ length: frameCount }, (_, index) => index <= 20 ? 3 : 4)),
    ],
  };
  const pkg = {
    match: { mapName: "de_mirage", tickrate: 10 },
    rounds: [round],
    players: [
      { steamId64: "76561198000000001", teamKey: "teamA" },
      { steamId64: "76561198000000002", teamKey: "teamA" },
      { steamId64: "76561198000000003", teamKey: "teamB" },
    ],
    damages: [
      { roundNumber: 1, tick: 250, attackerIndex: 2, victimIndex: 0, healthDamageRaw: 10 },
      { roundNumber: 1, tick: 305, attackerIndex: 2, victimIndex: 0, healthDamageRaw: 10 },
    ],
    kills: options.dieDuringResponse ? [{ roundNumber: 1, tick: 330, killerIndex: 2, victimIndex: 0 }] : [],
    shots: undefined,
  } as unknown as DemoPackage;
  const frames = buildRoundSpatialFrames(context, null, null);
  return extractCtRotationRoundFacts(pkg, "m1", context, round, frames, null, false);
}

describe("extractCtRotationRoundFacts", () => {
  it("records a stable cross-area response and its team-relative order without emitting a role", () => {
    const row = scenario().find((candidate) => candidate.playerIndex === 0)!;

    expect(row).toMatchObject({
      initialPositionGroupId: "a_site",
      initialRegion: "a",
      initialPositionGroupShare: 1,
      initialResponsibilityResolved: true,
      firstOwnAreaContactTick: 250,
      firstOtherAreaContactTick: 305,
      firstTeamContactTick: 250,
      leftInitialAreaTick: 310,
      leaveDelayAfterFirstOtherAreaContactSeconds: 0.5,
      responseTargetPositionGroupId: "b_site",
      responseTargetRegion: "b",
      crossedResponsibilityArea: true,
      returnedToInitialArea: false,
      responsePathEligibleSeconds: 9,
      rotationStartOrder: 1,
      firstResponder: true,
      teammatesAlreadyRotating: 0,
      initialAreaStillCovered: true,
      censoredByDeath: false,
    });
    expect(row).not.toHaveProperty("role");
  });

  it("keeps an unfinished response unknown when death truncates observation", () => {
    const row = scenario({ dieDuringResponse: true }).find((candidate) => candidate.playerIndex === 0)!;

    expect(row.deathTick).toBe(330);
    expect(row.censoredByDeath).toBe(true);
    expect(row.leftInitialAreaTick).toBeNull();
    expect(row.responseTargetPositionGroupId).toBeNull();
    expect(row.crossedResponsibilityArea).toBeNull();
    expect(row.rotationStartOrder).toBeNull();
  });

  it("records an observed full-round stay as false rather than unknown", () => {
    const row = scenario().find((candidate) => candidate.playerIndex === 1)!;

    expect(row.initialResponsibilityResolved).toBe(true);
    expect(row.deathTick).toBeNull();
    expect(row.censoredByDeath).toBe(false);
    expect(row.crossedResponsibilityArea).toBe(false);
  });
});
