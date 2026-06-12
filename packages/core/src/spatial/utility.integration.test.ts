import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DemoPackage } from "@cs2dak/contract";
import { getMapTri } from "@cs2dak/maps/tri-assets";
import { loadDemoPackageFromZip } from "../loader.js";
import { loadSpatialAssets } from "./annotate.js";
import { buildOfficialUtilitySpatial } from "./utility.js";

let deAncientPkg: DemoPackage | null = null;

beforeAll(async () => {
  const zip = await readFile(fileURLToPath(new URL("../../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url)));
  deAncientPkg = await loadDemoPackageFromZip(zip);
}, 30_000);

describe("UtilitySpatial LOS metrics on real fixture (tri-backed)", () => {
  it("derives non-null sightline denial / protected crossings when tri-BVH is available", () => {
    const pkg = deAncientPkg!;
    const mapName = pkg.match.mapName;
    const tri = getMapTri(mapName);
    if (!tri) {
      // 本机未下载 ~/.awpy/tris/{mapName}.tri -> 跳过（CI 无 tri）
      return;
    }
    const assets = loadSpatialAssets(mapName, tri);
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
