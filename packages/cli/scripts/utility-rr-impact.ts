/**
 * 道具空间指标对 RR 的影响分析。对比三档配置（per-match 锚定，均值=1.0）：
 *   A 基线（pre-spatial）：strategicIsolationDeaths=null + utility 空间指标=null
 *   B 当前（production）  ：strategicIsolationDeaths 接 Trade 闭环（utility 空间仍 null）
 *   C +道具空间（实验）   ：B + 把 actual-effect 填进 utility 账户的 3 个空间字段
 *
 * 报告 RR 位移幅度、对「道具型选手」的奖励方向（相关性）、指标分布质量、Top movers。
 *   pnpm exec tsx packages/cli/scripts/utility-rr-impact.ts  （从 cli 包）
 *   pnpm --filter @cs2dak/cli exec tsx scripts/utility-rr-impact.ts [--per-map N]
 */
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDemoPackageFromZip,
  deriveRRSignals,
  loadSpatialAssets,
  buildOfficialUtilitySpatial,
} from "@cs2dak/core";
import { getMapTri } from "@cs2dak/maps/tri-assets";
import { computeCohortAccountsRR, rrSixAccountWeightsV1 } from "@rivalhub/rival-rating";
import type { RRSignals, RRSixAccountWeights } from "@rivalhub/rival-rating";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ZONE_MAPS = new Set(["de_ancient", "de_dust2", "de_inferno", "de_mirage"]);
const WEIGHTS = rrSixAccountWeightsV1 as unknown as RRSixAccountWeights;

interface Row {
  rrA: number; rrB: number; rrC: number;
  utilA: number; utilC: number;
  rounds: number;
  utilityDamage: number; nades: number; flashAssists: number;
  iso: number; pathDelay: number; disp: number; // per-match 原值
  map: string; steamId64: string;
}

function clone(s: RRSignals): RRSignals {
  return structuredClone(s);
}

async function main() {
  const args = process.argv.slice(2);
  const perMapIdx = args.indexOf("--per-map");
  const perMap = perMapIdx >= 0 ? Number(args[perMapIdx + 1]) : 4;
  const dir = join(REPO_ROOT, "fixtures/output/nju-rivals-2026");
  const files = (await readdir(dir)).filter((n) => extname(n).toLowerCase() === ".zip").sort();

  const picked = new Map<string, string[]>();
  for (const n of files) {
    const m = n.match(/(de_[a-z0-9]+)/)?.[1] ?? "";
    if (!ZONE_MAPS.has(m)) continue;
    const arr = picked.get(m) ?? [];
    if (arr.length < perMap) arr.push(n);
    picked.set(m, arr);
  }

  const rows: Row[] = [];
  for (const [m, list] of picked) {
    for (const file of list) {
      const pkg = await loadDemoPackageFromZip(await readFile(join(dir, file)));
      const mapName = pkg.match?.mapName ?? m;
      const assets = loadSpatialAssets(mapName, getMapTri(mapName));
      const signals = deriveRRSignals(pkg); // B（含 strategicIsolationDeaths）
      const util = buildOfficialUtilitySpatial(pkg, assets);
      const nadesByPlayer = countNades(pkg);

      const sigA = signals.map((s) => {
        const c = clone(s);
        c.trade.strategicIsolationDeaths = null;
        nullUtilSpatial(c);
        return c;
      });
      // B（当前 production）：保留 strategicIsolationDeaths，仅 utility 空间字段为 null
      const sigB = signals.map((s) => { const c = clone(s); nullUtilSpatial(c); return c; });
      const sigC = signals.map((s) => {
        const c = clone(s);
        nullUtilSpatial(c);
        const u = util.get(s.steamId64);
        if (u) {
          c.utility.smokeIsolationSeconds = u.actualSmokeIsolationSeconds;
          c.utility.incendiaryPathDelayUnits = u.actualIncendiaryPathDelaySeconds;
          c.utility.incendiaryDisplacementEvents = u.actualIncendiaryDisplacementEvents;
          c.utility.smokeSightlineDenialSeconds = u.actualSmokeSightlineDenialSeconds; // LOS（null 时保持 null）
          c.utility.smokeProtectedCrossings = u.actualSmokeProtectedCrossings;
        }
        return c;
      });

      const rrA = byId(computeCohortAccountsRR(sigA, WEIGHTS));
      const rrB = byId(computeCohortAccountsRR(sigB, WEIGHTS));
      const rrC = byId(computeCohortAccountsRR(sigC, WEIGHTS));

      for (const s of signals) {
        const a = rrA.get(s.steamId64); const b = rrB.get(s.steamId64); const cc = rrC.get(s.steamId64);
        const u = util.get(s.steamId64);
        if (!a || !b || !cc) continue;
        rows.push({
          rrA: a.rr, rrB: b.rr, rrC: cc.rr,
          utilA: b.accounts.utility, utilC: cc.accounts.utility,
          rounds: s.rounds,
          utilityDamage: s.utility.utilityDamage ?? 0,
          nades: nadesByPlayer.get(s.steamId64) ?? 0,
          flashAssists: s.utility.flashAssists ?? 0,
          iso: u?.actualSmokeIsolationSeconds ?? 0,
          pathDelay: u?.actualIncendiaryPathDelaySeconds ?? 0,
          disp: u?.actualIncendiaryDisplacementEvents ?? 0,
          map: m, steamId64: s.steamId64,
        });
      }
    }
  }

  report(rows, perMap);
}

