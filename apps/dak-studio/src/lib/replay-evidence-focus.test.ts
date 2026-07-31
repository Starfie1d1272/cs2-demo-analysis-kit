import { describe, expect, it } from "vitest";
import type { MatchWorkspaceModel } from "@cs2dak/contract";
import { replayEvidenceParticipantIds } from "./replay-evidence-focus";

const replay = {
  available: true,
  sampleRate: 8,
  tickrate: 64,
  capabilities: { hasDefuseKit: true },
  rounds: [{
    roundNumber: 4,
    startTick: 1_000,
    freezeEndTick: 1_100,
    tickStep: 8,
    frameCount: 20,
    players: [
      { steamId64: "killer", name: "K", teamKey: "teamA", side: "t", loadout: { primaryWeapon: null, secondaryWeapon: null, grenadeCount: 0, grenades: [] }, frames: [] },
      { steamId64: "victim", name: "V", teamKey: "teamB", side: "ct", loadout: { primaryWeapon: null, secondaryWeapon: null, grenadeCount: 0, grenades: [] }, frames: [] },
      { steamId64: "thrower", name: "T", teamKey: "teamA", side: "t", loadout: { primaryWeapon: null, secondaryWeapon: null, grenadeCount: 0, grenades: [] }, frames: [] },
    ],
    kills: [{
      id: "kill:1",
      tick: 1_200,
      killerSteamId64: "killer",
      victimSteamId64: "victim",
      killerName: "K",
      killerTeamKey: "teamA",
      victimName: "V",
      weapon: "AK-47",
      headshot: false,
      throughSmoke: false,
      noScope: false,
      flashAssist: false,
      tradeKill: false,
      wallbang: false,
      killerX: null,
      killerY: null,
      killerZ: null,
      victimX: null,
      victimY: null,
      victimZ: null,
    }],
    grenades: [{
      grenade: "smoke",
      throwerSteamId64: "thrower",
      throwerSide: "t",
      throwTick: 1_240,
      effectTick: 1_260,
      destroyTick: null,
      throwX: 0,
      throwY: 0,
      effectX: 1,
      effectY: 1,
      effectZ: 0,
    }],
    projectiles: [],
    bomb: null,
    groundBombs: [],
    groundDefusers: [],
  }],
} satisfies MatchWorkspaceModel["replay"];

describe("replayEvidenceParticipantIds", () => {
  it("focuses both sides of a kill plus a stable finding subject", () => {
    expect(replayEvidenceParticipantIds(replay, {
      matchId: "m1",
      roundNumber: 4,
      tick: 1_200,
      eventKey: "kill:1",
      reason: "opening duel",
    }, "thrower")).toEqual(["thrower", "killer", "victim"]);
  });

  it("focuses a grenade thrower at throw and effect ticks without name inference", () => {
    expect(replayEvidenceParticipantIds(replay, {
      matchId: "m1",
      roundNumber: 4,
      tick: 1_260,
      reason: "smoke effect",
    })).toEqual(["thrower"]);
    expect(replayEvidenceParticipantIds(replay, {
      matchId: "m1",
      roundNumber: 4,
      tick: 1_300,
      reason: "unresolved",
    })).toEqual([]);
  });
});
