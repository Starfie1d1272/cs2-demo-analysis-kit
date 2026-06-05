import { describe, expect, it } from "vitest";
import type { DemoPackage } from "@cs2dak/contract";
import { annotatePositions, groupSamplesByRoundTick, loadSpatialAssets } from "./annotate.js";

function pkgWith(mapName: string, rows: unknown[]): DemoPackage {
  return {
    match: { mapName, tickrate: 64 },
    players: [{ steamId64: "T1", teamKey: "teamA" }],
    rounds: [],
    positions1s: rows,
  } as unknown as DemoPackage;
}

function row(tick: number, steamId64: string, place: string, x: number, y: number, z: number) {
  return {
    roundNumber: 1,
    tick,
    steamId64,
    teamKey: "teamA",
    side: "t",
    alive: true,
    position: { x, y, z },
    lastPlaceName: place,
  };
}

describe("loadSpatialAssets", () => {
  it("reports availability per asset for an active-duty map", () => {
    const assets = loadSpatialAssets("de_dust2");
    expect(assets.available.routes).toBe(true);
    expect(assets.available.nav).toBe(true);
    expect(assets.available.visibility).toBe(false); // no .tri passed
  });

  it("reports everything missing for an unknown map", () => {
    const assets = loadSpatialAssets("de_unknown");
    expect(assets.available.routes).toBe(false);
    expect(assets.available.nav).toBe(false);
  });
});

describe("annotatePositions", () => {
  it("attaches callout and nearest nav area id when nav is available", () => {
    const assets = loadSpatialAssets("de_dust2");
    const samples = annotatePositions(pkgWith("de_dust2", [row(120, "T1", "LongA", 760, 1660, 0)]), assets);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.callout).toBe("LongA");
    expect(typeof samples[0]!.navAreaId).toBe("number");
    expect(samples[0]!.position).toEqual({ x: 760, y: 1660, z: 0 });
  });

  it("leaves navAreaId null when nav is unavailable", () => {
    const assets = loadSpatialAssets("de_unknown");
    const samples = annotatePositions(pkgWith("de_unknown", [row(120, "T1", "Somewhere", 0, 0, 0)]), assets);
    expect(samples[0]!.navAreaId).toBeNull();
    expect(samples[0]!.callout).toBe("Somewhere");
  });

  it("returns an empty array without positions", () => {
    const assets = loadSpatialAssets("de_dust2");
    expect(annotatePositions(pkgWith("de_dust2", []), assets)).toEqual([]);
  });

  it("groups samples by round then tick", () => {
    const assets = loadSpatialAssets("de_dust2");
    const samples = annotatePositions(
      pkgWith("de_dust2", [row(120, "T1", "LongA", 760, 1660, 0), row(120, "T2", "TSpawn", -500, -850, 96)]),
      assets,
    );
    const grouped = groupSamplesByRoundTick(samples);
    expect(grouped.get(1)!.get(120)!).toHaveLength(2);
  });
});
