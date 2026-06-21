import { readFileSync, globSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, extractTacticalRoundFacts } from "../../packages/core/src/index.ts";
import { loadCalloutGrid } from "../../packages/maps/src/callout-grid-node.ts";
import { SITE_ENTRY_SEMANTICS } from "../../packages/maps/src/site-entry-chokes.ts";
import { getPrimaryCalloutRegion } from "../../packages/maps/src/callout-names.ts";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES=["fixtures/demos/pro/IEM-Cologne-Major-2026/_build/maps/*.zip","fixtures/output/pro/*.zip","fixtures/output/nju-rivals-2026/**/*.zip"];
const pct=(n:number,d:number)=>d>0?`${(n/d*100).toFixed(1)}%`:"—";
const gridCache=new Map<string,any>();
const gridFor=(m:string)=>{if(!gridCache.has(m)){try{gridCache.set(m,loadCalloutGrid(m));}catch{gridCache.set(m,null);}}return gridCache.get(m);};
const files=SOURCES.flatMap(g=>globSync(g,{cwd:ROOT})).map(f=>resolve(ROOT,f));
function jpOf(map:string,site:"a"|"b",callout:string):string|null{
  for(const e of SITE_ENTRY_SEMANTICS[map]?.entries.filter(x=>x.target===site)??[])if(e.entryCallouts.includes(callout))return e.id;
  return null;
}
// 全程最早判定点 vs 末段(进包前连续同区推进段)最早判定点
function judge(map:string,site:"a"|"b",traj:string[]){
  const siteCo=site==="a"?"BombsiteA":"BombsiteB";
  const idx=traj.indexOf(siteCo);
  const prefix=idx>=0?traj.slice(0,idx):traj;
  let full:string|null=null;
  for(const c of prefix){const j=jpOf(map,site,c);if(j){full=j;break;}}
  // 末段：从进包往回，region===site 或 是判定点 就并入；遇到异区停
  const seg:string[]=[];
  for(let i=prefix.length-1;i>=0;i--){const c=prefix[i];const r=getPrimaryCalloutRegion(map,c);if(r===site||jpOf(map,site,c)){seg.unshift(c);}else break;}
  let tail:string|null=null;
  for(const c of seg){const j=jpOf(map,site,c);if(j){tail=j;break;}}
  return {full,tail,detour:full!==null&&tail!==null&&full!==tail};
}
const agg=new Map<string,{n:number,detour:number}>();
const samples:string[]=[];
for(const file of files){try{
  const pkg=await loadDemoPackageFromZip(readFileSync(file).buffer as ArrayBuffer);
  const m=pkg.match.mapName;
  for(const fact of extractTacticalRoundFacts(pkg,{calloutGrid:gridFor(m)})){
    if(fact.side!=="t")continue;
    for(const s of ["a","b"] as const)for(const o of fact.siteEntries[s].order){
      const key=`${m}|${s}`;const a=agg.get(key)??{n:0,detour:0};a.n++;
      const r=judge(m,s,o.trajectory);
      if(r.detour){a.detour++;if(samples.length<12&&m==="de_mirage")samples.push(`  ${basename(file).slice(0,14)} R${fact.roundNumber} [全程=${r.full} 末段=${r.tail}]: ${o.trajectory.join(" → ")}`);}
      agg.set(key,a);
    }
  }
}catch{}}
console.log("## 折返漏洞规模：全程firstMatch 与 末段firstMatch 判定不同 的比例\n");
for(const[k,a]of[...agg.entries()].sort())console.log(`  ${k.padEnd(16)} ${String(a.n).padStart(4)}人次  折返误判 ${String(a.detour).padStart(3)}  ${pct(a.detour,a.n)}`);
console.log("\n## Mirage 折返样例（全程会误判、末段修正）\n");
console.log(samples.join("\n")||"  （无）");
