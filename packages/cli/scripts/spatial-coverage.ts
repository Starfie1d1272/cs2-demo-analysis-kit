/**
 * 空间分析覆盖诊断：扫一批 v2 ZIP，按地图报告 zone 标定覆盖、手雷归属率、
 * UtilitySpatial actual-effect 与 MapControl official 指标产出。
 *
 * 用途：验证新标定的图是否「跑通」、发现 zone/route 缺口。
 *   pnpm analyze:spatial-coverage [-- <zip-dir> --per-map N]
 * 默认目录 fixtures/output/nju-rivals-2026，每图取前 N=5 场。
 */
import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDemoPackageFromZip,
  loadSpatialAssets,
  buildUtilityWindows,
  buildOfficialUtilitySpatial,
  buildOfficialMapControl,
} from "@cs2dak/core";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

interface MapAgg {
  games: number; zones: boolean; routes: boolean; grenades: number; attributed: number;
  displacement: number; isolationSeconds: number; pathDelaySeconds: number;
  isolationDeaths: number; soloPressureSeconds: number; denialSeconds: number; firstControlEvents: number;
}

function emptyAgg(): MapAgg {
  return {
    games: 0, zones: false, routes: false, grenades: 0, attributed: 0,
    displacement: 0, isolationSeconds: 0, pathDelaySeconds: 0, isolationDeaths: 0,
    soloPressureSeconds: 0, denialSeconds: 0, firstControlEvents: 0,
  };
}

function mapOf(name: string): string {
  return name.match(/(de_[a-z0-9]+)/)?.[1] ?? "unknown";
}

async function main() {
  const args = process.argv.slice(2);
  const perMapIdx = args.indexOf("--per-map");
  const perMap = perMapIdx >= 0 ? Number(args[perMapIdx + 1]) : 5;
  const dirArg = args.find((a, i) => !a.startsWith("--") && i !== perMapIdx + 1);
  const dir = dirArg ? resolve(REPO_ROOT, dirArg) : join(REPO_ROOT, "fixtures/output/nju-rivals-2026");

  const all = (await readdir(dir)).filter((n) => extname(n).toLowerCase() === ".zip").sort();
  const byMap = new Map<string, string[]>();
  for (const n of all) {
    const arr = byMap.get(mapOf(n)) ?? [];
    if (arr.length < perMap) arr.push(n);
    byMap.set(mapOf(n), arr);
  }

  const aggs = new Map<string, MapAgg>();
  for (const [m, files] of [...byMap].sort()) {
    const agg = emptyAgg();
    for (const file of files) {
      const pkg = await loadDemoPackageFromZip(await readFile(join(dir, file)));
      const assets = loadSpatialAssets(pkg.match?.mapName ?? m);
      agg.zones = assets.available.zones;
      agg.routes = assets.available.routes;

      const windows = buildUtilityWindows(pkg, assets);
      agg.grenades += windows.length;
      agg.attributed += windows.filter((w) => w.zoneId != null).length;
      for (const u of buildOfficialUtilitySpatial(pkg, assets).values()) {
        agg.displacement += u.actualIncendiaryDisplacementEvents;
        agg.isolationSeconds += u.actualSmokeIsolationSeconds;
        agg.pathDelaySeconds += u.actualIncendiaryPathDelaySeconds;
      }
      for (const mc of buildOfficialMapControl(pkg, assets).values()) {
        agg.isolationDeaths += mc.strategicIsolationDeaths;
        agg.soloPressureSeconds += mc.activeSoloPressureSeconds;
        agg.denialSeconds += mc.sidePhaseAwareDenialSeconds;
        agg.firstControlEvents += mc.firstMeaningfulControlEvents;
      }
      agg.games += 1;
    }
    aggs.set(m, agg);
  }

  const f = (n: number) => n.toFixed(1).padStart(8);
  console.log("\n=== 空间分析覆盖诊断（每图前 " + perMap + " 场，目录 " + dir + "）===\n");
  console.log("map          games zones routes  gren  attr%  |  disp  isoS  pathS  | isoDth  soloS  denS  firstC");
  for (const [m, a] of [...aggs].sort()) {
    const attrPct = a.grenades ? ((a.attributed / a.grenades) * 100).toFixed(0) : "  -";
    console.log(
      m.padEnd(13) + String(a.games).padStart(5) + (a.zones ? "   ✓" : "   ·") + (a.routes ? "     ✓" : "     ·") +
        String(a.grenades).padStart(6) + attrPct.padStart(6) + "%" +
        "  |" + f(a.displacement) + f(a.isolationSeconds) + f(a.pathDelaySeconds) +
        "  |" + f(a.isolationDeaths) + f(a.soloPressureSeconds) + f(a.denialSeconds) + String(a.firstControlEvents).padStart(7),
    );
  }
  console.log("\n图例：disp=火焰逼退  isoS=烟雾隔离秒  pathS=火焰路径延迟秒  isoDth=战略孤立死亡credit  soloS=独控秒  denS=denial秒  firstC=首控次数");
  console.log("zones=· 未标定多边形 → UtilitySpatial 全 null；attr%=手雷 effectPosition→zone 归属率（低=zone 覆盖有缺口）\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
