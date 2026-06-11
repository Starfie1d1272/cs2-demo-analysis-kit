import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DemoPackage } from "@cs2dak/contract";
import type { MapZones } from "@cs2dak/maps";
import { getMapTri } from "@cs2dak/maps/tri-assets";
import { loadDemoPackageFromZip } from "../loader.js";
import { loadSpatialAssets, type SpatialAssets } from "./annotate.js";
import { buildOfficialUtilitySpatial, buildUtilityWindows } from "./utility.js";

let deAncientPkg: DemoPackage | null = null;

beforeAll(async () => {
  const zip = await readFile(fileURLToPath(new URL("../../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
  deAncientPkg = await loadDemoPackageFromZip(zip);
}, 30_000);

// 合成 1 个方形 A 点 zone（无 nav/tri）——测归属 + 火焰逼退（zone-based，不需要 nav）。
const SITE_ZONES: MapZones = {
  mapName: "de_test",
  version: "t",
  zones: [{ id: "a_site", name: "A", role: "site", bombsite: "a", polygon: [[0, 0], [100, 0], [100, 100], [0, 100]] }],
};
const TEST_ASSETS: SpatialAssets = {
  mapName: "de_test", routes: null, zones: SITE_ZONES, nav: null, visibility: null,
  available: { routes: false, zones: true, nav: false, visibility: false },
};

function pos(tick: number, steamId64: string, teamKey: string, x: number, y: number, health = 100) {
  return { roundNumber: 1, tick, steamId64, teamKey, side: teamKey === "teamA" ? "t" : "ct", alive: true, position: { x, y, z: 0 }, health, lastPlaceName: null };
}

function makeMolotovPkg(): DemoPackage {
  return {
    match: { mapName: "de_test", tickrate: 64 },
    players: [{ steamId64: "T1", teamKey: "teamA" }, { steamId64: "C1", teamKey: "teamB" }],
    rounds: [{ roundNumber: 1, startTick: 1, freezeEndTick: 64, endTick: 1000, teamASide: "t", teamBSide: "ct" }],
    bombs: [], kills: [],
    grenades: [{ roundNumber: 1, grenadeId: "g1", grenade: "molotov", throwerSteamId64: "T1", throwerTeamKey: "teamA", throwTick: 80, effectTick: 100, destroyTick: 196, effectPosition: { x: 50, y: 50, z: 0 } }],
    positions1s: [pos(96, "C1", "teamB", 50, 50), pos(160, "C1", "teamB", 500, 500)],
  } as unknown as DemoPackage;
}

describe("buildUtilityWindows (zone attribution, doc §18)", () => {
  it("attributes a grenade to its effectPosition zone", () => {
    const windows = buildUtilityWindows(makeMolotovPkg(), TEST_ASSETS);
    expect(windows[0]!.zoneId).toBe("a_site");
    expect(windows[0]!.zoneRole).toBe("site");
    expect(windows[0]!.type).toBe("molotov");
  });
});

describe("incendiary displacement / path delay (zone-based)", () => {
  it("counts displacement when an enemy leaves the fire zone, and path delay", () => {
    const u = buildOfficialUtilitySpatial(makeMolotovPkg(), TEST_ASSETS);
    const t1 = u.get("T1")!;
    expect(t1.actualIncendiaryDisplacementEvents).toBe(1); // site weight 1.0
    expect(t1.actualIncendiaryPathDelaySeconds).toBeGreaterThan(0);
    // 无 visibility → LOS 两项发 null
    expect(t1.actualSmokeProtectedCrossings).toBeNull();
    expect(t1.actualSmokeSightlineDenialSeconds).toBeNull();
  });

  it("returns an empty map without zone assets", () => {
    const noZones: SpatialAssets = { ...TEST_ASSETS, zones: null, available: { ...TEST_ASSETS.available, zones: false } };
    expect(buildOfficialUtilitySpatial(makeMolotovPkg(), noZones).size).toBe(0);
  });
});

describe("UtilitySpatial end-to-end on de_ancient (nav-detour isolation, no tri)", () => {
  it("attributes real grenades and derives nav-backed isolation; LOS null without tri", () => {
    const pkg = deAncientPkg!;
    const assets = loadSpatialAssets("de_ancient"); // 不传 tri → visibility null
    expect(assets.available.zones).toBe(true);
    expect(assets.available.nav).toBe(true);

    const windows = buildUtilityWindows(pkg, assets);
    expect(windows.filter((w) => w.zoneId != null).length / windows.length).toBeGreaterThan(0.5);

    const u = buildOfficialUtilitySpatial(pkg, assets);
    let isoTotal = 0;
    for (const v of u.values()) {
      expect(v.actualSmokeProtectedCrossings).toBeNull(); // 无 tri
      expect(v.actualSmokeSightlineDenialSeconds).toBeNull();
      expect(v.actualIncendiaryDisplacementEvents).toBeGreaterThanOrEqual(0);
      isoTotal += v.actualSmokeIsolationSeconds;
    }
    expect(isoTotal).toBeGreaterThan(0); // nav 绕路隔离应产出
  });
});

describe("UtilitySpatial LOS metrics on de_ancient (tri-backed)", () => {
  it("derives non-null sightline denial / protected crossings when tri-BVH is available", () => {
    const tri = getMapTri("de_ancient");
    if (!tri) {
      // 本机未下载 ~/.awpy/tris/de_ancient.tri → 跳过（CI 无 tri）
      return;
    }
    const pkg = deAncientPkg!;
    const assets = loadSpatialAssets("de_ancient", tri);
    expect(assets.available.visibility).toBe(true);

    const u = buildOfficialUtilitySpatial(pkg, assets);
    let sightTotal = 0;
    for (const v of u.values()) {
      expect(v.actualSmokeSightlineDenialSeconds).not.toBeNull();
      expect(v.actualSmokeProtectedCrossings).not.toBeNull();
      sightTotal += v.actualSmokeSightlineDenialSeconds ?? 0;
    }
    expect(sightTotal).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
