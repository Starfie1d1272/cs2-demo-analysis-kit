import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, extractTacticalRoundFacts, type TacticalRoundFact } from "../../packages/core/src/index.ts";
import { DEFAULT_POSITIONS } from "../../packages/maps/src/default-positions.ts";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES=["fixtures/demos/pro/IEM-Cologne-Major-2026/_build/maps/*.zip","fixtures/output/pro/*.zip","fixtures/output/nju-rivals-2026/**/*.zip"];
const pct=(n:number,d:number)=>d>0?`${(n/d*100).toFixed(1)}%`:"—";
const files=SOURCES.flatMap(g=>globSync(g,{cwd:ROOT})).map(f=>resolve(ROOT,f));
const facts:TacticalRoundFact[]=[];
for(const f of files){try{const pkg=await loadDemoPackageFromZip(readFileSync(f).buffer as ArrayBuffer);facts.push(...extractTacticalRoundFacts(pkg,{calloutGrid:null}));}catch{}}
const T=facts.filter(f=>f.side==="t");
const nameOf=(map:string,id:string)=>DEFAULT_POSITIONS[map]?.t.anchors[id]?.name??id;
function eco(f:TacticalRoundFact){if(f.economy==="pistol")return"手枪";if(f.economy==="full")return f.opponentEconomy==="full"?"长枪":"anti";return f.economy;}
// 三级标签：默认位按 count 降序，主力(最大count)在前，只取 count>=1 的 anchor，用 name 连接
function anchorLabel(f:TacticalRoundFact):string{
  const e=Object.entries(f.openingPattern.defaultAnchorCounts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  if(e.length===0)return"(无)";
  return e.map(([id,n])=>`${nameOf(f.mapName,id)}×${n}`).join("+");
}
// 归并粒度对比
function statOf(keyFn:(f:TacticalRoundFact)=>string){const m=new Map<string,{n:number,w:number}>();for(const f of T){const k=keyFn(f);const x=m.get(k)??{n:0,w:0};x.n++;if(f.won)x.w++;m.set(k,x);}const sz=[...m.values()].map(v=>v.n);return{m,clusters:m.size,single:pct(sz.filter(s=>s===1).length,m.size),usable:sz.filter(s=>s>=3).length};}
// G1: 精确人数  G2: 只看哪些anchor(集合,无人数)  G3: 主力anchor + 是否有协同
const setLabel=(f:TacticalRoundFact)=>Object.keys(f.openingPattern.defaultAnchorCounts).sort().map(id=>nameOf(f.mapName,id)).join("+")||"(无)";
const leadLabel=(f:TacticalRoundFact)=>{const e=Object.entries(f.openingPattern.defaultAnchorCounts).sort((a,b)=>b[1]-a[1]);if(!e.length)return"(无)";const lead=nameOf(f.mapName,e[0][0]);return e.length>1?`${lead}+协同`:`${lead}单点`;};
console.log("## 三级归并粒度对比（key=map|经济|默认位…）");
for(const[name,fn] of [["G1 精确人数",(f:TacticalRoundFact)=>`${f.mapName}|${eco(f)}|${anchorLabel(f)}`],["G2 anchor集合",(f:TacticalRoundFact)=>`${f.mapName}|${eco(f)}|${setLabel(f)}`],["G3 主力+协同",(f:TacticalRoundFact)=>`${f.mapName}|${eco(f)}|${leadLabel(f)}`]] as const){
  const s=statOf(fn as any);console.log(`  ${name.padEnd(14)} 簇${String(s.clusters).padStart(4)} 单例${s.single.padStart(6)} 可用≥3 ${s.usable}`);
}
console.log("\n## Mirage 长枪局 实际标签预览（G2 anchor集合, n>=4）");
const mir=T.filter(f=>f.mapName==="de_mirage"&&eco(f)==="长枪");
const m=new Map<string,{n:number,w:number}>();for(const f of mir){const k=setLabel(f);const x=m.get(k)??{n:0,w:0};x.n++;if(f.won)x.w++;m.set(k,x);}
for(const[k,v]of[...m.entries()].sort((a,b)=>b[1].n-a[1].n))if(v.n>=4)console.log(`  ${k.padEnd(24)} n=${String(v.n).padStart(3)} 胜率${pct(v.w,v.n)}`);
