import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DemoPackage } from "@cs2dak/contract";
import type { MapZones } from "@cs2dak/maps";
import { loadDemoPackageFromZip } from "../loader.js";
import type { SpatialAssets } from "./annotate.js";
import { buildOfficialUtilitySpatial, buildUtilityWindows } from "./utility.js";

// 合成 1 个方形 A 点 zone，绕过真实 polygon 直接测逼退/隔离逻辑。
const SITE_ZONES: MapZones = {
  mapName: "de_test",
  version: "t",
  zones: [{ id: "a_site", name: "A", role: "site", bombsite: "a", polygon: [[0, 0], [100, 0], [100, 100], [0, 100]] }],
};
const TEST_ASSETS: SpatialAssets = {
  mapName: "de_test",
  routes: null,
  zones: SITE_ZONES,
  nav: null,
  visibility: null,
  available: { routes: false, zones: true, nav: false, visibility: false },
};

function pos(tick: number, steamId64: string, teamKey: string, x: number, y: number) {
  return { roundNumber: 1, tick, steamId64, teamKey, side: teamKey === "teamA" ? "t" : "ct", alive: true, position: { x, y, z: 0 }, lastPlaceName: null };
}

function makePkg(type: "molotov" | "smoke"): DemoPackage {
  return {
    match: { mapName: "de_test", tickrate: 64 },
    players: [
      { steamId64: "T1", teamKey: "teamA" },
      { steamId64: "C1", teamKey: "teamB" },
    ],
    rounds: [{ roundNumber: 1, startTick: 1, freezeEndTick: 64, endTick: 1000, teamASide: "t", teamBSide: "ct" }],
    bombs: [],
    kills: [],
    grenades: [{
      roundNumber: 1, grenadeId: "g1", grenade: type,
      throwerSteamId64: "T1", throwerTeamKey: "teamA",
      throwTick: 80, effectTick: 100, destroyTick: 196,
      effectPosition: { x: 50, y: 50, z: 0 },
    }],
    positions1s: [
      pos(96, "C1", "teamB", 50, 50), // 火/烟前在 A 点内
      pos(160, "C1", "teamB", 500, 500), // 之后离开（窗口内）
    ],
  } as unknown as DemoPackage;
}

describe("buildUtilityWindows (zone attribution, doc §18)", () => {
  it("attributes a grenade to its effectPosition zone", () => {
    const windows = buildUtilityWindows(makePkg("molotov"), TEST_ASSETS);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.zoneId).toBe("a_site");
    expect(windows[0]!.zoneRole).toBe("site");
    expect(windows[0]!.type).toBe("molotov");
  });
});

describe("buildOfficialUtilitySpatial (zone-based actual-effect)", () => {
  it("counts incendiary displacement when an enemy leaves the fire zone", () => {
    const u = buildOfficialUtilitySpatial(makePkg("molotov"), TEST_ASSETS);
    const t1 = u.get("T1")!;
    expect(t1.actualIncendiaryDisplacementEvents).toBe(1); // site weight 1.0
    expect(t1.actualIncendiaryPathDelaySeconds).toBeGreaterThan(0); // (196-100)/64 × 1.0 = 1.5
    // LOS 依赖项发 null
    expect(t1.actualSmokeProtectedCrossings).toBeNull();
    expect(t1.actualSmokeSightlineDenialSeconds).toBeNull();
  });

  it("counts smoke isolation seconds when an enemy is in the smoked zone", () => {
    const u = buildOfficialUtilitySpatial(makePkg("smoke"), TEST_ASSETS);
    const t1 = u.get("T1")!;
    expect(t1.actualSmokeIsolationSeconds).toBeGreaterThan(0);
    expect(t1.actualIncendiaryDisplacementEvents).toBe(0);
  });

  it("returns an empty map without zone assets", () => {
    const noZones: SpatialAssets = { ...TEST_ASSETS, zones: null, available: { ...TEST_ASSETS.available, zones: false } };
    expect(buildOfficialUtilitySpatial(makePkg("molotov"), noZones).size).toBe(0);
  });
});

describe("UtilitySpatial end-to-end on de_ancient fixture (zone-labeled map)", () => {
  it("attributes real grenades to zones and derives actual-effect signals", async () => {
    const { loadSpatialAssets } = await import("./annotate.js");
    const zip = await readFile(fileURLToPath(new URL("../../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const assets = loadSpatialAssets("de_ancient");
    expect(assets.available.zones).toBe(true);

    const windows = buildUtilityWindows(pkg, assets);
    expect(windows.length).toBeGreaterThan(0);
    const attributed = windows.filter((w) => w.zoneId != null).length;
    // 大部分手雷应能归属到某个标定 zone（doc §18 比 nearest-player proxy 更准）
    expect(attributed / windows.length).toBeGreaterThan(0.5);

    const u = buildOfficialUtilitySpatial(pkg, assets);
    // 至少产出结构正确的 map（具体数值依赖真实 demo）
    for (const v of u.values()) {
      expect(v.actualSmokeProtectedCrossings).toBeNull();
      expect(v.actualIncendiaryDisplacementEvents).toBeGreaterThanOrEqual(0);
    }
  });
});
