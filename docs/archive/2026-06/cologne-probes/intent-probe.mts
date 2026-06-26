/**
 * 意图聚类探针：验证「开局承诺」聚类 vs 当前「下包/残局」聚类。
 * 量化用户发现的两个污染源：
 *   (1) targetSite 用 plant 主判 → 残局转点回合被错标到 plant 的那个点。
 *   (2) chokeCombo 取「全程任一玩家踩过的口子」→ 4-1 散兵被当成双口夹击。
 *
 *   pnpm exec tsx scripts/cologne/intent-probe.mts
 * 只读。grid=null。
 */
import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, extractTacticalRoundFacts, type TacticalRoundFact } from "../../packages/core/src/index.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES = [
  "fixtures/demos/pro/IEM-Cologne-Major-2026/_build/maps/*.zip",
  "fixtures/output/pro/*.zip",
  "fixtures/output/nju-rivals-2026/**/*.zip",
];
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

// 开局承诺点：开局窗口 5 人区域分布的主导方向（margin≥2 才算明确）。
function intentSite(f: TacticalRoundFact): "a" | "b" | "mid" | "split" | null {
  const { a, b, mid } = f.openingPattern.regionCounts;
  if (a === 0 && b === 0 && mid === 0) return null;
  if (a >= b + 2 && a >= mid) return "a";
  if (b >= a + 2 && b >= mid) return "b";
  if (mid >= 3 && mid > a && mid > b) return "mid";
  return "split";
}

// 当前 targetSite（plant 主判 → 残局污染）。
function currentTarget(f: TacticalRoundFact): "a" | "b" | null {
  return f.targetSite;
}

// 承诺口子：意图点上、按进入人数加权后，达到「真实承诺」门槛(≥2人 或 ≥40%进点人数)的口子。
function committedChokes(f: TacticalRoundFact, site: "a" | "b"): { all: string[]; dominant: string[]; entrants: number } {
  const counts = new Map<string, number>();
  for (const occ of f.siteEntries[site].order) {
    if (occ.entryChokeId) counts.set(occ.entryChokeId, (counts.get(occ.entryChokeId) ?? 0) + 1);
  }
  const entrants = [...counts.values()].reduce((s, n) => s + n, 0);
  const all = [...counts.keys()].sort();
  const threshold = Math.max(2, Math.ceil(entrants * 0.4));
  const dominant = [...counts.entries()].filter(([, n]) => n >= threshold).map(([id]) => id).sort();
  return { all, dominant: dominant.length ? dominant : all.slice(0, 1), entrants };
}

const files = SOURCES.flatMap((g) => globSync(g, { cwd: ROOT })).map((f) => resolve(ROOT, f));
const facts: TacticalRoundFact[] = [];
let failed = 0;
for (const file of files) {
  try {
    const pkg = await loadDemoPackageFromZip(readFileSync(file).buffer as ArrayBuffer);
    facts.push(...extractTacticalRoundFacts(pkg, { calloutGrid: null }));
  } catch { failed += 1; }
}
const T = facts.filter((f) => f.side === "t");
console.log(`# 意图聚类探针\nZIP ${files.length}（失败 ${failed}）  T 回合 ${T.length}\n`);

