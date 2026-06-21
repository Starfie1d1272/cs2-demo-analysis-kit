import { readFileSync, globSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, extractTacticalRoundFacts } from "../../packages/core/src/index.ts";
import { loadCalloutGrid } from "../../packages/maps/src/callout-grid-node.ts";
import { SITE_ENTRY_SEMANTICS } from "../../packages/maps/src/site-entry-chokes.ts";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES=["fixtures/demos/pro/IEM-Cologne-Major-2026/_build/maps/*.zip","fixtures/output/pro/*.zip","fixtures/output/nju-rivals-2026/**/*.zip"];
const pct=(n:number,d:number)=>d>0?`${(n/d*100).toFixed(1)}%`:"—";
const gridCache=new Map<string,any>();
const gridFor=(m:string)=>{if(!gridCache.has(m)){try{gridCache.set(m,loadCalloutGrid(m));}catch{gridCache.set(m,null);}}return gridCache.get(m);};
const files=SOURCES.flatMap(g=>globSync(g,{cwd:ROOT})).map(f=>resolve(ROOT,f));
// 两套判定：first=最早经过的标志callout(判定点)  last=进包前最后一个匹配(现状)
function matchChoke(map:string,site:"a"|"b",traj:string[],first:boolean):string|null{
  const sem=SITE_ENTRY_SEMANTICS[map]?.entries.filter(e=>e.target===site)??[];
  const siteCo=site==="a"?"BombsiteA":"BombsiteB";
  const idx=traj.indexOf(siteCo);
  const prefix=idx>=0?traj.slice(0,idx):traj;
  const seq=first?prefix:[...prefix].reverse();
  for(const c of seq)for(const e of sem)if(e.entryCallouts.includes(c))return e.id;
  return null;
}
type S={firstN:number,lastN:number,n:number,first:Map<string,number>,last:Map<string,number>};
const stat=new Map<string,S>();
const trampPaths:string[]=[]; let trampTotal=0, trampToPalace=0;
for(const file of files){try{
  const pkg=await loadDemoPackageFromZip(readFileSync(file).buffer as ArrayBuffer);
  const m=pkg.match.mapName;
  for(const fact of extractTacticalRoundFacts(pkg,{calloutGrid:gridFor(m)})){
    if(fact.side!=="t")continue;
    for(const s of ["a","b"] as const)for(const o of fact.siteEntries[s].order){
      const key=`${m}|${s}`;
      const st=stat.get(key)??{firstN:0,lastN:0,n:0,first:new Map(),last:new Map()};
      st.n++;
      const fc=matchChoke(m,s,o.trajectory,true), lc=matchChoke(m,s,o.trajectory,false);
      if(fc){st.firstN++;st.first.set(fc,(st.first.get(fc)??0)+1);}
      if(lc){st.lastN++;st.last.set(lc,(st.last.get(lc)??0)+1);}
      stat.set(key,st);
      // Mirage A 经过 TRamp 的真实路径
      if(m==="de_mirage"&&s==="a"&&o.trajectory.includes("TRamp")){
        trampTotal++;
        const ti=o.trajectory.indexOf("TRamp");
        const after=o.trajectory.slice(ti+1);
        if(after.includes("PalaceInterior")||after.includes("Scaffolding"))trampToPalace++;
        if(trampPaths.length<14)trampPaths.push(`  ${basename(file).slice(0,16)} R${fact.roundNumber}: ${o.trajectory.join(" → ")}  [first=${fc} last=${lc}]`);
      }
    }
  }
}catch{}}
console.log(`## Mirage A 经过 TRamp(A1) 的真实路径：共 ${trampTotal} 人次，其中之后又到 殿/脚手架 的 ${trampToPalace} (${pct(trampToPalace,trampTotal)})\n`);
console.log(trampPaths.join("\n"));
console.log(`\n## 两套判定 判出率 + Mirage A 分布对比`);
for(const[k,st]of[...stat.entries()].sort()){
  console.log(`\n ${k}  (${st.n}人次)  判定点firstMatch判出 ${pct(st.firstN,st.n)} | 最后callout判出 ${pct(st.lastN,st.n)}`);
  if(k==="de_mirage|a"){
    const fmt=(c:Map<string,number>)=>[...c.entries()].sort((a,b)=>b[1]-a[1]).map(([id,v])=>`${id} ${pct(v,st.n)}`).join("  ");
    console.log(`   判定点(first): ${fmt(st.first)}`);
    console.log(`   最后callout : ${fmt(st.last)}`);
  }
}
