/**
 * MapAnnotator — demo-lab 可视化标注工具
 *
 * 文件驱动：运行时 fetch 加载 + POST 保存到 packages/maps/{map-zones,map-routes}/<map>.json。
 * 动线锚点自动从已标定 zone 多边形质心派生。
 * 多层地图（nuke）：上/下层切换 + zMin/zMax 按层设定。
 * 面积排序：按多边形面积升序（窄区在前 = 优先命中）。
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CALLOUT_NAME_CN, getMapCalibration, worldToRadar, getMapNav, pointInPolygon, sampleNavZ } from "@cs2dak/maps";
import type { MapZone } from "@cs2dak/maps";

// ── 地图列表 & 多层配置 ──────────────────────────────────────────────────────
const MAP_LIST = ["de_ancient","de_anubis","de_dust2","de_inferno","de_mirage","de_nuke","de_overpass"];
const MULTI_LEVEL: Record<string, { thresholdZ: number; lowerImg: string }> = {
  de_nuke: { thresholdZ: -495, lowerImg: "de_nuke_lower" },
};
type Level = "upper" | "lower";

// ── 坐标变换 ──────────────────────────────────────────────────────────────────
function w2r(wx: number, wy: number, m: string): [number, number] {
  const c = getMapCalibration(m); if (!c) return [0, 0];
  const p = worldToRadar({ x: wx, y: wy }, c); return [p.x, p.y];
}
function r2w(rx: number, ry: number, m: string): [number, number] {
  const c = getMapCalibration(m); if (!c) return [0, 0];
  return [Math.round(rx * c.scale + c.posX), Math.round(c.posY - ry * c.scale)];
}
function polyArea(poly: [number, number][]): number {
  let a = 0; const n = poly.length; if (n < 3) return 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += poly[i][0] * poly[j][1]; a -= poly[j][0] * poly[i][1]; }
  return Math.abs(a / 2);
}
function centroid(poly: [number, number][]): [number, number] {
  let x = 0, y = 0; for (const [px, py] of poly) { x += px; y += py; } return [x / poly.length, y / poly.length];
}

// ── 颜色 ─────────────────────────────────────────────────────────────────────
type CalloutCat = "site" | "spawn" | "mid" | "connector" | "area";
const CAT_CLR: Record<string,string> = { site: "#e74c3c", spawn: "#9b59b6", mid: "#2ecc71", connector: "#f1c40f", area: "#3498db" };
const CAT_LBL: Record<string,string> = { site: "包点", spawn: "出生", mid: "中路", connector: "通道", area: "区域" };
const CAT_ROLE: Record<string,string> = { site: "site", spawn: "spawn", mid: "mid", connector: "connector", area: "other" };
function calloutCat(id: string): CalloutCat {
  if (/Bombsite/i.test(id)) return "site"; if (/Spawn/i.test(id)) return "spawn";
  if (/Mid|Middle|TopofMid/i.test(id)) return "mid";
  if (/Connector|Tunnel|Ramp|Stairs|Alley|Catwalk|Underpass|Walkway|Bridge|Pipe|Canal/i.test(id)) return "connector";
  return "area";
}

type RouteType = "primary_entry"|"secondary_entry"|"mid_connector"|"lurk_lane"|"rotation_cut";
type Confidence = "high"|"medium"|"low";
const TYPE_CLR: Record<string,string>={primary_entry:"#e74c3c",secondary_entry:"#e67e22",mid_connector:"#3498db",lurk_lane:"#9b59b6",rotation_cut:"#1abc9c"};
const TYPE_LBL: Record<string,string>={primary_entry:"主线",secondary_entry:"副线",mid_connector:"中路连",lurk_lane:"单挂",rotation_cut:"断回防"};
const CONF_CLR: Record<string,string>={high:"#2ecc71",medium:"#f39c12",low:"#e74c3c"};

// ── 类型 ─────────────────────────────────────────────────────────────────────
interface RouteZone { id: string; nameCn: string; }
interface RouteDef { id: string; name: string; type: RouteType; bombsite:"a"|"b"; confidence:Confidence; zones:RouteZone[]; }
interface ZoneStore { [id: string]: MapZone }

// ── 数据加载 ─────────────────────────────────────────────────────────────────
async function fetchZones(mapName: string): Promise<ZoneStore> {
  try { const r = await fetch(`/api/load-zones?map=${mapName}`); if (!r.ok) return {};
    const d = await r.json(); const s: ZoneStore = {};
    for (const z of (d.zones ?? []) as MapZone[]) { if (z.polygon?.length >= 3) s[z.id] = z; }
    return s;
  } catch { return {}; }
}
async function fetchRoutes(mapName: string): Promise<RouteDef[]> {
  try { const r = await fetch(`/api/load-routes?map=${mapName}`); if (!r.ok) return [];
    const d = await r.json(); return (d.routes ?? []) as RouteDef[];
  } catch { return []; }
}
async function saveZones(mapName: string, zones: MapZone[]): Promise<string> {
  try { const r = await fetch("/api/save-zones", { method: "POST", body: JSON.stringify({ mapName, version: `${mapName}-zones-0.1`, zones }) });
    const j = await r.json(); return j.ok ? `✓ 已保存 map-zones/${mapName}.json` : `✕ ${j.error}`;
  } catch (e) { return `✕ ${String(e)}`; }
}
async function saveRoutes(mapName: string, routes: RouteDef[]): Promise<string> {
  try { const r = await fetch("/api/save-routes", { method: "POST", body: JSON.stringify({ mapName, version: `${mapName}-routes-0.4`, routes }) });
    const j = await r.json(); return j.ok ? `✓ 已保存 map-routes/${mapName}.json` : `✕ ${j.error}`;
  } catch (e) { return `✕ ${String(e)}`; }
}

// ── UI 原子 ──────────────────────────────────────────────────────────────────
const S={
  inp:{background:"#10131a",color:"#c5cdd9",border:"1px solid #1f2530",padding:"3px 7px",borderRadius:2,fontSize:12,width:"100%",boxSizing:"border-box"} as React.CSSProperties,
  sel:{background:"#10131a",color:"#c5cdd9",border:"1px solid #1f2530",padding:"3px 5px",borderRadius:2,fontSize:11,flex:1} as React.CSSProperties,
  numInp:{background:"#10131a",color:"#c5cdd9",border:"1px solid #1f2530",padding:"1px 4px",borderRadius:2,fontSize:10,width:52} as React.CSSProperties,
};
function Btn({c,onClick,disabled=false,wide=false,children}:{c:string;onClick:()=>void;disabled?:boolean;wide?:boolean;children:React.ReactNode}){return <button onClick={onClick} disabled={disabled} style={{padding:wide?"6px 16px":"4px 11px",fontSize:12,background:c+"22",color:c,border:`1px solid ${c}55`,borderRadius:2,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.45:1,width:wide?"100%":undefined}}>{children}</button>;}
function SubTab({active,onClick,children}:{active:boolean;onClick:()=>void;children:React.ReactNode}){return <button onClick={onClick} style={{padding:"3px 14px",fontSize:11,background:active?"#162035":"#10131a",color:active?"#5ba0ff":"#525a6a",border:`1px solid ${active?"#2d5a9e":"#1f2530"}`,borderRadius:2,cursor:"pointer"}}>{children}</button>;}
function LevelSwitch({mapName,level,setLevel}:{mapName:string;level:Level;setLevel:(l:Level)=>void}){if(!MULTI_LEVEL[mapName])return null;return <div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontSize:10,color:"#525a6a"}}>楼层</span><SubTab active={level==="upper"} onClick={()=>setLevel("upper")}>▲ 上层</SubTab><SubTab active={level==="lower"} onClick={()=>setLevel("lower")}>▼ 下层</SubTab></div>;}
function MapCanvas({mapName,level,cursor="default",onClick,onMouseMove,onMouseUp,onMouseLeave,children}:{mapName:string;level:Level;cursor?:string;onClick?:(rx:number,ry:number)=>void;onMouseMove?:(rx:number,ry:number)=>void;onMouseUp?:()=>void;onMouseLeave?:()=>void;children?:React.ReactNode}){const ml=MULTI_LEVEL[mapName];const img=ml&&level==="lower"?ml.lowerImg:mapName;const toRxy=(e:React.MouseEvent<SVGSVGElement>):[number,number]=>{const rect=e.currentTarget.getBoundingClientRect();return[((e.clientX-rect.left)/rect.width)*1024,((e.clientY-rect.top)/rect.height)*1024];};return <div style={{position:"relative",width:620,height:620,border:"1px solid #1f2530",flexShrink:0}}><img src={`/maps/radars/${img}.png`} width={620} height={620} style={{display:"block",userSelect:"none"}} draggable={false}/><svg viewBox="0 0 1024 1024" style={{position:"absolute",inset:0,width:"100%",height:"100%",cursor}} onClick={onClick?e=>{const[rx,ry]=toRxy(e);onClick(rx,ry)}:undefined} onMouseMove={onMouseMove?e=>{const[rx,ry]=toRxy(e);onMouseMove(rx,ry)}:undefined} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}>{children}</svg></div>;}

function geomLevel(g:{zMin?:number;zMax?:number}|undefined,thresholdZ:number):Level|"both"{if(!g||(g.zMin===undefined&&g.zMax===undefined))return"both";if(g.zMax!==undefined&&g.zMax<=thresholdZ)return"lower";if(g.zMin!==undefined&&g.zMin>=thresholdZ)return"upper";return"both";}


// ════════════════════════════════════════════════════════════════════════════
// ZoneTab
// ════════════════════════════════════════════════════════════════════════════
function ZoneTab({mapName,level,setLevel,vocab,store,setStore,custom,setCustom}:{mapName:string;level:Level;setLevel:(l:Level)=>void;vocab:Record<string,string>;store:ZoneStore;setStore:React.Dispatch<React.SetStateAction<ZoneStore>>;custom:Record<string,string>;setCustom:React.Dispatch<React.SetStateAction<Record<string,string>>>}){
  const ml=MULTI_LEVEL[mapName];
  const nav=useMemo(()=>getMapNav(mapName),[mapName]);
  const [editId,setEditId]=useState<string|null>(null);const[draft,setDraft]=useState<[number,number][]>([]);const[cur,setCur]=useState<[number,number]|null>(null);const[dragIdx,setDragIdx]=useState<number|null>(null);const didDragRef=useRef(false);
  const navSample=useMemo(()=>{
    if(!nav||draft.length<3)return null;
    const zf=ml?level==="upper"?{zMin:ml.thresholdZ}:{zMax:ml.thresholdZ}:undefined;
    return sampleNavZ(nav,draft,50,zf);
  },[nav,draft,ml,level]);
  const[saving,setSaving]=useState(false);const[saveMsg,setSaveMsg]=useState("");
  const[newId,setNewId]=useState("");const[newCn,setNewCn]=useState("");
  const addCallout=()=>{const id=newId.trim();const cn=newCn.trim();if(!id||!cn||id in vocab)return;setCustom(p=>({...p,[id]:cn}));setNewId("");setNewCn("");};
  const[order,setOrder]=useState<string[]>(()=>{try{const v=localStorage.getItem(`cs2dak-zoneorder-${mapName}`);return v?JSON.parse(v):[];}catch{return[];}});
  const SNAP=16;

  useEffect(()=>{try{setOrder(JSON.parse(localStorage.getItem(`cs2dak-zoneorder-${mapName}`)??"[]"));}catch{setOrder([]);}setEditId(null);setDraft([]);setCur(null);},[mapName]);
  useEffect(()=>{try{localStorage.setItem(`cs2dak-zoneorder-${mapName}`,JSON.stringify(order));}catch{/* quota */}},[order,mapName]);

  // 渲染/导出顺序 = 已存 order（合并 vocab：保留有效项，新 callout 追加到末尾）= 优先级
  const ids=useMemo(()=>{const seen=new Set<string>();const merged:string[]=[];for(const id of order) if(id in vocab&&!seen.has(id)){merged.push(id);seen.add(id);}for(const id of Object.keys(vocab)) if(!seen.has(id)){merged.push(id);seen.add(id);}return merged;},[order,vocab]);

  const moveZone=(id:string,dir:-1|1,e:React.MouseEvent)=>{e.stopPropagation();const cur=[...ids];const i=cur.indexOf(id);const j=i+dir;if(i<0||j<0||j>=cur.length)return;[cur[i],cur[j]]=[cur[j],cur[i]];setOrder(cur);};
  const autoSortByArea=()=>{const sorted=ids.map(id=>({id,a:polyArea(store[id]?.polygon??[])})).sort((x,y)=>{const ex=x.a===0,ey=y.a===0;if(ex!==ey)return ex?1:-1;return x.a-y.a;}).map(w=>w.id);setOrder(sorted);};

  // 编辑控制
  const selectZone=(id:string)=>{if(id===editId){setEditId(null);setDraft([]);return;}setEditId(id);const g=store[id];setDraft(g?.polygon?.length?g.polygon.map(p=>[p[0],p[1]]as[number,number]):[]);setCur(null);
    if(ml&&g){const zl=geomLevel(g,ml.thresholdZ);if(zl!=="both"&&zl!==level) setLevel(zl);}};
  const commit=useCallback((poly:[number,number][])=>{if(!editId||poly.length<3)return;const cat=calloutCat(editId);const g:MapZone={id:editId,name:vocab[editId]??editId,role:CAT_ROLE[cat]as MapZone["role"],bombsite:/BombsiteA/i.test(editId)?"a":/BombsiteB/i.test(editId)?"b":null,polygon:poly};if(ml){if(level==="lower") g.zMax=ml.thresholdZ;else g.zMin=ml.thresholdZ;}
    // 单簇（无歧义）→ 自动填；多簇（重叠区域）→ 不填，由用户看底部提示手动填
    const zf=ml?level==="upper"?{zMin:ml.thresholdZ}:{zMax:ml.thresholdZ}:undefined;
    const sample=nav?sampleNavZ(nav,poly,50,zf):null;
    if(sample?.clusters.length===1){const c=sample.clusters[0]!;if(g.zMin===undefined)g.zMin=Math.round(c.min-10);if(g.zMax===undefined)g.zMax=Math.round(c.max+10);}
    setStore(p=>({...p,[editId]:g}));setEditId(null);setDraft([]);setCur(null);},[editId,mapName,ml,level,setStore,vocab,nav]);
  const onMapClick=(rx:number,ry:number)=>{if(!editId)return;if(didDragRef.current){didDragRef.current=false;return;}if(draft.length>=3){const[fx,fy]=w2r(draft[0][0],draft[0][1],mapName);if((fx-rx)**2+(fy-ry)**2<=SNAP*SNAP){commit(draft);return;}}setDraft(p=>[...p,r2w(rx,ry,mapName)]);};
  const onMapMove=(rx:number,ry:number)=>{if(dragIdx!==null){didDragRef.current=true;setDraft(p=>p.map((pt,i)=>i===dragIdx?r2w(rx,ry,mapName):pt));setCur([rx,ry]);}else if(editId)setCur([rx,ry]);};
  const updateZ=(id:string,field:"zMin"|"zMax",val:string)=>{const n=val.trim()===""?undefined:Number(val);if(!Number.isNaN(n)) setStore(p=>({...p,[id]:{...p[id],polygon:p[id]?.polygon??[],[field]:n}}));};
  const clearPoly=(id:string)=>{setStore(p=>{const n={...p};delete n[id];return n;});if(editId===id)setDraft([]);};
  const save=async()=>{setSaving(true);setSaveMsg("");const msg=await saveZones(mapName,Object.values(store));setSaveMsg(msg);setSaving(false);setTimeout(()=>setSaveMsg(""),3000);};

  const draftSvg=draft.map(([wx,wy])=>w2r(wx,wy,mapName));
  const draftWithCur=cur?[...draftSvg,cur]:draftSvg;
  const closeable=!!(editId&&draft.length>=3&&cur&&dragIdx===null&&(draftSvg[0][0]-cur[0])**2+(draftSvg[0][1]-cur[1])**2<=SNAP*SNAP);
  const editCat=editId?calloutCat(editId):"area";

  const doneCount=ids.filter(id=>(store[id]?.polygon?.length??0)>=3).length;

  return <div style={{display:"flex",gap:12,flex:1,overflow:"hidden"}}>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <MapCanvas mapName={mapName} level={level} cursor={dragIdx!==null?"grabbing":editId?"crosshair":"default"} onClick={onMapClick} onMouseMove={editId?onMapMove:undefined} onMouseUp={()=>setDragIdx(null)} onMouseLeave={()=>{setCur(null);setDragIdx(null);}}>
        {ids.map(id=>{const g=store[id];if(!g||g.polygon.length<3||id===editId)return null;const zl=ml?geomLevel(g,ml.thresholdZ):"both";if(zl!=="both"&&zl!==level)return null;const c=CAT_CLR[calloutCat(id)];const[lx,ly]=w2r(...centroid(g.polygon),mapName);
          return <g key={id}><polygon points={g.polygon.map(([wx,wy])=>w2r(wx,wy,mapName).join(",")).join(" ")} fill={c} fillOpacity={0.2} stroke={c} strokeWidth={2} strokeOpacity={0.8}/><text x={lx} y={ly} textAnchor="middle" fill="#fff" fontSize={11} style={{pointerEvents:"none",textShadow:"0 0 3px #000"}}>{vocab[id]}</text></g>;})}
        {editId&&draft.length>=3&&<polygon points={draft.map(([wx,wy])=>w2r(wx,wy,mapName).join(",")).join(" ")} fill={CAT_CLR[editCat]} fillOpacity={0.3} stroke="none"/>}
        {editId&&draftWithCur.length>=2&&<polyline points={draftWithCur.map(p=>p.join(",")).join(" ")} fill="none" stroke="#fff" strokeWidth={1.5} strokeDasharray="5 3"/>}
        {editId&&draft.length>=2&&cur&&<line x1={cur[0]} y1={cur[1]} x2={draftSvg[0][0]} y2={draftSvg[0][1]} stroke="#fff" strokeWidth={1} strokeDasharray="3 5" strokeOpacity={0.3}/>}
        {closeable&&<circle cx={draftSvg[0][0]} cy={draftSvg[0][1]} r={11} fill="none" stroke="#2ecc71" strokeWidth={2.5}><animate attributeName="r" values="9;13;9" dur="1s" repeatCount="indefinite"/></circle>}
        {editId&&draftSvg.map(([sx,sy],i)=><circle key={i} cx={sx} cy={sy} r={i===0?6:4.5} fill={i===0?"#fff":CAT_CLR[editCat]} stroke="#000" strokeWidth={1.5} style={{cursor:"grab"}} onMouseDown={e=>{e.stopPropagation();didDragRef.current=false;setDragIdx(i);}}/>)}
      </MapCanvas>
      <div style={{display:"flex",gap:8,alignItems:"center",minHeight:30,flexWrap:"wrap"}}>
        <LevelSwitch mapName={mapName} level={level} setLevel={setLevel}/>
        {editId?<>
          <Btn c={draft.length>=3?"#2ecc71":"#444"} disabled={draft.length<3} onClick={()=>commit(draft)}>✓ 完成 ({draft.length}pt)</Btn>
          <Btn c="#e67e22" disabled={!draft.length} onClick={()=>setDraft(d=>d.slice(0,-1))}>↩ 撤销</Btn>
          <Btn c="#e74c3c" onClick={()=>setDraft([])}>清空</Btn>
          <span style={{fontSize:12,color:"#8899aa"}}>编辑：<b style={{color:CAT_CLR[editCat]}}>{vocab[editId]}</b><span style={{color:closeable?"#2ecc71":"#525a6a",marginLeft:8}}>{closeable?"点击闭合":"点回起点(白圈)/按完成闭合 · 顶点可拖动"}</span></span>
          {navSample&&navSample.clusters.length>0&&<span style={{fontSize:10,color:"#525a6a",display:"inline-flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
            <span>Z:</span>
            {navSample.clusters.map((c,i)=><span key={i} style={{color:navSample.clusters.length>1?"#f1c40f":"#2ecc71"}}>[{Math.round(c.min)}~{Math.round(c.max)}]×{c.count}</span>)}
            {navSample.clusters.length>=2&&<span style={{color:"#5ba0ff"}}>→ 边界≈{Math.round((navSample.clusters[0]!.max+navSample.clusters[1]!.min)/2)}</span>}
          </span>}
        </>:<span style={{fontSize:12,color:"#525a6a"}}>← 点击右侧列表选择 callout 画多边形 · 画完点回起点闭合或按「完成」</span>}
      </div>
    </div>
    {/* 右侧列表 */}
    <div style={{flex:1,display:"flex",flexDirection:"column",gap:6,overflow:"hidden"}}>
      {/* 新增 callout */}
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        <input value={newId} onChange={e=>setNewId(e.target.value)} placeholder="英文ID" style={{...S.inp,flex:1.2}} onKeyDown={e=>{if(e.key==="Enter")addCallout();}}/>
        <input value={newCn} onChange={e=>setNewCn(e.target.value)} placeholder="中文名" style={{...S.inp,flex:1}} onKeyDown={e=>{if(e.key==="Enter")addCallout();}}/>
        <Btn c="#3498db" disabled={!newId.trim()||!newCn.trim()||newId.trim()in vocab} onClick={addCallout}>＋</Btn>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,color:"#525a6a",textTransform:"uppercase",letterSpacing:"0.1em"}}>区域（callout）· {doneCount}/{ids.length} 已画 · 序号=优先级</span>
        <span style={{marginLeft:"auto"}}><Btn c="#9b59b6" onClick={autoSortByArea}>↕ 按面积排序（窄在前）</Btn></span>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"3px 10px",marginBottom:2}}>{(Object.keys(CAT_CLR)as CalloutCat[]).map(cat=><span key={cat} style={{fontSize:10,color:CAT_CLR[cat]}}>■ {CAT_LBL[cat]}</span>)}</div>
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
        {ids.map((id,i)=>{const cat=calloutCat(id);const c=CAT_CLR[cat];const isEdit=id===editId;const g=store[id];const isDone=(g?.polygon?.length??0)>=3;const zl=ml?geomLevel(g,ml.thresholdZ):"both";const area=isDone?polyArea(g!.polygon):0;
          return <div key={id} onClick={()=>selectZone(id)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",background:isEdit?"#131a24":"#10131a",border:`1px solid ${isEdit?c:"#1f2530"}`,borderRadius:2,cursor:"pointer",opacity:ml&&zl!=="both"&&zl!==level?0.4:1}}>
            <span style={{fontSize:10,color:"#525a6a",minWidth:18,textAlign:"right"}}>{i+1}</span>
            <button onClick={e=>moveZone(id,-1,e)} disabled={i===0} style={{fontSize:9,color:i===0?"#1f2530":"#525a6a",background:"none",border:"none",cursor:i===0?"default":"pointer",padding:"0 1px"}}>▲</button>
            <button onClick={e=>moveZone(id,1,e)} disabled={i===ids.length-1} style={{fontSize:9,color:i===ids.length-1?"#1f2530":"#525a6a",background:"none",border:"none",cursor:i===ids.length-1?"default":"pointer",padding:"0 1px"}}>▼</button>
            <span style={{width:8,height:8,borderRadius:1,background:c,flexShrink:0}}/>
            <span style={{flex:1,fontSize:12}}>{vocab[id]} <span style={{fontSize:10,color:"#525a6a"}}>{id}</span></span>
            {ml&&zl!=="both"&&<span style={{fontSize:10,color:"#5ba0ff"}}>{zl==="upper"?"▲":"▼"}</span>}
            <span style={{fontSize:10,color:isDone?"#2ecc71":"#303840"}}>{isDone?`${area>0?`${(area/1000).toFixed(1)}k`:`${g!.polygon.length}pt`}`:"—"}</span>
            {isEdit&&<span style={{display:"flex",gap:2,alignItems:"center"}} onClick={e=>e.stopPropagation()}><input style={S.numInp} placeholder="zMin" defaultValue={g?.zMin??""} onBlur={e=>updateZ(id,"zMin",e.target.value)}/><input style={S.numInp} placeholder="zMax" defaultValue={g?.zMax??""} onBlur={e=>updateZ(id,"zMax",e.target.value)}/></span>}
            {isDone&&<button onClick={e=>{e.stopPropagation();clearPoly(id);if(order.includes(id))setOrder(order.filter(x=>x!==id));}} style={{fontSize:10,color:"#e74c3c",background:"none",border:"none",cursor:"pointer",padding:"0 2px"}}>✕</button>}
          </div>;})}
      </div>
      <div style={{borderTop:"1px solid #1f2530",paddingTop:8}}>
        <div style={{fontSize:11,color:"#525a6a",marginBottom:5}}>→ <code style={{fontSize:10}}>packages/maps/map-zones/{mapName}.json</code></div>
        <Btn c={saveMsg.startsWith("✓")?"#2ecc71":saveMsg?"#e74c3c":"#3498db"} wide onClick={save} disabled={saving}>{saveMsg||(saving?"保存中…":"保存到文件")}</Btn>
        {Object.keys(custom).length>0&&<div style={{marginTop:4}}><Btn c="#9b59b6" wide onClick={async()=>{await navigator.clipboard.writeText(JSON.stringify(custom,null,2));}}>导出 {Object.keys(custom).length} 个新增 callout（→ callout-names.ts）</Btn></div>}
      </div>
    </div>
  </div>;
}

