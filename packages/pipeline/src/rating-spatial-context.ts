import type { DemoPackage } from "@cs2dak/contract";
import type { RatingSpatialContext } from "@cs2dak/analytics";
import { loadSpatialAssets, buildOfficialMapControl } from "@cs2dak/tactics";

/** Compute the spatial inputs selected by the rating workflow. */
export function buildRatingSpatialContext(pkg: DemoPackage): RatingSpatialContext {
  const assets = loadSpatialAssets(pkg.match.mapName ?? pkg.manifest.mapName);
  const control = buildOfficialMapControl(pkg, assets);
  return {
    observable: assets.routes != null && (pkg.replay?.rounds.length ?? 0) > 0,
    strategicIsolationDeaths: new Map([...control].map(([id, row]) => [id, row.strategicIsolationDeaths])),
  };
}

