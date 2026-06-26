import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, extractTacticalRoundFacts, type TacticalRoundFact } from "../../packages/core/src/index.ts";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES = ["fixtures/demos/pro/IEM-Cologne-Major-2026/_build/maps/*.zip","fixtures/output/pro/*.zip","fixtures/output/nju-rivals-2026/**/*.zip"];
const pct=(n:number,d:number)=>d>0?`${(n/d*100).toFixed(1)}%`:"—";
const files=SOURCES.flatMap(g=>globSync(g,{cwd:ROOT})).map(f=>resolve(ROOT,f));
const facts:TacticalRoundFact[]=[];
for(const f of files){try{const pkg=await loadDemoPackageFromZip(readFileSync(f).buffer as ArrayBuffer);facts.push(...extractTacticalRoundFacts(pkg,{calloutGrid:null}));}catch{}}
const T=facts.filter(f=>f.side==="t");

// 1) 时间窗口污染：意图点上，首次进点之后还有「很晚」(>15s) 的新进点 的回合占比
console.log("## 进点时间跨度（残局转点信号）");
let entered=0, lateSpan=0, veryLate=0;
for(const f of T){
  const c=f.openingPattern.regionCounts; const site=c.a>=c.b+2?"a":c.b>=c.a+2?"b":null;
  if(!site) continue;
  const order=f.siteEntries[site as "a"|"b"].order;
  if(order.length===0) continue;
  entered++;
  const span=(order.at(-1)!.tick-order[0]!.tick)/64; // 秒
  if(span>15) lateSpan++;
  if(span>30) veryLate++;
}
console.log(`  意图点有进点的回合：${entered}`);
console.log(`  进点跨度>15s（疑似含残局转点）：${lateSpan}  ${pct(lateSpan,entered)}`);
console.log(`  进点跨度>30s（几乎确定残局）：${veryLate}  ${pct(veryLate,entered)}\n`);

// 2) 夹A完整性：开局A主导(a>=4)的回合，A点的 distinct choke 分布
console.log("## 开局A强承诺(a>=4) 回合的 A 进点口子构成");
const strongA=T.filter(f=>f.mapName==="de_mirage"&&f.openingPattern.regionCounts.a>=4);
let multi=0, single=0, nullChoke=0;
for(const f of strongA){
  const order=f.siteEntries.a.order;
  const chokes=order.map(o=>o.entryChokeId);
  const resolved=chokes.filter(Boolean) as string[];
  const distinct=[...new Set(resolved)];
  const nulls=chokes.filter(c=>!c).length;
  if(distinct.length>=2) multi++; else if(distinct.length===1){ if(nulls>0) nullChoke++; else single++; }
}
console.log(`  mirage 开局a>=4 回合：${strongA.length}`);
console.log(`  A进点判出≥2口(真夹击保留)：${multi}  ${pct(multi,strongA.length)}`);
console.log(`  只判出1口(可能丢了另一口)：${single+nullChoke}  其中有人进点但口子=null：${nullChoke}\n`);
console.log("  样例（前6，开局a>=4）：");
for(const f of strongA.slice(0,6)){
  const c=f.openingPattern.regionCounts;
  const ord=f.siteEntries.a.order.map(o=>`${o.entryChokeId??"NULL"}@${Math.round(o.remainSec)}s[${o.entryCallout??"-"}]`).join(" ");
  console.log(`    R${String(f.roundNumber).padStart(2)} 开局A${c.a}/M${c.mid}/B${c.b} plant=${f.targetSite} | A进点: ${ord||"无"}`);
}