// ════════════════════════════════════════════════════════════════════════════
// RouteTab
// ════════════════════════════════════════════════════════════════════════════
function RouteTab({mapName,level,setLevel,vocab,store}:{mapName:string;level:Level;setLevel:(l:Level)=>void;vocab:Record<string,string>;store:ZoneStore}){
  const ml=MULTI_LEVEL[mapName];
  const[routes,setRoutes]=useState<RouteDef[]>([]);const[loading,setLoading]=useState(true);
  const[editRoute,setEditRoute]=useState<RouteDef|null>(null);const[saving,setSaving]=useState(false);const[saveMsg,setSaveMsg]=useState("");

  useEffect(()=>{let c=false;fetchRoutes(mapName).then(r=>{if(!c){setRoutes(r);setEditRoute(null);setLoading(false);}});return()=>{c=true;};},[mapName]);

  // 锚点自动从 zone 多边形质心派生
  const anchors=useMemo(()=>{const a:Record<string,{x:number;y:number;lvl?:Level}>= {};for(const[id,z]of Object.entries(store)){if(!z.polygon||z.polygon.length<3)continue;const[cx,cy]=centroid(z.polygon);const[rx,ry]=w2r(cx,cy,mapName);const zl=ml?geomLevel(z,ml.thresholdZ):undefined;a[id]={x:rx,y:ry,lvl:zl==="upper"?"upper":zl==="lower"?"lower":undefined};}return a;},[store,mapName,ml]);

  const onMapClick=(rx:number,ry:number)=>{if(!editRoute)return;let bestId:string|null=null;let bestDist=25*25;for(const[id,a]of Object.entries(anchors)){const d=(a.x-rx)**2+(a.y-ry)**2;if(d<bestDist){bestDist=d;bestId=id;}}if(!bestId||editRoute.zones.some(z=>z.id===bestId))return;const finalId=bestId;setEditRoute(p=>p?{...p,zones:[...p.zones,{id:finalId,nameCn:vocab[finalId]??finalId}]}:p);};
  const saveRouteEdit=()=>{if(!editRoute)return;setRoutes(p=>{const i=p.findIndex(r=>r.id===editRoute.id);return i===-1?[...p,editRoute]:p.map((r,j)=>j===i?editRoute:r);});};
  const save=async()=>{setSaving(true);setSaveMsg("");const msg=await saveRoutes(mapName,routes);setSaveMsg(msg);setSaving(false);setTimeout(()=>setSaveMsg(""),3000);};

  const routeColor=editRoute?TYPE_CLR[editRoute.type]:"#fff";
  const routeAnchored=editRoute?.zones.map(z=>anchors[z.id]).filter((a):a is NonNullable<typeof a>=>!!a)??[];
  const routePts=routeAnchored.map(a=>`${a.x},${a.y}`).join(" ");
  const anchorOnLevel=(a:{lvl?:Level})=>!ml||(a.lvl??"upper")===level;
  const doneZones=Object.values(store).filter(z=>(z.polygon?.length??0)>=3).length;

  const svgContent=<>
    <defs><marker id="rta-arrow" markerWidth={8} markerHeight={8} refX={7} refY={3} orient="auto"><path d="M0,0 L0,6 L8,3 z" fill={routeColor} fillOpacity={0.9}/></marker></defs>
    {editRoute&&routeAnchored.length>=2&&<polyline points={routePts} fill="none" stroke={routeColor} strokeWidth={3} strokeOpacity={0.85} markerEnd="url(#rta-arrow)"/>}
    {Object.entries(anchors).map(([id,a])=>{const inRoute=editRoute?editRoute.zones.findIndex(z=>z.id===id):-1;const baseClr=CAT_CLR[calloutCat(id)];const r=inRoute>=0?10:7;const fill=inRoute>=0?routeColor:baseClr;const dim=!anchorOnLevel(a);
      return <g key={id} opacity={dim?0.3:1}><circle cx={a.x} cy={a.y} r={r} fill={fill} fillOpacity={inRoute>=0?0.8:0.55} stroke={inRoute>=0?routeColor:baseClr} strokeWidth={1.5}/>{inRoute>=0&&<text x={a.x} y={a.y+4} textAnchor="middle" fill="#000" fontSize={10} fontWeight="bold" style={{pointerEvents:"none"}}>{inRoute+1}</text>}<text x={a.x+r+3} y={a.y-r+3} fill="#ffffffcc" fontSize={10} style={{pointerEvents:"none"}}>{vocab[id]??id}</text></g>;
    })}
  </>;

  return <div style={{display:"flex",gap:12,flex:1,overflow:"hidden"}}>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",gap:8,alignItems:"center"}}><LevelSwitch mapName={mapName} level={level} setLevel={setLevel}/></div>
      <MapCanvas mapName={mapName} level={level} cursor={editRoute?"pointer":"default"} onClick={onMapClick}>{svgContent}</MapCanvas>
      <div style={{display:"flex",flexWrap:"wrap",gap:"2px 10px"}}>{(Object.keys(CAT_CLR)as CalloutCat[]).map(cat=><span key={cat} style={{fontSize:10,color:CAT_CLR[cat]}}>● {CAT_LBL[cat]}</span>)}</div>
      <div style={{fontSize:11,color:"#525a6a"}}>锚点来自 {doneZones} 个已画 zone 质心（先在多边形 tab 标定）{editRoute?`　·　${editRoute.name} · ${editRoute.zones.length} 节点`:"　← 从右侧选择动线，点击地图锚点追加节点"}</div>
    </div>
    <div style={{flex:1,display:"flex",flexDirection:"column",gap:6,overflow:"hidden"}}>
      <div style={{fontSize:11,color:"#525a6a",textTransform:"uppercase",letterSpacing:"0.1em"}}>动线列表{loading?"　加载中…":""}</div>
      {editRoute&&<div style={{background:"#0d1520",border:"1px solid #1f2530",borderRadius:2,padding:8,display:"flex",flexDirection:"column",gap:5}}>
        <input value={editRoute.name} onChange={e=>setEditRoute(p=>p?{...p,name:e.target.value}:p)} style={S.inp} placeholder="动线名称"/>
        <div style={{display:"flex",gap:4}}>
          <select value={editRoute.type} onChange={e=>setEditRoute(p=>p?{...p,type:e.target.value as RouteType}:p)} style={S.sel}>{(Object.keys(TYPE_LBL)as RouteType[]).map(t=><option key={t} value={t}>{TYPE_LBL[t]}</option>)}</select>
          <select value={editRoute.bombsite} onChange={e=>setEditRoute(p=>p?{...p,bombsite:e.target.value as"a"|"b"}:p)} style={S.sel}><option value="a">A点</option><option value="b">B点</option></select>
          <select value={editRoute.confidence} onChange={e=>setEditRoute(p=>p?{...p,confidence:e.target.value as Confidence}:p)} style={S.sel}><option value="high">高置信</option><option value="medium">中</option><option value="low">低</option></select>
        </div>
        <div style={{maxHeight:110,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
          {editRoute.zones.length===0?<span style={{fontSize:11,color:"#303840"}}>点击地图上已标定 zone 的锚点追加节点</span>:editRoute.zones.map((z,i)=><div key={i} style={{display:"flex",gap:6,alignItems:"center",fontSize:12}}><span style={{color:"#525a6a",minWidth:20}}>{i+1}.</span><span style={{flex:1}}>{z.nameCn}</span><span style={{fontSize:10,color:"#525a6a"}}>{z.id}</span><button onClick={()=>setEditRoute(p=>p?{...p,zones:p.zones.filter((_,j)=>j!==i)}:p)} style={{fontSize:10,color:"#e74c3c",background:"none",border:"none",cursor:"pointer",padding:"0 2px"}}>✕</button></div>)}
        </div>
        <div style={{display:"flex",gap:4}}><Btn c="#2ecc71" onClick={saveRouteEdit}>保存动线</Btn><Btn c="#e74c3c" onClick={()=>setEditRoute(p=>p?{...p,zones:[]}:p)}>清空节点</Btn></div>
      </div>}
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
        {routes.map(r=>{const c=TYPE_CLR[r.type];const isSel=r.id===editRoute?.id;
          return <div key={r.id} onClick={()=>setEditRoute(structuredClone(r))} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px",background:isSel?"#131a24":"#10131a",border:`1px solid ${isSel?c:"#1f2530"}`,borderRadius:2,cursor:"pointer"}}>
            <span style={{width:8,height:8,borderRadius:1,background:c,flexShrink:0}}/><span style={{flex:1,fontSize:13}}>{r.name}</span><span style={{fontSize:10,color:c}}>{TYPE_LBL[r.type]}</span><span style={{fontSize:10,color:CONF_CLR[r.confidence]}}>{r.confidence}</span><span style={{fontSize:10,color:"#525a6a"}}>{r.zones.length}节</span>
            <button onClick={e=>{e.stopPropagation();setRoutes(p=>p.filter(x=>x.id!==r.id));if(editRoute?.id===r.id)setEditRoute(null);}} style={{fontSize:10,color:"#e74c3c",background:"none",border:"none",cursor:"pointer",padding:"0 2px"}}>✕</button>
          </div>;})}
      </div>
      <Btn c="#3498db" onClick={()=>setEditRoute({id:`route_${Date.now()}`,name:"新动线",type:"primary_entry",bombsite:"a",confidence:"medium",zones:[]})}>＋ 新动线</Btn>
      <div style={{borderTop:"1px solid #1f2530",paddingTop:8}}>
        <div style={{fontSize:11,color:"#525a6a",marginBottom:5}}>→ <code style={{fontSize:10}}>packages/maps/map-routes/{mapName}.json</code></div>
        <Btn c={saveMsg.startsWith("✓")?"#2ecc71":saveMsg?"#e74c3c":"#3498db"} wide onClick={save} disabled={saving}>{saveMsg||(saving?"保存中…":"保存到文件")}</Btn>
      </div>
    </div>
  </div>;
}

// ════════════════════════════════════════════════════════════════════════════
// MapAnnotator — 主容器
// ════════════════════════════════════════════════════════════════════════════
type MainTab="zones"|"routes";
export function MapAnnotator(){
  const[mapName,setMapName]=useState("de_mirage");const[tab,setTab]=useState<MainTab>("zones");const[level,setLevel]=useState<Level>("upper");
  const[store,setStore]=useState<ZoneStore>({});const[loading,setLoading]=useState(true);
  const[custom,setCustom]=useState<Record<string,string>>(()=>{try{const v=localStorage.getItem("cs2dak-customcallouts-"+mapName);return v?JSON.parse(v):{};}catch{return{};}});
  useEffect(()=>{setLevel("upper");setLoading(true);let c=false;fetchZones(mapName).then(s=>{if(!c){setStore(s);setLoading(false);}});try{setCustom(JSON.parse(localStorage.getItem("cs2dak-customcallouts-"+mapName)??"{}"));}catch{setCustom({});}return()=>{c=true;};},[mapName]);
  useEffect(()=>{try{localStorage.setItem("cs2dak-customcallouts-"+mapName,JSON.stringify(custom));}catch{}},[custom,mapName]);
  const vocab=useMemo(()=>({...((CALLOUT_NAME_CN as Record<string,Record<string,string>>)[mapName]??{}),...custom}),[mapName,custom]);

  return <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 44px)",background:"#0a0d13",color:"#c5cdd9",fontFamily:"ui-monospace, 'Cascadia Code', monospace",overflow:"hidden"}}>
    <div style={{display:"flex",gap:8,alignItems:"center",padding:"7px 12px",borderBottom:"1px solid #1f2530",flexShrink:0}}>
      <span style={{fontSize:11,color:"#525a6a"}}>地图</span>
      <select value={mapName} onChange={e=>setMapName(e.target.value)} style={S.sel}>{MAP_LIST.map(m=><option key={m} value={m}>{m}{MULTI_LEVEL[m]?" ⌃⌄":""}</option>)}</select>
      <div style={{display:"flex",gap:4,marginLeft:8}}>
        {(["zones","routes"]as MainTab[]).map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"3px 14px",fontSize:11,background:tab===t?"#162035":"#10131a",color:tab===t?"#5ba0ff":"#525a6a",border:`1px solid ${tab===t?"#2d5a9e":"#1f2530"}`,borderRadius:2,cursor:"pointer"}}>{t==="zones"?"▦ 多边形":"→ 动线"}</button>)}
      </div>
      <span style={{marginLeft:"auto",fontSize:10,color:"#1e2a38"}}>文件驱动 · 保存直接写 packages/maps/ · {Object.keys(vocab).length} callout · {Object.keys(store).filter(k=>(store[k]?.polygon?.length??0)>=3).length} 区已画{loading?" · 加载中…":""}</span>
    </div>
    <div style={{flex:1,display:"flex",padding:12,overflow:"hidden"}}>
      {loading?<div style={{padding:40,color:"#525a6a"}}>加载 {mapName} zone 数据…</div>:tab==="zones"?<ZoneTab key={`z-${mapName}`} mapName={mapName} level={level} setLevel={setLevel} vocab={vocab} store={store} setStore={setStore} custom={custom} setCustom={setCustom}/>:<RouteTab key={`r-${mapName}`} mapName={mapName} level={level} setLevel={setLevel} vocab={vocab} store={store}/>}
    </div>
  </div>;
}
