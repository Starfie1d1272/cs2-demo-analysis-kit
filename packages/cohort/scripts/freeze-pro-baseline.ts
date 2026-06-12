#!/usr/bin/env tsx
/**
 * freeze-pro-baseline — 从一批职业 demo 的 v3 ZIP 冻结固定职业基准曲线参数。
 *
 * 背景见 docs/archive/2026-06/pro-baseline.md。当前 cohort 归一化是「赛季相对」（在被分析这批人
 * 内部 z-score + 残差化 + 按 std(rrV1) 缩放），分数不可移植、单 demo 无法绝对评分。
 * 本脚本把该归一化的**参数**从职业样本里固化下来，使任意单张 demo 可对同一把尺子量：
 *
 *   每账户 a：mean_a, std_a（standardize 参数）
 *   非 combat 账户 a：slope_a = corr(z_a, z_combat)（残差化斜率，正交于 combat）
 *   全局：scale = std(rrV1) / std(composite)（对齐 HLTV 刻度）
 *
 * 冻结后单 player-map 的绝对 RR（FrozenProBaselineNormalizer 复现这套数学）：
 *   z_a        = (raw_a − mean_a) / std_a
 *   used_combat= z_combat
 *   used_a     = (z_a − slope_a·z_combat) / sqrt(1 − slope_a²)   // 解析式再标准化
 *   composite  = Σ_a w_a · used_a
 *   RR         = max(clamp.min, 1 + scale · composite)
 *
 * 同时导出每个 raw 账户的分位数表（CDF），为 v1 的 percentile-mapping / sigmoid
 * 尾部饱和方案预留数据；并打印分布偏度，辅助判断 v0 是否需要尾部饱和。
 *
 * 用法：
 *   pnpm exec tsx scripts/freeze-pro-baseline.ts <zip-dir> --out <baseline.json> [--version <tag>]
 */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, parse } from "node:path";
import {
  deriveRRIndicators,
  computeAccountRatingsV2,
  loadDemoPackageFromZip
} from "@cs2dak/core";
import {
  computeRR,
  hltv2BaselineWeightsV1,
  rrSixAccountWeightsV1,
  RR_ACCOUNTS
} from "@rivalhub/rival-rating";
import type { RRAccountKey, RRSixAccountWeights } from "@rivalhub/rival-rating";

const ACCOUNTS = RR_ACCOUNTS;
type Account = RRAccountKey;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function pstd(xs: number[]): number {
  const m = mean(xs);
  return xs.length ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length) : 0;
}
function standardize(xs: number[], m: number, s: number): number[] {
  return s > 1e-9 ? xs.map((x) => (x - m) / s) : xs.map(() => 0);
}
function corr(a: number[], b: number[]): number {
  const n = a.length;
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    sa += (a[i] - ma) ** 2;
    sb += (b[i] - mb) ** 2;
  }
  return sa > 0 && sb > 0 ? cov / Math.sqrt(sa * sb) : 0;
}
function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
function skewness(xs: number[]): number {
  const m = mean(xs);
  const s = pstd(xs);
  if (s < 1e-9) return 0;
  return mean(xs.map((x) => ((x - m) / s) ** 3));
}