function report(rows: Row[], perMap: number) {
  const n = rows.length;
  const dAB = rows.map((r) => r.rrB - r.rrA); // Trade 闭环
  const dBC = rows.map((r) => r.rrC - r.rrB); // 道具空间
  const dAC = rows.map((r) => r.rrC - r.rrA); // 合计

  console.log(`\n=== 道具空间指标对 RR 的影响（4 张标定图，每图 ${perMap} 场，${n} 人次）===\n`);
  console.log("锚定后均值=1.0；正负相消，看的是“相对再分配”幅度。\n");
  console.log("配置对比            mean|Δ|   maxΔ    p90|Δ|  #|Δ|>.02  #|Δ|>.05");
  printDelta("A→B  Trade 闭环", dAB);
  printDelta("B→C  +道具空间 ", dBC);
  printDelta("A→C  合计      ", dAC);

  // 质量①：道具空间是否奖励“道具型选手”？相关性应为正。
  const nadeRate = rows.map((r) => r.nades / Math.max(1, r.rounds));
  const udmgRate = rows.map((r) => r.utilityDamage / Math.max(1, r.rounds));
  console.log("\n质量① 道具空间 ΔRR(B→C) 与“道具投入”的相关性（应>0 = 奖励对了人）：");
  console.log("  corr(ΔRR, 烟+火/round)   =", pearson(dBC, nadeRate).toFixed(3));
  console.log("  corr(ΔRR, 道具伤害/round)=", pearson(dBC, udmgRate).toFixed(3));
  console.log("  corr(ΔRR, 烟雾隔离秒)    =", pearson(dBC, rows.map((r) => r.iso)).toFixed(3));

  // 质量②：3 个新指标分布（per-round）——是否退化（大多 0）还是有信息量。
  console.log("\n质量② 新指标分布（per-round；%zero 高=信息量低）：");
  metricDist("烟雾隔离秒/round", rows.map((r) => r.iso / Math.max(1, r.rounds)));
  metricDist("火焰延迟秒/round", rows.map((r) => r.pathDelay / Math.max(1, r.rounds)));
  metricDist("火焰逼退/round  ", rows.map((r) => r.disp / Math.max(1, r.rounds)));

  // 质量③：Top movers（道具空间加分最多），核对是否合理。
  console.log("\n质量③ 道具空间 Top 8 加分选手（ΔRR(B→C) 降序）：");
  console.log("  ΔRR     RR:B→C      map        udmg/r  烟火数  isoS  pathS  disp");
  [...rows].sort((a, b) => (b.rrC - b.rrB) - (a.rrC - a.rrB)).slice(0, 8).forEach((r) => {
    console.log(
      "  " + sign(r.rrC - r.rrB) + "  " + r.rrB.toFixed(2) + "→" + r.rrC.toFixed(2) +
      "   " + r.map.padEnd(11) + (r.utilityDamage / Math.max(1, r.rounds)).toFixed(1).padStart(6) +
      String(r.nades).padStart(7) + r.iso.toFixed(0).padStart(6) + r.pathDelay.toFixed(0).padStart(7) + r.disp.toFixed(0).padStart(6),
    );
  });

  // 质量④：utility 账户本身的位移。
  const utilB = rows.map((r) => r.utilA); const utilC = rows.map((r) => r.utilC);
  console.log("\n质量④ utility 账户分（加权后）均值/标准差：");
  console.log("  B:", mean(utilB).toFixed(4), "±", std(utilB).toFixed(4), " → C:", mean(utilC).toFixed(4), "±", std(utilC).toFixed(4));
  console.log();
}

function printDelta(label: string, d: number[]) {
  const abs = d.map(Math.abs).sort((a, b) => a - b);
  const maxAbs = Math.max(...d.map(Math.abs));
  const max = d.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
  console.log(
    "  " + label + " " + mean(abs).toFixed(4).padStart(8) + sign(max).padStart(8) +
    pct(abs, 0.9).toFixed(4).padStart(9) + String(d.filter((v) => Math.abs(v) > 0.02).length).padStart(8) +
    String(d.filter((v) => Math.abs(v) > 0.05).length).padStart(9),
  );
}

function metricDist(label: string, v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  const zero = (v.filter((x) => x === 0).length / v.length) * 100;
  console.log("  " + label + " mean=" + mean(v).toFixed(3) + " p50=" + pct(s, 0.5).toFixed(3) + " p90=" + pct(s, 0.9).toFixed(3) + " max=" + Math.max(...v).toFixed(2) + " %zero=" + zero.toFixed(0) + "%");
}

function countNades(pkg: { grenades?: Array<{ throwerSteamId64?: string | null; grenade?: string }> }): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of pkg.grenades ?? []) {
    if (!g.throwerSteamId64) continue;
    if (g.grenade !== "smoke" && g.grenade !== "molotov" && g.grenade !== "incendiary") continue;
    out.set(g.throwerSteamId64, (out.get(g.throwerSteamId64) ?? 0) + 1);
  }
  return out;
}

function nullUtilSpatial(s: RRSignals) {
  s.utility.smokeProtectedCrossings = null;
  s.utility.smokeSightlineDenialSeconds = null;
  s.utility.smokeIsolationSeconds = null;
  s.utility.incendiaryPathDelayUnits = null;
  s.utility.incendiaryDisplacementEvents = null;
}

function byId(rs: Array<{ steamId64: string; rr: number; accounts: Record<string, number> }>) {
  return new Map(rs.map((r) => [r.steamId64, r]));
}

function mean(v: number[]) { return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length); }
function std(v: number[]) { const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); }
function pct(sorted: number[], p: number) { return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0; }
function sign(v: number) { return (v >= 0 ? "+" : "") + v.toFixed(4); }
function pearson(a: number[], b: number[]) {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i]! - ma, y = b[i]! - mb; num += x * y; da += x * x; db += y * y; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
