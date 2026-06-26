/**
 * 一次性聚类探针：拿真实 v3 ZIP 跑 extractTacticalRoundFacts，
 * 报告各种「聚类 key 方案」的簇数 / 平均每簇回合 / 单例率，
 * 以及经济上下文分布、targetSite 判定率与 fallback 回收潜力。
 *
 *   pnpm exec tsx scripts/cologne/cluster-probe.mts
 *
 * 只读，不写任何文件。grid=null（经济/打点/开局结构不依赖 grid；手雷区域会偏 unknown，单列说明）。
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, extractTacticalRoundFacts, type TacticalRoundFact } from "../../packages/core/src/index.ts";
import { loadCalloutGrid } from "../../packages/maps/src/callout-grid-node.ts";

const gridCache = new Map<string, ReturnType<typeof loadCalloutGrid>>();
function gridFor(mapName: string) {
  if (!gridCache.has(mapName)) gridCache.set(mapName, loadCalloutGrid(mapName));
  return gridCache.get(mapName) ?? null;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const SOURCES: Array<{ label: string; glob: string }> = [
  { label: "科隆Major-Stage1", glob: "fixtures/demos/pro/IEM-Cologne-Major-2026/_build/maps/*.zip" },
  { label: "职业(pro)", glob: "fixtures/output/pro/*.zip" },
  { label: "NJU联赛", glob: "fixtures/output/nju-rivals-2026/**/*.zip" },
];

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";
}

// 区域分布签名：开局 5 人粗分布，如 "2-1-2"(A-Mid-B)
function regionDist(f: TacticalRoundFact): string {
  const c = f.openingPattern.regionCounts;
  return `${c.a}-${c.mid}-${c.b}`;
}
function dominantRegion(f: TacticalRoundFact): "a" | "b" | "mid" | null {
  const c = f.openingPattern.regionCounts;
  const max = Math.max(c.a, c.mid, c.b);
  if (max === 0) return null;
  const top = [["a", c.a], ["mid", c.mid], ["b", c.b]].filter(([, v]) => (v as number) === max);
  return top.length === 1 ? (top[0]![0] as "a" | "b" | "mid") : null;
}
// 经济上下文：本方 × 对方
function ecoCtx(f: TacticalRoundFact): string {
  return `${f.economy}/${f.opponentEconomy}`;
}
// 备战入口口径（设计稿 §经济与装备）
function ecoEntry(f: TacticalRoundFact): string {
  if (f.economy === "pistol") return "手枪局";
  if (f.economy === "full" && f.opponentEconomy === "full") return "长枪局";
  if (f.economy === "full") return "Anti-eco";
  if (f.economy === "force") return "强起";
  if (f.economy === "semi") return "半起";
  return "Eco";
}

interface KeyScheme { name: string; key: (f: TacticalRoundFact) => string | null; side?: "t" | "ct"; }

