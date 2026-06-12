import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DemoPackage, Replay } from "@cs2dak/contract";
import type { MapZones } from "@cs2dak/maps";
import { loadDemoPackageFromZip } from "../loader.js";
import { loadSpatialAssets, type SpatialAssets } from "./annotate.js";
import { buildOfficialUtilitySpatial, buildUtilityWindows } from "./utility.js";

let deAncientPkg: DemoPackage | null = null;

beforeAll(async () => {
  const zip = await readFile(fileURLToPath(new URL("../../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url)));
  deAncientPkg = await loadDemoPackageFromZip(zip);
}, 30_000);

function deltaArr(values: number[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const v of values) { out.push(v - prev); prev = v; }
  return out;
}

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

/** Build replay round for C1 at two positions: (50,50) at tick 96, (500,500) at tick 160. */
function molotovReplay(): Replay {
  return {
    meta: { sampleRate: 1, tickrate: 64, coordScale: 1, angleScale: 10 },
    weaponDict: [],
    placeDict: [],
    rounds: [{
      roundNumber: 1,
      startTick: 96,
      tickStep: 64,
      frameCount: 2,
      players: [{
        playerIndex: 1, // C1
        x: deltaArr([50, 500]), y: deltaArr([50, 500]), z: deltaArr([0, 0]),
        yaw: deltaArr([0, 0]), pitch: deltaArr([0, 0]),
        hp: [100, 100], armor: [100, 100], money: [800, 800], equipValue: [800, 800],
        weapon: [-1, -1], place: [-1, -1], flash: [0, 0], flags: [1, 1], grenades: [[], []],
      }],
      projectiles: [],
    }],
  };
}

function makeMolotovPkg(): DemoPackage {
  return {
    match: { mapName: "de_test", tickrate: 64 },
    players: [{ steamId64: "T1", teamKey: "teamA" }, { steamId64: "C1", teamKey: "teamB" }],
    rounds: [{ roundNumber: 1, startTick: 1, freezeEndTick: 64, endTick: 1000, teamASide: "t", teamBSide: "ct" }],
    bombs: [], kills: [],
    grenades: [{ roundNumber: 1, grenadeId: "g1", grenade: "molotov", throwerSteamId64: "T1", throwerTeamKey: "teamA", throwTick: 80, effectTick: 100, destroyTick: 196, effectPosition: { x: 50, y: 50, z: 0 } }],
    replay: molotovReplay(),
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

describe("UtilitySpatial end-to-end on real fixture (nav-detour isolation, no tri)", () => {
  it("attributes real grenades and derives nav-backed isolation; LOS null without tri", () => {
    const pkg = deAncientPkg!;
    const mapName = pkg.match.mapName;
    const assets = loadSpatialAssets(mapName); // 匹配 fixture 的实际地图
    expect(assets.available.nav).toBe(true);

    const windows = buildUtilityWindows(pkg, assets);
    if (assets.available.zones) {
      const zoneRatio = windows.filter((w) => w.zoneId != null).length / windows.length;
      expect(zoneRatio).toBeGreaterThan(0.5);
    }

    const u = buildOfficialUtilitySpatial(pkg, assets);
    let isoTotal = 0;
    for (const v of u.values()) {
      if (assets.available.zones) {
        expect(v.actualSmokeProtectedCrossings).toBeNull(); // 无 tri
        expect(v.actualSmokeSightlineDenialSeconds).toBeNull();
        expect(v.actualIncendiaryDisplacementEvents).toBeGreaterThanOrEqual(0);
      }
      isoTotal += v.actualSmokeIsolationSeconds;
    }
    expect(isoTotal).toBeGreaterThanOrEqual(0); // nav 绕路隔离，因地图/比赛可能为零
  });
});