// ── 1. plant/残局污染 ──────────────────────────────────────────────────────
console.log(`## 1. 当前 targetSite(plant主判) vs 开局承诺点 的分歧\n`);
let clearIntent = 0, disagree = 0, intentNullButPlant = 0;
const disagreeRows: TacticalRoundFact[] = [];
for (const f of T) {
  const intent = intentSite(f);
  const cur = currentTarget(f);
  if (intent === "a" || intent === "b") {
    clearIntent += 1;
    if (cur && cur !== intent) { disagree += 1; disagreeRows.push(f); }
  }
  if (intent == null && cur != null) intentNullButPlant += 1;
}
console.log(`  开局承诺明确(A或B) 的回合：${clearIntent}  ${pct(clearIntent, T.length)}`);
console.log(`  其中当前 targetSite 与承诺点**相反**（残局/转点污染）：${disagree}  ${pct(disagree, clearIntent)}`);
console.log(`  开局无人就位但 plant 仍给了点：${intentNullButPlant}\n`);
console.log(`  分歧样例（前 8）：`);
for (const f of disagreeRows.slice(0, 8)) {
  const c = f.openingPattern.regionCounts;
  console.log(`    ${f.matchId.slice(0, 18).padEnd(18)} R${String(f.roundNumber).padStart(2)} 开局A${c.a}/M${c.mid}/B${c.b} → 承诺${intentSite(f)} 但plant=${f.targetSite} ${f.plant ? "(下包)" : ""}`);
}

// ── 2. 假双口（散兵被当夹击）─────────────────────────────────────────────────
console.log(`\n## 2. chokeCombo「全程任一口子」的假双口率\n`);
let withCombo = 0, multiAll = 0, fakeDouble = 0, realSplit = 0;
for (const f of T) {
  const site = intentSite(f);
  if (site !== "a" && site !== "b") continue;
  const { all, dominant, entrants } = committedChokes(f, site);
  if (entrants === 0) continue;
  withCombo += 1;
  if (all.length >= 2) {
    multiAll += 1;
    if (dominant.length === 1) fakeDouble += 1; else realSplit += 1;
  }
}
console.log(`  有进点的承诺回合：${withCombo}`);
console.log(`  当前会判成「≥2口组合」：${multiAll}  ${pct(multiAll, withCombo)}`);
console.log(`    其中**假双口**（去散兵后只剩1主口）：${fakeDouble}  ${pct(fakeDouble, multiAll)}`);
console.log(`    真分推/夹击（≥2口各≥门槛）：${realSplit}  ${pct(realSplit, multiAll)}\n`);

// ── 3. 单例率：当前 vs 意图方案 ─────────────────────────────────────────────
function statsOf(keyFn: (f: TacticalRoundFact) => string | null) {
  const m = new Map<string, number>();
  let used = 0;
  for (const f of T) {
    const k = keyFn(f);
    if (!k) continue;
    used += 1;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const sizes = [...m.values()];
  const singles = sizes.filter((s) => s === 1).length;
  const usable = sizes.filter((s) => s >= 3).length;
  return { clusters: m.size, avg: used / (m.size || 1), singlePct: pct(singles, m.size), usable, used };
}
function ecoEntry(f: TacticalRoundFact): string {
  if (f.economy === "pistol") return "pistol";
  if (f.economy === "full") return f.opponentEconomy === "full" ? "gun" : "anti";
  return f.economy;
}
console.log(`## 3. 单例率：当前(plant点+全口) vs 意图(承诺点+主口)\n`);
const cur = statsOf((f) => {
  const s = f.targetSite ?? null;
  if (!s) return `${f.mapName}|${ecoEntry(f)}|none`;
  const all = committedChokes(f, s).all;
  return `${f.mapName}|${ecoEntry(f)}|${s}|${all.join("+") || "-"}`;
});
const intent = statsOf((f) => {
  const s = intentSite(f);
  if (s === "mid") return `${f.mapName}|${ecoEntry(f)}|mid`;
  if (s === "split" || s == null) return `${f.mapName}|${ecoEntry(f)}|split`;
  const dom = committedChokes(f, s).dominant;
  return `${f.mapName}|${ecoEntry(f)}|${s}|${dom.join("+") || "rush"}`;
});
const show = (name: string, st: ReturnType<typeof statsOf>) =>
  console.log(`  ${name.padEnd(22)} 簇${String(st.clusters).padStart(4)} 均${st.avg.toFixed(1)} 单例${st.singlePct.padStart(6)} 可用(≥3)${String(st.usable).padStart(4)} 覆盖${st.used}`);
show("当前 plant点+全口", cur);
show("意图 承诺点+主口", intent);
