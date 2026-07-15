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

function scenario(options: { deathTick?: number; otherContactTick?: number; secondRotates?: boolean; deathWithoutEnemyContact?: boolean } = {}) {
  const deathTick = options.deathTick ?? null;
  const otherContactTick = options.otherContactTick ?? 305;
  const rotatingFlags = Array(frameCount).fill(FLAG_ALIVE);
  if (deathTick != null) rotatingFlags.fill(0, Math.floor((deathTick - 100) / 10) + 1);
  const rotatingPlaces = Array.from({ length: frameCount }, (_, index) => index <= 20 ? 0 : index < 30 ? 1 : 2);
  const otherContactFrame = Math.round((otherContactTick - 100) / 10);
  const context: ReplayRoundContext = {
    round,
    startTick: 100,
    tickStep: 10,
    frameCount,
    placeDict,
    weaponDict: [],
    tracks: [
      track(0, "teamA", "ct", rotatingPlaces, rotatingFlags),
      track(1, "teamA", "ct", options.secondRotates ? rotatingPlaces : Array(frameCount).fill(0)),
      track(2, "teamB", "t", Array.from({ length: frameCount }, (_, index) => index < otherContactFrame ? 3 : 4)),
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
      { roundNumber: 1, tick: otherContactTick, attackerIndex: 2, victimIndex: 0, healthDamageRaw: 10 },
    ],
    kills: deathTick == null ? [] : [{ roundNumber: 1, tick: deathTick, killerIndex: options.deathWithoutEnemyContact ? null : 2, victimIndex: 0 }],
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
      leftInitialPositionGroupTick: 310,
      leaveDelayAfterFirstOtherAreaContactSeconds: 0.5,
      firstStableDestinationPositionGroupId: "b_site",
      firstStableDestinationRegion: "b",
      crossedResponsibilityArea: true,
      returnedToInitialPositionGroup: false,
      transitToStableDestinationSeconds: 9,
      crossAreaDepartureOrder: 1,
      firstCrossAreaDeparture: true,
      priorCrossAreaDeparturesAlive: 0,
      initialAreaStillCovered: true,
      censoredByDeath: false,
    });
    expect(row).not.toHaveProperty("role");
  });

  it("keeps an unfinished response unknown when death truncates observation", () => {
    const row = scenario({ deathTick: 330 }).find((candidate) => candidate.playerIndex === 0)!;

    expect(row.deathTick).toBe(330);
    expect(row.censoredByDeath).toBe(true);
    expect(row.leftInitialPositionGroupTick).toBeNull();
    expect(row.firstStableDestinationPositionGroupId).toBeNull();
    expect(row.crossedResponsibilityArea).toBeNull();
    expect(row.crossAreaDepartureOrder).toBeNull();
  });

  it("records an observed full-round stay as false rather than unknown", () => {
    const row = scenario().find((candidate) => candidate.playerIndex === 1)!;

    expect(row.initialResponsibilityResolved).toBe(true);
    expect(row.deathTick).toBeNull();
    expect(row.censoredByDeath).toBe(false);
    expect(row.crossedResponsibilityArea).toBe(false);
  });

  it("uses signed contact delay instead of hiding a departure that came first", () => {
    const row = scenario({ otherContactTick: 350 }).find((candidate) => candidate.playerIndex === 0)!;

    expect(row.leftInitialPositionGroupTick).toBe(310);
    expect(row.firstOtherAreaContactTick).toBe(350);
    expect(row.leaveDelayAfterFirstOtherAreaContactSeconds).toBe(-4);
  });

  it("clips team contacts to the player's observable lifetime", () => {
    const row = scenario({ deathTick: 190, deathWithoutEnemyContact: true }).find((candidate) => candidate.playerIndex === 0)!;

    expect(row.censoredByDeath).toBe(true);
    expect(row.firstTeamContactTick).toBeNull();
    expect(row.firstOwnAreaContactTick).toBeNull();
    expect(row.firstOtherAreaContactTick).toBeNull();
  });

  it("preserves simultaneous departures as deterministic shared ranks", () => {
    const rows = scenario({ secondRotates: true }).filter((candidate) => candidate.playerIndex < 2);

    expect(rows.map((row) => row.crossAreaDepartureOrder)).toEqual([1, 1]);
    expect(rows.map((row) => row.firstCrossAreaDeparture)).toEqual([true, true]);
    expect(rows.map((row) => row.priorCrossAreaDeparturesAlive)).toEqual([0, 0]);
  });
});
