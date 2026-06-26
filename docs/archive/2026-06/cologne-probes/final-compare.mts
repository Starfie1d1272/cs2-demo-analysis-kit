import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, extractTacticalRoundFacts, type TacticalRoundFact } from "../../packages/core/src/index.ts";
import { loadCalloutGrid } from "../../packages/maps/src/callout-grid-node.ts";
import { SITE_ENTRY_SEMANTICS } from "../../packages/maps/src/site-entry-chokes.ts";
import { getPrimaryCalloutRegion } from "../../packages/maps/src/callout-names.ts";
import { DEFAULT_POSITIONS } from "../../packages/maps/src/default-positions.ts";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES=["fixtures/demos/pro/IEM-Cologne-Major-2026/_build/maps/*.zip","fixtures/output/pro/*.zip","fixtures/output/nju-rivals-2026/**/*.zip"];
const pct=(n:number,d:number)=>d>0?`${(n/d*100).toFixed(1)}%`:"—";
const gridCache=new Map<string,any>();
const gridFor=(m:string)=>{if(!gridCache.has(m)){try{gridCache.set(m,loadCalloutGrid(m));}catch{gridCache.set(m,null);}}return gridCache.get(m);};
const files=SOURCES.flatMap(g=>globSync(g,{cwd:ROOT})).map(f=>resolve(ROOT,f));
// 补标注：Nuke A Vents、Overpass B Water→b_short
type E={id:string,cs:string[]};
function entriesOf(map:string,site:"a"|"b"):E[]{
  const base=(SITE_ENTRY_SEMANTICS[map]?.entries.filter(e=>e.target===site)??[]).map(e=>({id:e.id,cs:[...e.entryCallouts]}));
  if(map==="de_nuke"&&site==="a"&&!base.some(e=>e.id==="a_vents"))base.push({id:"a_vents",cs:["Vents"]});
  if(map==="de_overpass"&&site==="b"){const s=base.find(e=>e.id==="b_short");if(s&&!s.cs.includes("Water"))s.cs.push("Water");}
  return base;
}
// 末段 firstMatch
function tailFirst(map:string,site:"a"|"b",traj:string[]):string|null{
  const entries=entriesOf(map,site);
  const siteCo=site==="a"?"BombsiteA":"BombsiteB";
  const idx=traj.indexOf(siteCo);const prefix=idx>=0?traj.slice(0,idx):traj;
  const seg:string[]=[];
  for(let i=prefix.length-1;i>=0;i--){const c=prefix[i];const r=getPrimaryCalloutRegion(map,c);if(r===site||entries.some(e=>e.cs.includes(c)))seg.unshift(c);else break;}
  for(const c of seg)for(const e of entries)if(e.cs.includes(c))return e.id;
  return null;
}
const facts:TacticalRoundFact[]=[];
for(const f of files){try{const pkg=await loadDemoPackageFromZip(readFileSync(f).buffer as ArrayBuffer);facts.push(...extractTacticalRoundFacts(pkg,{calloutGrid:gridFor(pkg.match.mapName)}));}catch{}}
const T=facts.filter(f=>f.side==="t");
function eco(f:TacticalRoundFact){if(f.economy==="pistol")return"手枪";if(f.economy==="full")return f.opponentEconomy==="full"?"长枪":"anti";return f.economy;}
function dir(f:TacticalRoundFact){const{a,b,mid}=f.openingPattern.regionCounts;if(a>=b+2&&a>=mid)return"A";if(b>=a+2&&b>=mid)return"B";if(mid>=3&&mid>a&&mid>b)return"Mid";return"分散";}
const nameDef=(m:string,id:string)=>DEFAULT_POSITIONS[m]?.t.anchors[id]?.name??id;
// 进点判定组合：进了包的人，末段firstMatch 去重排序
function entryCombo(f:TacticalRoundFact){const ids=new Set<string>();for(const s of["a","b"] as const)for(const o of f.siteEntries[s].order){const j=tailFirst(f.mapName,s,o.trajectory);if(j)ids.add(j);}return[...ids].sort().join("+");}
// 默认位控图组合：anchor集合
const defCombo=(f:TacticalRoundFact)=>Object.keys(f.openingPattern.defaultAnchorCounts).sort().join("+");
function statOf(keyFn:(f:TacticalRoundFact)=>string|null){const m=new Map<string,{n:number,w:number}>();let used=0;for(const f of T){const k=keyFn(f);if(k==null)continue;used++;const e=m.get(k)??{n:0,w:0};e.n++;if(f.won)e.w++;m.set(k,e);}const sz=[...m.values()].map(v=>v.n);return{m,clusters:m.size,single:pct(sz.filter(s=>s===1).length,m.size),usable:sz.filter(s=>s>=3).length,used,avg:used/(m.size||1)};}
const show=(n:string,s:ReturnType<typeof statOf>)=>console.log(`  ${n.padEnd(30)} 簇${String(s.clusters).padStart(4)} 均${s.avg.toFixed(1).padStart(4)} 单例${s.single.padStart(6)} 可用≥3 ${String(s.usable).padStart(3)} 覆盖${s.used}/${T.length}`);
console.log(`T回合 ${T.length}\n## 聚类效率对比（key 都含 map|经济|方向）`);
show("① 默认位控图(anchor集合)",statOf(f=>`${f.mapName}|${eco(f)}|${dir(f)}|${defCombo(f)}`));
show("② 进点判定(末段firstMatch)",statOf(f=>{const c=entryCombo(f);return c?`${f.mapName}|${eco(f)}|${dir(f)}|${c}`:null;}));
show("③ 两者结合",statOf(f=>{const c=entryCombo(f);return `${f.mapName}|${eco(f)}|${dir(f)}|${defCombo(f)}|${c||"-"}`;}));
// 覆盖率：进点判定有效的回合（真打进至少一个口）
const withEntry=T.filter(f=>entryCombo(f)!=="").length;
console.log(`\n进点判定覆盖：${pct(withEntry,T.length)} 的回合有有效进点（其余=没打进/被打掉/默认掉人 → 进点聚类盖不到）`);
console.log(`\n## Mirage A 末段firstMatch 新分布（验证 A1/A2 分开）`);
const ma=new Map<string,number>();let mn=0;for(const f of T){if(f.mapName!=="de_mirage")continue;for(const o of f.siteEntries.a.order){const j=tailFirst("de_mirage","a",o.trajectory);mn++;ma.set(j??"(null)",(ma.get(j??"(null)")??0)+1);}}
for(const[k,v]of[...ma.entries()].sort((a,b)=>b[1]-a[1]))console.log(`  ${k.padEnd(14)} ${pct(v,mn)}`);
console.log(`\n## Nuke A / Overpass B 补标注后 null 率`);
for(const[m,s] of [["de_nuke","a"],["de_overpass","b"]] as const){let n=0,nul=0;for(const f of T){if(f.mapName!==m)continue;for(const o of f.siteEntries[s as "a"|"b"].order){n++;if(!tailFirst(m,s as "a"|"b",o.trajectory))nul++;}}console.log(`  ${m}|${s}  null ${pct(nul,n)}（${n}人次）`);}
