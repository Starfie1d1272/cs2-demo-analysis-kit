import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, extractTacticalRoundFacts, type TacticalRoundFact } from "../../packages/core/src/index.ts";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES=["fixtures/demos/pro/IEM-Cologne-Major-2026/_build/maps/*.zip","fixtures/output/pro/*.zip","fixtures/output/nju-rivals-2026/**/*.zip"];
const pct=(n:number,d:number)=>d>0?`${(n/d*100).toFixed(1)}%`:"—";
const files=SOURCES.flatMap(g=>globSync(g,{cwd:ROOT})).map(f=>resolve(ROOT,f));
const facts:TacticalRoundFact[]=[];
for(const f of files){try{const pkg=await loadDemoPackageFromZip(readFileSync(f).buffer as ArrayBuffer);facts.push(...extractTacticalRoundFacts(pkg,{calloutGrid:null}));}catch{}}
const T=facts.filter(f=>f.side==="t");
function dir(f:TacticalRoundFact):string{const{a,b,mid}=f.openingPattern.regionCounts;if(a>=b+2&&a>=mid)return"A";if(b>=a+2&&b>=mid)return"B";if(mid>=3&&mid>a&&mid>b)return"Mid";return "分散";}
function eco(f:TacticalRoundFact):string{if(f.economy==="pistol")return"手枪";if(f.economy==="full")return f.opponentEconomy==="full"?"长枪":"anti";return f.economy;}
function stat(keyFn:(f:TacticalRoundFact)=>string|null){const m=new Map<string,{n:number,w:number}>();let used=0;for(const f of T){const k=keyFn(f);if(!k)continue;used++;const e=m.get(k)??{n:0,w:0};e.n++;if(f.won)e.w++;m.set(k,e);}const sz=[...m.values()].map(v=>v.n);return{m,clusters:m.size,avg:used/(m.size||1),single:pct(sz.filter(s=>s===1).length,m.size),usable:sz.filter(s=>s>=3).length,used};}
console.log(`T回合 ${T.length}\n`);
const A=stat(f=>{const s=f.targetSite;return s?`${f.mapName}|${eco(f)}|${s}|${[...new Set(f.siteEntries[s].order.map(o=>o.entryChokeId).filter(Boolean))].sort().join("+")||"-"}`:`${f.mapName}|${eco(f)}|none`;});
const B=stat(f=>`${f.mapName}|${eco(f)}|${dir(f)}|${f.openingPattern.spread}`);
const C=stat(f=>`${f.mapName}|${eco(f)}|${dir(f)}`);
const show=(n:string,s:ReturnType<typeof stat>)=>console.log(`${n.padEnd(28)} 簇${String(s.clusters).padStart(4)} 均${s.avg.toFixed(1).padStart(4)} 单例${s.single.padStart(6)} 可用≥3 ${String(s.usable).padStart(3)} 覆盖${s.used}`);
show("当前 plant点+全口",A);
show("方向×形态(spread)",B);
show("仅方向",C);
console.log(`\n## 方向×形态 的胜率区分度(全图合并, n>=30)`);
const sm=stat(f=>`${dir(f)}|${f.openingPattern.spread}`);
for(const[k,v]of[...sm.m.entries()].sort((a,b)=>b[1].n-a[1].n))if(v.n>=30)console.log(`  ${k.padEnd(16)} n=${String(v.n).padStart(4)} 胜率${pct(v.w,v.n)}`);
