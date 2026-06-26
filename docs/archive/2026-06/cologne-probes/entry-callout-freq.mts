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

async function freq(useGrid:boolean, map:string, site:"a"|"b"){
  const facts:TacticalRoundFact[]=[];
  for(const f of files){try{const pkg=await loadDemoPackageFromZip(readFileSync(f).buffer as ArrayBuffer);
    if(pkg.match.mapName!==map)continue;
    facts.push(...extractTacticalRoundFacts(pkg,{calloutGrid:useGrid?gridFor(map):null}));}catch{}}
  const T=facts.filter(f=>f.side==="t");
  const last=new Map<string,number>();      // 进包前最后一个 callout（entryCallout）
  const choke=new Map<string,number>();      // 判出的 entryChokeId
  let n=0;
  for(const f of T)for(const o of f.siteEntries[site].order){
    n++;
    const lc=o.entryCallout??"(null)"; last.set(lc,(last.get(lc)??0)+1);
    const ch=o.entryChokeId??"(null)"; choke.set(ch,(choke.get(ch)??0)+1);
  }
  console.log(`\n### ${map} ${site.toUpperCase()}包 进点 ${n} 人次 ── ${useGrid?"带grid":"不带grid"}`);
  console.log(`  进包前最后callout频次：`);
  for(const[k,v]of[...last.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12))console.log(`    ${k.padEnd(18)} ${String(v).padStart(4)} ${pct(v,n)}`);
  console.log(`  判出的进点口子(entryChokeId)：`);
  for(const[k,v]of[...choke.entries()].sort((a,b)=>b[1]-a[1]))console.log(`    ${k.padEnd(18)} ${String(v).padStart(4)} ${pct(v,n)}`);
}
await freq(true,"de_mirage","a");
await freq(false,"de_mirage","a");
await freq(true,"de_mirage","b");
