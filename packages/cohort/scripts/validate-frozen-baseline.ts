#!/usr/bin/env tsx
/**
 * validate-frozen-baseline — 端到端验证冻结职业基准可独立用于单 demo 绝对评分。
 *
 * 用真实产出的 baseline JSON 喂 rival-rating 的 computeFrozenProBaselineRR，
 * 在职业样本上应复现 mean≈1.0；并演示「单张 demo 独立评分」（不需要 cohort）。
 *
 * 注意：本脚本从**本地 rival-rating 源码**按绝对路径导入 computeFrozenProBaselineRR，
 * 因为 core/cohort 仍 pin 在旧 github commit；正式接线需 re-pin（见 pro-baseline.md）。
 *
 * 用法：
 *   pnpm exec tsx scripts/validate-frozen-baseline.ts <zip-dir> <baseline.json>
 */
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { deriveAccountSignalsV2, loadDemoPackageFromZip } from "@cs2dak/core";
import { computeFrozenProBaselineRR, rrValueAccountsV2Lite } from "@rivalhub/rival-rating";

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function pstd(xs: number[]) {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

async function main() {
  const [zipDir, baselinePath] = process.argv.slice(2);
  const baseline = JSON.parse(await readFile(baselinePath, "utf-8"));
  const weights = rrValueAccountsV2Lite as never;

  const zipNames = (await readdir(zipDir)).filter((n) => extname(n).toLowerCase() === ".zip").sort();
  const all: number[] = [];
  let firstDemoScores: { name: string; rr: number }[] = [];

  for (const name of zipNames) {
    const pkg = await loadDemoPackageFromZip(await readFile(join(zipDir, name)));
    const signals = deriveAccountSignalsV2(pkg);
    // 单张 demo 独立评分：只喂这张图的选手 signals，不构成任何 cohort
    const scored = signals.map((s) => computeFrozenProBaselineRR(s, weights, baseline).rr);
    all.push(...scored);
    if (firstDemoScores.length === 0) {
      firstDemoScores = signals.map((s, i) => ({ name: s.steamId64, rr: scored[i] }));
    }
  }

  console.log(`baseline=${baseline.version}`);
  console.log(`player-map rows scored (each demo independently)=${all.length}`);
  console.log(`frozen mean=${mean(all).toFixed(4)} (期望≈1.0)  std=${pstd(all).toFixed(4)} (期望≈${baseline.scale && baseline.accounts ? "targetStd" : "?"})`);
  console.log(`min=${Math.min(...all).toFixed(3)}  max=${Math.max(...all).toFixed(3)}`);
  console.log(`\n单 demo 独立评分演示（第一张图，证明无需 cohort）：`);
  for (const r of firstDemoScores.sort((a, b) => b.rr - a.rr)) {
    console.log(`  ${r.name}  RR=${r.rr.toFixed(3)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
