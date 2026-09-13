import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { PackagePlayer, PackageRound } from "@cs2dak/contract";
import { createPlayerResolver } from "./resolve.js";
import { loadDemoPackageFromZip } from "./loader.js";

const players: PackagePlayer[] = [
  { steamId64: "76561198000000001", name: "Alpha", teamKey: "teamA" },
  { steamId64: "76561198000000002", name: "Bravo", teamKey: "teamB" },
];

const round = (roundNumber: number, teamASide: "t" | "ct"): PackageRound => ({
  roundNumber,
  startTick: roundNumber * 1000,
  freezeEndTick: roundNumber * 1000 + 100,
  endTick: roundNumber * 1000 + 900,
  teamASide,
  teamBSide: teamASide === "t" ? "ct" : "t",
  teamAScoreBefore: 0,
  teamBScoreBefore: 0,
  teamAEconomy: "full",
  teamBEconomy: "full",
  winnerTeamKey: "teamA",
  winnerSide: teamASide,
  endReason: "t_win",
});

describe("createPlayerResolver", () => {
  const resolver = createPlayerResolver(players, [round(1, "t"), round(13, "ct")]);

  it("resolves playerIndex to player row", () => {
    expect(resolver.byIndex(0).name).toBe("Alpha");
    expect(resolver.byIndex(1).teamKey).toBe("teamB");
    expect(() => resolver.byIndex(2)).toThrow(/out of range/);
  });

  it("byIndexOrNull passes through null", () => {
    expect(resolver.byIndexOrNull(null)).toBeNull();
    expect(resolver.byIndexOrNull(undefined)).toBeNull();
    expect(resolver.byIndexOrNull(0)?.name).toBe("Alpha");
  });

  it("derives per-round side from teamKey + rounds", () => {
    expect(resolver.sideOf(0, 1)).toBe("t");
    expect(resolver.sideOf(1, 1)).toBe("ct");
    expect(resolver.sideOf(0, 13)).toBe("ct");
    expect(resolver.teamSideOf("teamB", 13)).toBe("t");
    expect(() => resolver.sideOf(0, 99)).toThrow(/Unknown roundNumber/);
  });

  it("maps steamId64 back to playerIndex", () => {
    expect(resolver.indexOfSteamId("76561198000000002")).toBe(1);
    expect(resolver.indexOfSteamId("76561198999999999")).toBeNull();
  });
});

describe("loadDemoPackageFromZip version gate", () => {
  it("rejects v2 packages with a re-export hint", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ schemaVersion: "cs2-demo-format/2.3" }));
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(loadDemoPackageFromZip(bytes)).rejects.toThrow(/cs2df/);
  });

  it("rejects packages without manifest version", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({}));
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(loadDemoPackageFromZip(bytes)).rejects.toThrow(/不支持的包版本/);
  });

  it("does not treat a missing v3 required source file as an empty event array", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({
      schemaVersion: "cs2-demo-format/3.0",
      exporter: { name: "test", version: "0" },
      parser: { name: "test", version: "0" },
      demo: { hash: null, sourceFileName: null },
      mapName: "de_mirage",
      tickrate: 64,
      exportedAt: "2026-01-01T00:00:00Z",
      files: {
        match: "match.json",
        players: "players.json",
        rounds: "rounds.json",
        playerStats: "player-stats.json",
        playerEconomies: "player-economies.json",
        kills: "kills.json",
        damages: "damages.json",
        blinds: "blinds.json",
        bombs: "bombs.json",
        grenades: "grenades.json",
        clutches: "clutches.json",
      },
    }));
    for (const file of ["match.json", "players.json", "rounds.json", "player-economies.json"]) zip.file(file, "{}");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(loadDemoPackageFromZip(bytes)).rejects.toThrow(/Missing player-stats\.json/);
  });
});
