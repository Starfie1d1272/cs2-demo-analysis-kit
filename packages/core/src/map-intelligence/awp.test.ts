import { describe, expect, it } from "vitest";
import { FLAG_ALIVE, type DemoPackage } from "@cs2dak/contract";
import { extractAwpRoundFacts } from "./awp.js";
import { extractTeamAwpRoundFacts } from "./team-awp-round.js";
import type { ReplayRoundContext, ReplayRoundTrack } from "../tactics/replay-round-context.js";

describe("extractAwpRoundFacts", () => {
  it("stops active AWP time after death and ignores invalid trajectory frames", () => {
    const track: ReplayRoundTrack = {
      playerIndex: 0, teamKey: "teamA", side: "ct", steamId64: "76561198000000001",
      x: [1, 1, 1, Number.NaN], y: [1, 1, 1, 1], z: [1, 1, 1, 1],
      flags: [FLAG_ALIVE, FLAG_ALIVE, 0, FLAG_ALIVE], place: [0, 0, 0, 0], weapon: [0, 0, 0, 0],
    };
    const round = { roundNumber: 1, freezeEndTick: 0, endTick: 128 } as DemoPackage["rounds"][number];
    const context: ReplayRoundContext = { round, startTick: 0, tickStep: 32, frameCount: 4, placeDict: [], weaponDict: ["awp"], tracks: [track] };
    const pkg = {
      match: { tickrate: 64 }, playerEconomies: [], shots: undefined, kills: [],
    } as unknown as DemoPackage;
    expect(extractAwpRoundFacts(pkg, context, track).activeAwpSeconds).toBe(1);
  });

  it("does not count invalid-coordinate teammates toward double-AWP active time", () => {
    const tracks: ReplayRoundTrack[] = [0, 1].map((playerIndex) => ({
      playerIndex, teamKey: "teamA", side: "ct", steamId64: `7656119800000000${playerIndex + 1}`,
      x: playerIndex === 0 ? [1, 1] : [Number.NaN, Number.NaN], y: [1, 1], z: [1, 1],
      flags: [FLAG_ALIVE, FLAG_ALIVE], place: [0, 0], weapon: [0, 0],
    }));
    const round = { roundNumber: 1, freezeEndTick: 0, endTick: 64, teamASide: "ct", teamBSide: "t", teamAEconomy: "full", teamBEconomy: "full", winnerTeamKey: "teamA" } as DemoPackage["rounds"][number];
    const context: ReplayRoundContext = { round, startTick: 0, tickStep: 32, frameCount: 2, placeDict: [], weaponDict: ["awp"], tracks };
    const pkg = { match: { tickrate: 64, mapName: "de_nuke" }, rounds: [round], players: [{ teamKey: "teamA" }, { teamKey: "teamA" }], kills: [] } as unknown as DemoPackage;
    const rows = tracks.map((track) => ({ teamKey: "teamA", playerIndex: track.playerIndex, freezeAwpOwnership: true, activeAwpSeconds: 1, awpShots: 0, awpKills: 0, availability: { replay: "available", nav: "missing", callouts: "missing", shots: "missing" } })) as unknown as import("@cs2dak/contract").PlayerPositionRoundFact[];
    expect(extractTeamAwpRoundFacts(pkg, "m1", context, rows).find((item) => item.teamKey === "teamA")?.doubleAwpActiveSeconds).toBe(0);
  });

  it("materializes effective enemy-only AWP damage and retains zero for a damage-complete round", () => {
    const round = { roundNumber: 1, freezeEndTick: 10, endTick: 100, teamASide: "ct", teamBSide: "t", teamAEconomy: "full", teamBEconomy: "full", winnerTeamKey: "teamA" } as DemoPackage["rounds"][number];
    const tracks: ReplayRoundTrack[] = [
      { playerIndex: 0, teamKey: "teamA", side: "ct", steamId64: "a", x: [1], y: [1], z: [1], flags: [FLAG_ALIVE], place: [0], weapon: [0] },
      { playerIndex: 1, teamKey: "teamB", side: "t", steamId64: "b", x: [1], y: [1], z: [1], flags: [FLAG_ALIVE], place: [0], weapon: [0] },
    ];
    const context: ReplayRoundContext = { round, startTick: 10, tickStep: 32, frameCount: 1, placeDict: [], weaponDict: ["awp"], tracks };
    const pkg = {
      manifest: { files: { damages: "damages.json" } }, match: { tickrate: 64, mapName: "de_nuke" }, rounds: [round], players: [{ teamKey: "teamA" }, { teamKey: "teamB" }], kills: [],
      damages: [
        { roundNumber: 1, tick: 20, attackerIndex: 0, victimIndex: 1, weapon: "weapon_awp", healthDamage: 40, healthDamageRaw: 100 },
        { roundNumber: 1, tick: 20, attackerIndex: 0, victimIndex: 0, weapon: "awp", healthDamage: 80, healthDamageRaw: 80 },
        { roundNumber: 1, tick: 20, attackerIndex: null, victimIndex: 1, weapon: "awp", healthDamage: 90, healthDamageRaw: 90 },
        { roundNumber: 1, tick: 20, attackerIndex: 0, victimIndex: 1, weapon: "ak47", healthDamage: 30, healthDamageRaw: 30 },
        { roundNumber: 1, tick: 5, attackerIndex: 0, victimIndex: 1, weapon: "awp", healthDamage: 20, healthDamageRaw: 20 },
      ],
    } as unknown as DemoPackage;
    const rows = tracks.map((track) => ({ teamKey: track.teamKey, playerIndex: track.playerIndex, freezeAwpOwnership: false, activeAwpSeconds: 0, awpShots: 0, awpKills: 0, availability: { replay: "available", nav: "missing", callouts: "missing", shots: "missing" } })) as unknown as import("@cs2dak/contract").PlayerPositionRoundFact[];
    const facts = extractTeamAwpRoundFacts(pkg, "m1", context, rows);
    expect(facts.find((row) => row.teamKey === "teamA")?.awpDamage).toBe(40);
    expect(facts.find((row) => row.teamKey === "teamB")?.awpDamage).toBe(0);
  });
});