function clusterStats(facts: TacticalRoundFact[], scheme: KeyScheme) {
  const pool = scheme.side ? facts.filter((f) => f.side === scheme.side) : facts;
  const counts = new Map<string, number>();
  let skipped = 0;
  for (const f of pool) {
    const k = scheme.key(f);
    if (k == null) { skipped += 1; continue; }
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const sizes = [...counts.values()];
  const total = sizes.reduce((a, b) => a + b, 0);
  const singletons = sizes.filter((s) => s === 1).length;
  const usable = sizes.filter((s) => s >= 3).length; // ≥3 回合才算「可成战术」
  return {
    clusters: counts.size,
    rounds: total,
    avg: counts.size > 0 ? (total / counts.size) : 0,
    singletonPct: pct(singletons, counts.size),
    usableClusters: usable,
    coveredPct: pct([...counts.values()].filter((s) => s >= 3).reduce((a, b) => a + b, 0), total),
    skipped,
  };
}

async function main() {
  const files: Array<{ path: string; src: string }> = [];
  for (const s of SOURCES) {
    for (const p of globSync(s.glob, { cwd: ROOT })) files.push({ path: resolve(ROOT, p), src: s.label });
  }
  console.log(`# 真实数据聚类探针\n`);
  console.log(`ZIP 总数：${files.length}（${SOURCES.map((s) => `${s.label} ${globSync(s.glob, { cwd: ROOT }).length}`).join(" / ")}）\n`);

  const facts: TacticalRoundFact[] = [];
  const perMap = new Map<string, number>();
  let failed = 0;
  for (const { path } of files) {
    try {
      const pkg = await loadDemoPackageFromZip(readFileSync(path));
      const rows = extractTacticalRoundFacts(pkg, { matchId: basename(path, ".zip"), calloutGrid: gridFor(pkg.match.mapName) });
      facts.push(...rows);
      perMap.set(pkg.match.mapName, (perMap.get(pkg.match.mapName) ?? 0) + 1);
    } catch (e) {
      failed += 1;
      console.error(`! 跳过 ${basename(path)}: ${e instanceof Error ? e.message : e}`);
    }
  }
  const tFacts = facts.filter((f) => f.side === "t");
  const ctFacts = facts.filter((f) => f.side === "ct");
  console.log(`解析成功 ${files.length - failed}/${files.length} 场，共 **${facts.length}** 条回合事实（T ${tFacts.length} / CT ${ctFacts.length}）`);
  console.log(`地图分布：${[...perMap.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m.replace("de_", "")} ${n}`).join(" / ")}\n`);

  // ── 1. 经济上下文 ─────────────────────────────
  console.log(`## 1. 经济上下文（T 方，本方/对方）\n`);
  const ecoCount = new Map<string, number>();
  for (const f of tFacts) ecoCount.set(ecoCtx(f), (ecoCount.get(ecoCtx(f)) ?? 0) + 1);
  for (const [k, n] of [...ecoCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${k.padEnd(16)} ${String(n).padStart(5)}  ${pct(n, tFacts.length)}`);
  }
  console.log(`\n### 备战入口口径（T 方）\n`);
  const entryCount = new Map<string, number>();
  for (const f of tFacts) entryCount.set(ecoEntry(f), (entryCount.get(ecoEntry(f)) ?? 0) + 1);
  for (const [k, n] of [...entryCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(10)} ${String(n).padStart(5)}  ${pct(n, tFacts.length)}`);
  }

  // ── 2. targetSite 判定率 + fallback 回收 ─────────────────────────────
  console.log(`\n## 2. T 方 targetSite 判定（当前：下包→进点人数多数）\n`);
  const withTarget = tFacts.filter((f) => f.targetSite != null).length;
  const planted = tFacts.filter((f) => f.plant != null).length;
  console.log(`  有目标点：${withTarget}/${tFacts.length}  ${pct(withTarget, tFacts.length)}`);
  console.log(`  其中下包：${planted}  ${pct(planted, tFacts.length)}`);
  const nullTarget = tFacts.filter((f) => f.targetSite == null);
  console.log(`  目标点=null（落进「进攻开局」桶）：${nullTarget.length}  ${pct(nullTarget.length, tFacts.length)}`);
  // fallback 回收潜力
  const byC4 = nullTarget.filter((f) => f.c4Route?.endRegion === "a" || f.c4Route?.endRegion === "b").length;
  const byOpening = nullTarget.filter((f) => dominantRegion(f) === "a" || dominantRegion(f) === "b").length;
  const byEither = nullTarget.filter((f) => {
    const c4 = f.c4Route?.endRegion;
    const op = dominantRegion(f);
    return c4 === "a" || c4 === "b" || op === "a" || op === "b";
  }).length;
  console.log(`\n  null 中可被 fallback 回收：`);
  console.log(`    C4 轨迹末端 A/B：${byC4}  ${pct(byC4, nullTarget.length)}`);
  console.log(`    开局主导区 A/B：${byOpening}  ${pct(byOpening, nullTarget.length)}`);
  console.log(`    两者合计（任一）：${byEither}  ${pct(byEither, nullTarget.length)}`);
  console.log(`  → 加 fallback 后剩余真·无目标：${nullTarget.length - byEither}  ${pct(nullTarget.length - byEither, tFacts.length)}（其中多少是 eco/save？见下）`);
  const nullEco = nullTarget.filter((f) => f.economy === "eco" || f.economy === "pistol").length;
  console.log(`  null 中本方 eco/pistol 占：${nullEco}  ${pct(nullEco, nullTarget.length)}`);

  // ── 3. 聚类 key 方案对比 ─────────────────────────────
  console.log(`\n## 3. 聚类 key 方案对比（簇数 / 平均回合 / 单例率 / ≥3回合可用簇 / 覆盖率）\n`);
  const dom = (f: TacticalRoundFact) => f.targetSite ?? dominantRegion(f); // 带 fallback 的目标点
  const ecoBucket = (f: TacticalRoundFact) => (f.economy === "pistol" ? "pistol" : f.economy === "full" ? "gun" : "lowbuy");
  const tSchemes: KeyScheme[] = [
    { name: "T│当前完整 key（粗+细签名+点+进点）", side: "t", key: (f) => [f.mapName, f.openingPattern.coarseSignature, f.openingPattern.detailedSignature, f.targetSite ?? "-"].join(":") },
    { name: "T│map + 目标点(原)", side: "t", key: (f) => `${f.mapName}:${f.targetSite ?? "-"}` },
    { name: "T│map + 目标点(带fallback)", side: "t", key: (f) => `${f.mapName}:${dom(f) ?? "-"}` },
    { name: "T│map + 目标点 + 经济入口", side: "t", key: (f) => `${f.mapName}:${dom(f) ?? "-"}:${ecoEntry(f)}` },
    { name: "T│map + 目标点 + 经济3档", side: "t", key: (f) => `${f.mapName}:${dom(f) ?? "-"}:${ecoBucket(f)}` },
    { name: "T│map + 目标点 + 开局spread", side: "t", key: (f) => `${f.mapName}:${dom(f) ?? "-"}:${f.openingPattern.spread}` },
  ];
  const ctSchemes: KeyScheme[] = [
    { name: "CT│当前完整 key（粗+细签名）", side: "ct", key: (f) => [f.mapName, f.openingPattern.coarseSignature, f.openingPattern.detailedSignature].join(":") },
    { name: "CT│map + 站位分布(A-Mid-B)", side: "ct", key: (f) => `${f.mapName}:${regionDist(f)}` },
    { name: "CT│map + spread", side: "ct", key: (f) => `${f.mapName}:${f.openingPattern.spread}` },
    { name: "CT│map + 站位分布 + 经济入口", side: "ct", key: (f) => `${f.mapName}:${regionDist(f)}:${ecoEntry(f)}` },
  ];
  const report = (schemes: KeyScheme[], pool: TacticalRoundFact[]) => {
    for (const s of schemes) {
      const st = clusterStats(pool, s);
      console.log(`  ${s.name.padEnd(34)} 簇${String(st.clusters).padStart(4)}  均${st.avg.toFixed(1).padStart(5)}  单例${st.singletonPct.padStart(6)}  可用簇${String(st.usableClusters).padStart(4)}  覆盖${st.coveredPct.padStart(6)}`);
    }
  };
  report(tSchemes, tFacts);
  console.log("");
  report(ctSchemes, ctFacts);

  // ── 4. 单队可行性（挑回合最多的队）─────────────────────────────
  console.log(`\n## 4. 单队样本量（教练页是按队过滤的，看单队下方案够不够分）\n`);
  const teamRounds = new Map<string, number>();
  for (const f of facts) teamRounds.set(f.teamName, (teamRounds.get(f.teamName) ?? 0) + 1);
  const topTeams = [...teamRounds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [team, n] of topTeams) {
    const tf = facts.filter((f) => f.teamName === team && f.side === "t");
    const st = clusterStats(tf, { name: "", key: (f) => `${f.mapName}:${dom(f) ?? "-"}:${ecoBucket(f)}` });
    const st2 = clusterStats(tf, { name: "", key: (f) => `${f.mapName}:${dom(f) ?? "-"}` });
    console.log(`  ${team.padEnd(22)} T${String(tf.length).padStart(4)}回合 │ map+点+经济3档: 簇${st.clusters} 均${st.avg.toFixed(1)} 可用${st.usableClusters} │ map+点: 簇${st2.clusters} 均${st2.avg.toFixed(1)} 可用${st2.usableClusters}`);
  }

  // ── 5. 三级维度（在「长枪局 × map+目标点」分区内）─────────────────────────────
  console.log(`\n## 5. 三级聚类维度探索（前提：长枪局 + 已判出目标点的 T 回合）\n`);
  // 锁定二级分区已成立的样本：长枪局 + 目标点 A/B（带 fallback）
  const tier12 = tFacts.filter((f) => ecoEntry(f) === "长枪局" && (dom(f) === "a" || dom(f) === "b"));
  console.log(`分区内样本：${tier12.length} 个长枪进攻回合\n`);

  // 取目标点的进点结构（仅当 targetSite 原生判出时 siteEntries 才可靠；fallback 点没有进点）
  const entryOf = (f: TacticalRoundFact) => {
    const site = f.targetSite; // 只有原生目标点有真实进点结构
    return site ? f.siteEntries[site] : null;
  };
  // 进点口数覆盖率
  const withEntry = tier12.filter((f) => entryOf(f) && entryOf(f)!.entrants > 0);
  const chokeResolved = withEntry.filter((f) => (entryOf(f)!.distinctEntryChokeIds?.length ?? 0) > 0);
  console.log(`有真实进点(entrants>0)：${withEntry.length}/${tier12.length}  ${pct(withEntry.length, tier12.length)}`);
  console.log(`其中至少一个口子被判定(entryChokeId≠null)：${chokeResolved.length}  ${pct(chokeResolved.length, withEntry.length)}\n`);

  // 候选三级维度
  const chokeCount = (f: TacticalRoundFact) => entryOf(f)?.distinctEntryChokeIds?.length ?? 0;
  const breadthLabel = (f: TacticalRoundFact) => {
    const c = chokeCount(f);
    if (c <= 0) return "口子未判定";
    if (c === 1) return "单口";
    if (c === 2) return "双口夹击";
    return "多口(≥3)";
  };
  const spanBucket = (f: TacticalRoundFact) => {
    const s = entryOf(f)?.entrySpanSec;
    if (s == null) return "无";
    if (s <= 2) return "同步(≤2s)";
    if (s <= 5) return "小错峰(2-5s)";
    return "拉开(>5s)";
  };
  const execTempo = (f: TacticalRoundFact) => {
    const r = entryOf(f)?.executeRemainSec;
    if (r == null) return "无二进";
    if (r > 95) return "rush";
    if (r > 70) return "fast";
    if (r > 40) return "mid";
    return "late";
  };
  const entrantsBucket = (f: TacticalRoundFact) => {
    const n = entryOf(f)?.entrants ?? 0;
    return n >= 4 ? "4-5人压上" : n >= 2 ? "2-3人进" : n === 1 ? "单人进" : "无进点";
  };
  // 入口组合（具体哪几个口，排序集合）
  const chokeSet = (f: TacticalRoundFact) => {
    const ids = entryOf(f)?.distinctEntryChokeIds ?? [];
    return ids.length ? [...ids].sort().join("+") : "?";
  };

  const dist = (label: string, fn: (f: TacticalRoundFact) => string) => {
    const m = new Map<string, { n: number; won: number }>();
    for (const f of tier12) {
      const k = fn(f);
      const cur = m.get(k) ?? { n: 0, won: 0 };
      cur.n += 1; if (f.won) cur.won += 1;
      m.set(k, cur);
    }
    console.log(`### ${label}`);
    for (const [k, v] of [...m.entries()].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`  ${k.padEnd(16)} ${String(v.n).padStart(5)}  ${pct(v.n, tier12.length).padStart(6)}  胜率${pct(v.won, v.n).padStart(6)}`);
    }
    console.log("");
  };
  dist("进点口数(夹击信号)", breadthLabel);
  dist("进点同步度(entrySpan)", spanBucket);
  dist("第二人进点节奏(执行tempo)", execTempo);
  dist("进点人数", entrantsBucket);

  // 三级 key 方案：在 map+点 之上再加一维，看簇粒度
  console.log(`### 三级 key 方案对比（基线 = map+目标点；样本=长枪局分区）`);
  const t3 = (extra: (f: TacticalRoundFact) => string) => (f: TacticalRoundFact) => `${f.mapName}:${dom(f)}:${extra(f)}`;
  const schemes3: Array<{ name: string; fn: (f: TacticalRoundFact) => string }> = [
    { name: "map+点（基线）", fn: (f) => `${f.mapName}:${dom(f)}` },
    { name: "+进点口数(单/双/多)", fn: t3(breadthLabel) },
    { name: "+进点同步度", fn: t3(spanBucket) },
    { name: "+执行tempo", fn: t3(execTempo) },
    { name: "+进点人数", fn: t3(entrantsBucket) },
    { name: "+具体入口组合", fn: t3(chokeSet) },
  ];
  for (const s of schemes3) {
    const st = clusterStats(tier12, { name: "", key: s.fn });
    console.log(`  ${s.name.padEnd(22)} 簇${String(st.clusters).padStart(4)}  均${st.avg.toFixed(1).padStart(5)}  单例${st.singletonPct.padStart(6)}  可用簇${String(st.usableClusters).padStart(4)}  覆盖${st.coveredPct.padStart(6)}`);
  }

  // ── 6. 道具前置维度（爆弹 vs 裸冲）需 grid ─────────────────────────────
  console.log(`\n## 6. 道具前置维度（执行前砸向目标点的成组道具；样本=长枪局分区）\n`);
  const norm = (t: string) => {
    const s = t.toLowerCase();
    if (s.includes("smoke")) return "smoke";
    if (s.includes("flash")) return "flash";
    if (s.includes("molot") || s.includes("incend") || s.includes("fire")) return "fire";
    if (s.includes("he") || s.includes("frag") || s.includes("grenade")) return "he";
    return "other";
  };
  // 命中目标点 & 在二进/下包前(+3s 缓冲, 按 64tick 估)落地的道具
  const siteUtil = (f: TacticalRoundFact) => {
    const site = f.targetSite;
    if (!site) return null;
    const execRef = f.siteEntries[site].secondEntryTick ?? f.plant?.tick ?? null;
    const types = new Set<string>();
    let any = 0;
    for (const g of f.grenades) {
      if (g.targetRegion !== site) continue;
      const eff = g.effectTick ?? g.throwTick;
      if (execRef != null && eff != null && eff > execRef + 192) continue;
      any += 1;
      types.add(norm(g.type));
    }
    return { types, count: any };
  };
  const utilBucket = (f: TacticalRoundFact) => {
    const u = siteUtil(f);
    if (!u) return "无目标点";
    const hasSmoke = u.types.has("smoke"), hasFlash = u.types.has("flash"), hasFire = u.types.has("fire");
    if (u.count === 0) return "裸冲(无道具)";
    if (hasSmoke && hasFlash) return "爆弹(烟+闪)";
    if (hasSmoke && hasFire) return "烟+火封锁";
    if (hasSmoke) return "仅烟";
    if (hasFlash) return "仅闪";
    return "仅火/雷";
  };
  // 道具覆盖检查：命中目标点的道具占比（验证 grid 生效）
  const gren = tier12.flatMap((f) => f.grenades);
  const targeted = gren.filter((g) => g.targetRegion === "a" || g.targetRegion === "b" || g.targetRegion === "mid");
  console.log(`分区内手雷总数 ${gren.length}，落点区域已判定(a/b/mid) ${targeted.length}  ${pct(targeted.length, gren.length)}（grid 生效验证）\n`);
  dist("道具前置(爆弹/裸冲)", utilBucket);

  // 二维交叉：进点口数 × 道具前置（看是否互补/共线）
  console.log(`### 交叉表：进点口数 × 道具前置（胜率）`);
  const breadthKeys = ["单口", "双口夹击", "多口(≥3)"];
  const utilKeys = ["爆弹(烟+闪)", "烟+火封锁", "仅烟", "仅闪", "仅火/雷", "裸冲(无道具)"];
  const grid2: Record<string, Record<string, { n: number; w: number }>> = {};
  for (const f of tier12) {
    const b = breadthLabel(f), u = utilBucket(f);
    if (!breadthKeys.includes(b) || !utilKeys.includes(u)) continue;
    grid2[b] ??= {};
    grid2[b]![u] ??= { n: 0, w: 0 };
    grid2[b]![u]!.n += 1; if (f.won) grid2[b]![u]!.w += 1;
  }
  console.log(`  ${"".padEnd(12)}${utilKeys.map((u) => u.slice(0, 6).padStart(11)).join("")}`);
  for (const b of breadthKeys) {
    const cells = utilKeys.map((u) => {
      const c = grid2[b]?.[u];
      return (c ? `${c.n}/${pct(c.w, c.n).replace("%", "")}` : "—").padStart(11);
    });
    console.log(`  ${b.padEnd(12)}${cells.join("")}`);
  }

  // 三级 key：进点口数 + 道具 各自/合并
  console.log(`\n### 含道具的三级 key 方案`);
  for (const s of [
    { name: "map+点+进点口数", fn: t3(breadthLabel) },
    { name: "map+点+道具前置", fn: t3(utilBucket) },
    { name: "map+点+口数+道具", fn: t3((f) => `${breadthLabel(f)}/${utilBucket(f)}`) },
  ]) {
    const st = clusterStats(tier12, { name: "", key: s.fn });
    console.log(`  ${s.name.padEnd(22)} 簇${String(st.clusters).padStart(4)}  均${st.avg.toFixed(1).padStart(5)}  单例${st.singletonPct.padStart(6)}  可用簇${String(st.usableClusters).padStart(4)}  覆盖${st.coveredPct.padStart(6)}`);
  }

  // ── 7. CT 三级维度（前压行为）─────────────────────────────
  console.log(`\n## 7. CT 三级维度探索（前提：长枪局 CT 回合）\n`);
  const ctPool = ctFacts.filter((f) => ecoEntry(f) === "长枪局");
  console.log(`分区内样本：${ctPool.length} 个长枪 CT 回合\n`);

  // 前压：离开默认位、推进到前方/对方默认区的事件（forward / deep）
  const pushers = (f: TacticalRoundFact) => {
    const fwd = new Set<number>(), deep = new Set<number>();
    for (const e of f.openingPressure) {
      if (e.kind === "deep") deep.add(e.playerIndex);
      else if (e.kind === "forward") fwd.add(e.playerIndex);
    }
    return { fwd, deep, total: new Set([...fwd, ...deep]) };
  };
  const depthBucket = (f: TacticalRoundFact) => {
    const p = pushers(f);
    if (p.deep.size > 0) return "深入前压";
    if (p.fwd.size > 0) return "前压";
    return "站防(无前压)";
  };
  const countBucket = (f: TacticalRoundFact) => {
    const n = pushers(f).total.size;
    return n >= 2 ? "多人前压(≥2)" : n === 1 ? "单人前压" : "站防(0)";
  };
  const pressDir = (f: TacticalRoundFact) => {
    const m = new Map<string, number>();
    for (const e of f.openingPressure) if (e.primaryRegion) m.set(e.primaryRegion, (m.get(e.primaryRegion) ?? 0) + 1);
    if (m.size === 0) return "无";
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]);
    return top.length > 1 && top[0]![1] === top[1]![1] ? "多向" : `压${top[0]![0].toUpperCase()}`;
  };

  // 覆盖：多少 CT 回合有前压事件
  const withPress = ctPool.filter((f) => pushers(f).total.size > 0).length;
  console.log(`有前压事件的 CT 回合：${withPress}/${ctPool.length}  ${pct(withPress, ctPool.length)}\n`);

  const distCT = (label: string, fn: (f: TacticalRoundFact) => string) => {
    const m = new Map<string, { n: number; won: number }>();
    for (const f of ctPool) {
      const k = fn(f);
      const cur = m.get(k) ?? { n: 0, won: 0 };
      cur.n += 1; if (f.won) cur.won += 1;
      m.set(k, cur);
    }
    console.log(`### ${label}`);
    for (const [k, v] of [...m.entries()].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`  ${k.padEnd(16)} ${String(v.n).padStart(5)}  ${pct(v.n, ctPool.length).padStart(6)}  胜率${pct(v.won, v.n).padStart(6)}`);
    }
    console.log("");
  };
  distCT("站位分布(二级, A-Mid-B)", (f) => regionDist(f));
  distCT("前压深度(站防/前压/深入)", depthBucket);
  distCT("前压人数", countBucket);
  distCT("前压方向", pressDir);

  console.log(`### CT 三级 key 方案对比（基线=map+站位分布）`);
  const ct3 = (extra: (f: TacticalRoundFact) => string) => (f: TacticalRoundFact) => `${f.mapName}:${regionDist(f)}:${extra(f)}`;
  for (const s of [
    { name: "map+站位（基线）", fn: (f: TacticalRoundFact) => `${f.mapName}:${regionDist(f)}` },
    { name: "+前压深度", fn: ct3(depthBucket) },
    { name: "+前压人数", fn: ct3(countBucket) },
    { name: "+前压方向", fn: ct3(pressDir) },
    { name: "+深度+方向", fn: ct3((f) => `${depthBucket(f)}/${pressDir(f)}`) },
  ]) {
    const st = clusterStats(ctPool, { name: "", key: s.fn });
    console.log(`  ${s.name.padEnd(18)} 簇${String(st.clusters).padStart(4)}  均${st.avg.toFixed(1).padStart(5)}  单例${st.singletonPct.padStart(6)}  可用簇${String(st.usableClusters).padStart(4)}  覆盖${st.coveredPct.padStart(6)}`);
  }

  // 粗化二级：重防倾向（偏A/偏B/均分/中控），相对计数而非精确分布
  const lean = (f: TacticalRoundFact) => {
    const c = f.openingPattern.regionCounts;
    if (c.mid >= 3) return "中路重心";
    if (c.a >= c.b + 2) return "重防A";
    if (c.b >= c.a + 2) return "重防B";
    if (c.a > c.b) return "偏A";
    if (c.b > c.a) return "偏B";
    return "均分";
  };
  console.log(`\n### 粗化二级：重防倾向分布`);
  distCT("重防倾向", lean);
  console.log(`### CT 粗化二级 key 方案`);
  for (const s of [
    { name: "map+重防倾向", fn: (f: TacticalRoundFact) => `${f.mapName}:${lean(f)}` },
    { name: "map+重防倾向+前压深度", fn: (f: TacticalRoundFact) => `${f.mapName}:${lean(f)}:${depthBucket(f)}` },
    { name: "map+重防倾向+前压方向", fn: (f: TacticalRoundFact) => `${f.mapName}:${lean(f)}:${pressDir(f)}` },
  ]) {
    const st = clusterStats(ctPool, { name: "", key: s.fn });
    console.log(`  ${s.name.padEnd(22)} 簇${String(st.clusters).padStart(4)}  均${st.avg.toFixed(1).padStart(5)}  单例${st.singletonPct.padStart(6)}  可用簇${String(st.usableClusters).padStart(4)}  覆盖${st.coveredPct.padStart(6)}`);
  }

  // 单队 CT 可行性
  console.log(`\n### 单队 CT 样本量`);
  for (const [team] of topTeams) {
    const cf = ctPool.filter((f) => f.teamName === team);
    const a = clusterStats(cf, { name: "", key: ct3(depthBucket) });
    const b = clusterStats(cf, { name: "", key: (f) => `${f.mapName}:${lean(f)}` });
    const c = clusterStats(cf, { name: "", key: (f) => `${f.mapName}:${lean(f)}:${depthBucket(f)}` });
    console.log(`  ${team.padEnd(20)} CT${String(cf.length).padStart(3)} │ 精确站位+前压: 簇${a.clusters}/均${a.avg.toFixed(1)}/可用${a.usableClusters} │ 重防倾向: 簇${b.clusters}/均${b.avg.toFixed(1)}/可用${b.usableClusters} │ 倾向+前压: 簇${c.clusters}/均${c.avg.toFixed(1)}/可用${c.usableClusters}`);
  }

  // ── 8. 进点路线「词汇量」：每图每点真正反复出现的 choke 组合有几种 ──────────
  console.log(`\n## 8. 进点路线词汇量（每图每点的 chokeId 组合频次；判断命名词典规模）\n`);
  // 用全经济 T 回合 + 原生目标点 + 有进点，最大化词汇覆盖
  const named = tFacts.filter((f) => f.targetSite && f.siteEntries[f.targetSite].entrants > 0);
  const byMapSite = new Map<string, TacticalRoundFact[]>();
  for (const f of named) {
    const k = `${f.mapName}|${f.targetSite}`;
    if (!byMapSite.has(k)) byMapSite.set(k, []);
    byMapSite.get(k)!.push(f);
  }
  const comboOf = (f: TacticalRoundFact) => {
    const ids = f.siteEntries[f.targetSite!].distinctEntryChokeIds ?? [];
    return ids.length ? [...ids].sort().join("+") : "(未判定)";
  };
  let totalCombos = 0, recurCombos = 0;
  for (const [ms, rows] of [...byMapSite.entries()].sort()) {
    const [map, site] = ms.split("|");
    const m = new Map<string, number>();
    for (const f of rows) m.set(comboOf(f), (m.get(comboOf(f)) ?? 0) + 1);
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const recurring = sorted.filter(([, n]) => n >= 5); // ≥5 次才算「反复出现、值得命名」
    totalCombos += sorted.length; recurCombos += recurring.length;
    // 累计覆盖到 90% 需几种组合
    let cum = 0, need = 0; const tot = rows.length;
    for (const [, n] of sorted) { cum += n; need += 1; if (cum / tot >= 0.9) break; }
    console.log(`${map!.replace("de_", "")} ${site!.toUpperCase()}（${tot}回合）：组合${sorted.length}种，≥5次的${recurring.length}种，覆盖90%需${need}种`);
    for (const [combo, n] of sorted.slice(0, 6)) {
      console.log(`    ${combo.padEnd(34)} ${String(n).padStart(4)}  ${pct(n, tot)}`);
    }
  }
  console.log(`\n合计：${byMapSite.size} 个「图×点」槽位，原始组合 ${totalCombos} 种，但 ≥5 次的「值得命名」组合仅 ${recurCombos} 种`);
  console.log(`→ 命名词典规模 ≈ ${recurCombos} 条（一次性手写），其余长尾用结构兜底（口数 + 主口名）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
