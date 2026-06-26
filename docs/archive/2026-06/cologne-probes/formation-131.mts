import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, extractTacticalRoundFacts, type TacticalRoundFact } from "../../packages/core/src/index.ts";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC=[["pro","fixtures/demos/pro/IEM-Cologne-Major-2026/_build/maps/*.zip"],["pro","fixtures/output/pro/*.zip"],["nju","fixtures/output/nju-rivals-2026/**/*.zip"]] as const;
const pct=(n:number,d:number)=>d>0?`${(n/d*100).toFixed(1)}%`:"—";
const all:{pool:string,f:TacticalRoundFact}[]=[];
for(const[pool,g]of SRC)for(const rel of globSync(g,{cwd:ROOT})){try{const pkg=await loadDemoPackageFromZip(readFileSync(resolve(ROOT,rel)).buffer as ArrayBuffer);for(const f of extractTacticalRoundFacts(pkg,{calloutGrid:null}))all.push({pool,f});}catch{}}
// 站位结构 = A-Mid-B 人数（unknown 并入最近的？先单看，通常开局5人就位）
const struct=(f:TacticalRoundFact)=>{const c=f.openingPattern.regionCounts;return `${c.a}-${c.mid}-${c.b}`;};
function dist(pool:string,side:"t"|"ct"){
  const rows=all.filter(x=>x.pool===pool&&x.f.side===side);
  const m=new Map<string,{n:number,w:number}>();
  for(const{f}of rows){const k=struct(f);const e=m.get(k)??{n:0,w:0};e.n++;if(f.won)e.w++;m.set(k,e);}
  console.log(`\n### ${pool} ${side.toUpperCase()}  (${rows.length} 回合)  开局站位结构 A-Mid-B`);
  for(const[k,v]of[...m.entries()].sort((a,b)=>b[1].n-a[1].n).slice(0,9))console.log(`   ${k.padEnd(8)} ${String(v.n).padStart(4)} ${pct(v.n,rows.length).padStart(6)}  胜率${pct(v.w,v.n)}`);
}
for(const p of ["pro","nju"])for(const s of ["t","ct"] as const)dist(p,s as any);
// 按「结构」归并的聚类效率（含 map|经济）
function eco(f:TacticalRoundFact){if(f.economy==="pistol")return"手枪";if(f.economy==="full")return f.opponentEconomy==="full"?"长枪":"anti";return f.economy;}
function stat(rows:TacticalRoundFact[],keyFn:(f:TacticalRoundFact)=>string){const m=new Map<string,number>();for(const f of rows){m.set(keyFn(f),(m.get(keyFn(f))??0)+1);}const sz=[...m.values()];return{clusters:m.size,single:pct(sz.filter(s=>s===1).length,m.size),usable:sz.filter(s=>s>=3).length,avg:rows.length/m.size};}
console.log(`\n## 「站位结构」归并 vs 之前方案 的聚类效率（全 pool，含 map|经济）`);
const T=all.map(x=>x.f).filter(f=>f.side==="t");
const a=stat(T,f=>`${f.mapName}|${eco(f)}|${struct(f)}`);
const b=stat(T,f=>`${f.mapName}|${eco(f)}|${Object.keys(f.openingPattern.defaultAnchorCounts).sort().join("+")}`);
console.log(`  站位结构(A-Mid-B)     簇${a.clusters} 均${a.avg.toFixed(1)} 单例${a.single} 可用≥3 ${a.usable}`);
console.log(`  默认位anchor集合       簇${b.clusters} 均${b.avg.toFixed(1)} 单例${b.single} 可用≥3 ${b.usable}`);