async function main() {
  const [zipDir, ...rest] = process.argv.slice(2);
  if (!zipDir) {
    console.error("usage: freeze-pro-baseline.ts <zip-dir> --out <baseline.json> [--version <tag>]");
    process.exit(1);
  }
  const outIdx = rest.indexOf("--out");
  const outPath = outIdx >= 0 ? rest[outIdx + 1] : "rr-v2-pro-baseline-v0.json";
  const verIdx = rest.indexOf("--version");
  const version = verIdx >= 0 ? rest[verIdx + 1] : "pro_baseline_cs2_2026H1_v0_provisional";

  const weights = rrSixAccountWeightsV1 as unknown as RRSixAccountWeights;
  const w = weights.accountWeights;

  const zipNames = (await readdir(zipDir)).filter((n) => extname(n).toLowerCase() === ".zip").sort();
  if (zipNames.length === 0) throw new Error(`No .zip in ${zipDir}`);

  // ── 采集每个 player-map 的 raw 账户 + rrV1 ──────────────────────────────
  const raw = Object.fromEntries(ACCOUNTS.map((account) => [account, []])) as Record<Account, number[]>;
  const rrV1: number[] = [];
  const mapsByName = new Map<string, number>();

  for (const name of zipNames) {
    const pkg = await loadDemoPackageFromZip(await readFile(join(zipDir, name)));
    const ratings = computeAccountRatingsV2(pkg); // [{ signals, rr }]
    const indicators = deriveRRIndicators(pkg);
    const rrBySt = new Map(indicators.map((row) => [row.steamId64, computeRR(row, hltv2BaselineWeightsV1 as never).rr]));
    const mapName = parse(name).name.split("_").slice(0, 3).join("_"); // date_de_map
    mapsByName.set(mapName, (mapsByName.get(mapName) ?? 0) + 1);
    for (const { signals, rr } of ratings) {
      const v1 = rrBySt.get(signals.steamId64);
      if (v1 === undefined) continue;
      for (const a of ACCOUNTS) raw[a].push(w[a] !== 0 ? rr.accounts[a] / w[a] : 0);
      rrV1.push(v1);
    }
  }
  const n = rrV1.length;

  // ── 冻结 standardize 参数 + 残差化斜率 ─────────────────────────────────
  const params: Record<Account, { mean: number; std: number; slope: number; skew: number; percentiles: number[] }> =
    {} as never;
  const z: Record<Account, number[]> = {} as never;
  for (const a of ACCOUNTS) {
    const m = mean(raw[a]);
    const s = pstd(raw[a]);
    z[a] = standardize(raw[a], m, s);
    const sorted = [...raw[a]].sort((x, y) => x - y);
    const pcts = Array.from({ length: 21 }, (_, i) => quantile(sorted, i / 20));
    params[a] = { mean: m, std: s, slope: 0, skew: skewness(raw[a]), percentiles: pcts };
  }
  const zc = z.combat;
  for (const a of ACCOUNTS) {
    if (a === "combat") continue;
    params[a].slope = corr(z[a], zc); // 两者标准化 → corr = 残差化斜率
  }

  // ── composite + scale（对齐 std(rrV1)）──────────────────────────────────
  const used: Record<Account, number[]> = {} as never;
  used.combat = zc;
  for (const a of ACCOUNTS) {
    if (a === "combat") continue;
    const sl = params[a].slope;
    const denom = Math.sqrt(Math.max(1e-9, 1 - sl * sl));
    used[a] = z[a].map((v, i) => (v - sl * zc[i]) / denom);
  }
  const composite = Array.from({ length: n }, (_, i) =>
    ACCOUNTS.reduce((s, a) => s + w[a] * used[a][i], 0)
  );
  const targetStd = pstd(rrV1);
  const scale = pstd(composite) > 1e-9 ? targetStd / pstd(composite) : 0;

  // ── 自检：用冻结参数回测职业 cohort（应复现 mean≈1.0, std≈targetStd）──────
  const rrFrozen = composite.map((c) => Math.max(weights.clamp.min, 1 + scale * c));
  const selfMean = mean(rrFrozen);
  const selfStd = pstd(rrFrozen);

  const baseline = {
    version,
    generatedAt: new Date().toISOString(),
    note: "PROVISIONAL v0 — 24 张职业 map / " + n + " player-map 行；仅供 R0 接口工程验证，非权威职业标尺。扩到 100–200 张后出 v1。",
    source: {
      maps: zipNames.length,
      playerMapRows: n,
      mapCoverage: Object.fromEntries([...mapsByName.entries()].sort()),
      weightsVersion: weights.version,
      rrV1WeightsVersion: (hltv2BaselineWeightsV1 as { version: string }).version
    },
    accountWeights: w,
    clamp: weights.clamp,
    scale,
    targetStd,
    anchor: 1.0,
    accounts: params,
    selfCheck: { frozenMean: selfMean, frozenStd: selfStd, targetStd }
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(baseline, null, 2) + "\n", "utf-8");

  // ── 报告 ────────────────────────────────────────────────────────────────
  console.log(`maps=${zipNames.length}  player-map rows=${n}`);
  console.log(`scale=${scale.toFixed(4)}  targetStd=${targetStd.toFixed(4)}`);
  console.log(`self-check  frozenMean=${selfMean.toFixed(4)} (期望≈1.0)  frozenStd=${selfStd.toFixed(4)} (期望≈${targetStd.toFixed(4)})`);
  console.log("\n账户 raw 分布 + 残差化斜率 + 偏度：");
  for (const a of ACCOUNTS) {
    const p = params[a];
    console.log(
      `  ${a.padEnd(9)} mean=${p.mean.toFixed(4)} std=${p.std.toFixed(4)} slope(vs combat)=${p.slope.toFixed(3)} skew=${p.skew.toFixed(2)}`
    );
  }
  console.log(`\nwrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
