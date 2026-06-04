#!/usr/bin/env tsx
/**
 * extract-routes — 从一批同图 v2 ZIP 半自动挖进攻动线。
 *
 * 一条动线 = T 方从匪家到包点的有序 callout 序列（见 src/routes.ts）。本脚本不直接
 * 产出 routes.json，而是打印三样供人工定稿：
 *   1. callout 词表：频次 / T 占比 / 质心(x,y) —— 谁的地盘、在哪。
 *   2. T 方开局(≤N 秒) callout 转移频次 —— 动线骨架（高频有序链）。
 *   3. 从 TSpawn 贪心展开的候选链 —— 直接当 routes.json 的 zones 初稿。
 *
 * 用法：
 *   pnpm exec tsx packages/maps/scripts/extract-routes.ts <zip-dir> [--window 45]
 *
 * 把输出里的候选链人工确认后写进 packages/maps/map-routes/<map>.json。
 */
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { loadDemoPackageFromZip } from "@cs2dak/core";

interface Sample {
  round: number;
  tick: number;
  side: string;
  steamId64: string;
  place: string;
  x: number;
  y: number;
}

async function loadSamples(zipDir: string): Promise<Sample[]> {
  const names = (await readdir(zipDir)).filter((n) => extname(n).toLowerCase() === ".zip");
  if (names.length === 0) throw new Error(`No .zip in ${zipDir}`);
  const out: Sample[] = [];
  let roundBase = 0;
  for (const name of names) {
    process.stderr.write(`  loading ${name}...`);
    const pkg = await loadDemoPackageFromZip(await readFile(join(zipDir, name)));
    const rows = pkg.positions1s ?? [];
    let maxRound = 0;
    for (const r of rows) {
      const place = r.lastPlaceName;
      if (!place || !r.position) continue;
      maxRound = Math.max(maxRound, r.roundNumber);
      out.push({
        round: roundBase + r.roundNumber,
        tick: r.tick,
        side: r.side,
        steamId64: r.steamId64,
        place,
        x: r.position.x,
        y: r.position.y,
      });
    }
    roundBase += maxRound;
    process.stderr.write(` ${rows.length} samples\n`);
  }
  return out;
}

function main(samples: Sample[], windowSec: number, tickrate = 64): void {
  const minTick = new Map<number, number>();
  for (const s of samples) {
    minTick.set(s.round, Math.min(minTick.get(s.round) ?? Infinity, s.tick));
  }

  // 1) callout 词表
  interface Agg { n: number; t: number; sx: number; sy: number }
  const agg = new Map<string, Agg>();
  for (const s of samples) {
    const a = agg.get(s.place) ?? { n: 0, t: 0, sx: 0, sy: 0 };
    a.n++;
    if (s.side === "t") a.t++;
    a.sx += s.x;
    a.sy += s.y;
    agg.set(s.place, a);
  }
  console.log(`# callout 词表（${samples.length} 采样）\n`);
  console.log(`| callout | count | T% | centroid(x,y) |`);
  console.log(`|---|---:|---:|---|`);
  for (const [pl, a] of [...agg].sort((x, y) => y[1].n - x[1].n)) {
    if (a.n < 30) continue;
    const tpct = Math.round((100 * a.t) / a.n);
    console.log(
      `| ${pl} | ${a.n} | ${tpct}% | (${(a.sx / a.n).toFixed(0)},${(a.sy / a.n).toFixed(0)}) |`,
    );
  }

  // 2) T 方开局转移
  const cutoff = windowSec * tickrate;
  const byPlayer = new Map<string, Sample[]>();
  for (const s of samples) {
    if (s.side !== "t") continue;
    if (s.tick - (minTick.get(s.round) ?? 0) > cutoff) continue;
    const key = `${s.round}:${s.steamId64}`;
    (byPlayer.get(key) ?? byPlayer.set(key, []).get(key)!).push(s);
  }
  const trans = new Map<string, number>();
  const next = new Map<string, Map<string, number>>();
  for (const seq of byPlayer.values()) {
    seq.sort((a, b) => a.tick - b.tick);
    let prev: string | null = null;
    for (const s of seq) {
      if (prev && prev !== s.place) {
        trans.set(`${prev}→${s.place}`, (trans.get(`${prev}→${s.place}`) ?? 0) + 1);
        const m = next.get(prev) ?? new Map();
        m.set(s.place, (m.get(s.place) ?? 0) + 1);
        next.set(prev, m);
      }
      prev = s.place;
    }
  }
  console.log(`\n# T 方开局(≤${windowSec}s) 高频转移\n`);
  for (const [k, c] of [...trans].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.log(`  ${k} ×${c}`);
  }

  // 3) 候选动线（贪心）
  console.log("\n# 候选动线\n");
  const starts = [...(next.get("TSpawn")?.keys() ?? [])]
    .sort((a, b) => (next.get("TSpawn")!.get(b) ?? 0) - (next.get("TSpawn")!.get(a) ?? 0))
    .slice(0, 5);
  for (const first of starts) {
    const chain = ["TSpawn", first];
    const seen = new Set(chain);
    let cur = first;
    while (!cur.startsWith("Bombsite") && chain.length < 8) {
      const m = next.get(cur);
      if (!m) break;
      const nxt = [...m].sort((a, b) => b[1] - a[1]).find(([p]) => !seen.has(p));
      if (!nxt) break;
      chain.push(nxt[0]);
      seen.add(nxt[0]);
      cur = nxt[0];
    }
    console.log(`  TSpawn → ${chain.slice(1).join(" → ")}`);
  }

  // 4) 参考：Bombsite 的前驱（哪些 callout 直接连到包点）
  console.log("\n# 包点入度\n");
  for (const site of ["BombsiteA", "BombsiteB"]) {
    const incoming = [...trans].filter(([k]) => k.endsWith(`→${site}`)).sort((a, b) => b[1] - a[1]);
    if (incoming.length === 0) continue;
    console.log(`  ${site} ←`);
    for (const [k, c] of incoming.slice(0, 5)) {
      const src = k.split("→")[0];
      console.log(`    ${src} ×${c}`);
    }
  }
}

const zipDir = process.argv[2];
const winFlag = process.argv.indexOf("--window");
const windowSec = winFlag > 0 ? Number(process.argv[winFlag + 1]) : 45;
if (!zipDir) {
  console.error("usage: tsx extract-routes.ts <zip-dir> [--window 45]");
  process.exit(1);
}
main(await loadSamples(zipDir), windowSec);
