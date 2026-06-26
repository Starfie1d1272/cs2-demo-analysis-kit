import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, extractTacticalRoundFacts, type TacticalRoundFact } from "../../packages/core/src/index.ts";
import { loadCalloutGrid } from "../../packages/maps/src/callout-grid-node.ts";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES=["fixtures/demos/pro/IEM-Cologne-Major-2026/_build/maps/*.zip","fixtures/output/pro/*.zip","fixtures/output/nju-rivals-2026/**/*.zip"];
const pct=(n:number,d:number)=>d>0?`${(n/d*100).toFixed(1)}%`:"—";
const gridCache=new Map<string,any>();
const gridFor=(m:string)=>{if(!gridCache.has(m)){try{gridCache.set(m,loadCalloutGrid(m));}catch{gridCache.set(m,null);}}return gridCache.get(m);};
const files=SOURCES.flatMap(g=>globSync(g,{cwd:ROOT})).map(f=>resolve(ROOT,f));

async function run(useGrid:boolean){
  const facts:TacticalRoundFact[]=[];
  for(const f of files){try{const pkg=await loadDemoPackageFromZip(readFileSync(f).buffer as ArrayBuffer);
    facts.push(...extractTacticalRoundFacts(pkg,{calloutGrid:useGrid?gridFor(pkg.match.mapName):null}));}catch{}}
  const T=facts.filter(f=>f.side==="t");
  // 默认位填充率（开局选出的人里归到 anchor 的比例）
  let anchored=0,total=0;
  for(const f of T){const c=f.openingPattern.regionCounts;const sel=c.a+c.b+c.mid+c.unknown;total+=sel;anchored+=Object.values(f.openingPattern.defaultAnchorCounts).reduce((s,n)=>s+n,0);}
  // 进点口子判出率（有进点的人里 entryChokeId≠null）
  let entrants=0,resolved=0;
  for(const f of T)for(const s of ["a","b"] as const)for(const o of f.siteEntries[s].order){entrants++;if(o.entryChokeId)resolved++;}
  console.log(`\n### ${useGrid?"带 grid":"不带 grid"}  (T回合 ${T.length})`);
  console.log(`  默认位填充率(开局人位→anchor)：${pct(anchored,total)}   进点口子判出率(进点人→chokeId)：${pct(resolved,entrants)}`);
  return T;
}
const T=await run(true);
await run(false);

// Mirage 专项：开局A强承诺回合，默认位能否分出 A1 / A二楼
console.log(`\n## Mirage 开局A强承诺(a>=4) 回合：默认位 detailedSignature 分布（带grid）`);
const mir=T.filter(f=>f.mapName==="de_mirage"&&f.openingPattern.regionCounts.a>=4);
const sig=new Map<string,number>();
for(const f of mir){const a=Object.entries(f.openingPattern.defaultAnchorCounts).filter(([k])=>k.startsWith("a_")).sort().map(([k,v])=>`${k}:${v}`).join("|")||"(无anchor)";sig.set(a,(sig.get(a)??0)+1);}
console.log(`  样本 ${mir.length}`);
for(const[k,v]of[...sig.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12))console.log(`    ${k.padEnd(28)} ${v}`);

// 各图默认位标注完整性：T方 unknown 占比（高=标注缺）
console.log(`\n## 各图 T 方默认位覆盖（unknown 越低标注越全，带grid）`);
const perMap=new Map<string,{anc:number,tot:number}>();
for(const f of T){const c=f.openingPattern.regionCounts;const e=perMap.get(f.mapName)??{anc:0,tot:0};e.tot+=c.a+c.b+c.mid+c.unknown;e.anc+=Object.values(f.openingPattern.defaultAnchorCounts).reduce((s,n)=>s+n,0);perMap.set(f.mapName,e);}
for(const[m,e]of[...perMap.entries()].sort((a,b)=>b[1].tot-a[1].tot))console.log(`    ${m.replace("de_","").padEnd(10)} 默认位命中 ${pct(e.anc,e.tot)}`);
