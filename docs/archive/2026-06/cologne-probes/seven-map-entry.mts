import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
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
type C=Map<string,number>;
const data=new Map<string,{last:{a:C,b:C},choke:{a:C,b:C}}>();
const bump=(c:C,k:string)=>c.set(k,(c.get(k)??0)+1);
for(const f of files){try{
  const pkg=await loadDemoPackageFromZip(readFileSync(f).buffer as ArrayBuffer);
  const m=pkg.match.mapName;
  if(!data.has(m))data.set(m,{last:{a:new Map(),b:new Map()},choke:{a:new Map(),b:new Map()}});
  const d=data.get(m)!;
  for(const fact of extractTacticalRoundFacts(pkg,{calloutGrid:gridFor(m)})){
    if(fact.side!=="t")continue;
    for(const s of ["a","b"] as const)for(const o of fact.siteEntries[s].order){
      bump(d.last[s],o.entryCallout??"(null)");
      bump(d.choke[s],o.entryChokeId??"(null)");
    }
  }
}catch{}}
const top=(c:C,n=8)=>{const t=[...c.values()].reduce((s,v)=>s+v,0);return[...c.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>`${k} ${pct(v,t)}`).join("  ");};
for(const[m,d]of[...data.entries()].sort()){
  const sem=SITE_ENTRY_SEMANTICS[m];
  console.log(`\n===== ${m} =====`);
  for(const s of ["a","b"] as const){
    const ids=sem?.entries.filter(e=>e.target===s).map(e=>`${e.id}[${e.entryCallouts.join("/")}]`).join(" ");
    console.log(` ${s.toUpperCase()}包 标注口子: ${ids}`);
    console.log(`   进包前最后callout: ${top(d.last[s])}`);
    console.log(`   判出chokeId:       ${top(d.choke[s])}`);
  }
}
