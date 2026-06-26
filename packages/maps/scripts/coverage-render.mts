/**
 * coverage-render — 合并 coverage-compute 分片 → 多 mode 出图（验证原型，未进产品）。
 *
 * 用法：
 *   单源：tsx coverage-render.mts <map> <outBase> <part1.json> [part2.json ...]
 *   差分：tsx coverage-render.mts <map> <outBase> <baseParts...> --team <teamParts...>
 *         队伍 − 联赛基线偏移场（红=队伍高于平均 / 蓝=低于平均）
 *
 * mode（所有模式均输出 3 时段 small multiples SVG + 逐秒进度条 HTML）：
 *   ctVis/tVis       = CT / T 视野覆盖（视锥 40° ∩ .tri LOS ∩ 烟雾）
 *   ctPres/tPres     = CT / T 位置占据（最近 nav 格，无 LOS，便宜）
 *   info-diff        = tVis − ctVis（T 信息优势暖 / CT 预警冷，= L3 信息控制层可视化）
 *   contested        = min(tVis, ctVis)（双方都看到 = 对拼线 / 真实交火点）
 *   delta-ctVis      = 队伍 CT 视野 − 联赛基线（差分模式专属）
 *   delta-tPres      = 队伍 T 位置 − 联赛基线（差分模式专属）
 *   delta-info-diff  = 队伍信息差分 − 联赛信息差分（差分模式专属）
 *
 * 产出：<outBase>-<mode>.svg（柔化热力 3 时段 + 雷达底图）
 *       <outBase>.html（逐秒进度条 + mode 下拉 + ±2s 平滑，浏览器打开）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getMapCalibration } from "../src/index.js";

// ── 参数解析 ──
const args = process.argv.slice(2);
const teamSep = args.indexOf("--team");
const isDiff = teamSep >= 0;
const baseParts = isDiff ? args.slice(2, teamSep) : args.slice(2);
const teamParts = isDiff ? args.slice(teamSep + 1) : [];
const mapName = args[0] ?? "de_inferno", outBase = args[1] ?? "coverage";

const calib = getMapCalibration(mapName);
if (!calib) throw new Error(`无标定 ${mapName}`);
const repoRoot = join(import.meta.dirname, "..", "..", "..");

// ── 合并分片 ──
const first = JSON.parse(readFileSync(baseParts[0]!, "utf8"));
const { maxSec, cell, grid } = first as { maxSec: number; cell: number; grid: number[][] };
const gl = grid.length;
const FIELDS = ["ctVis", "tVis", "ctPres", "tPres"] as const;
type FieldName = typeof FIELDS[number];

function loadParts(ps: string[]): {
  merged: Record<FieldName, Float64Array[]>;
  denom: Float64Array;
  gunRounds: number;
} {
  const m: Record<FieldName, Float64Array[]> = {} as any;
  for (const fn of FIELDS) m[fn] = Array.from({ length: maxSec }, () => new Float64Array(gl));
  const d = new Float64Array(maxSec);
  let gr = 0;
  for (const p of ps) {
    const j = JSON.parse(readFileSync(p, "utf8"));
    gr += j.gunRounds;
    for (let s = 0; s < maxSec; s++) {
      d[s]! += j.denom[s];
      for (const fn of FIELDS) {
        const row = m[fn]![s]!;
        const jr = j.fields[fn][s];
        for (let g = 0; g < gl; g++) row[g]! += jr[g];
      }
    }
  }
  return { merged: m, denom: d, gunRounds: gr };
}
const baseline = loadParts(baseParts);
const team = isDiff ? loadParts(teamParts) : baseline;
console.log(`[merge] 基线 ${baseline.gunRounds} 满买局${isDiff ? ` · 队伍 ${team.gunRounds} 满买局` : ""} · grid ${gl} · ${maxSec}s`);

// ── 渲染常量 ──
const cellPx = cell / calib.scale;
const RS = calib.radarSize;
const w2r = (x: number, y: number) =>
  [(x - calib.posX) / calib.scale, (calib.posY - y) / calib.scale] as const;
const radarB64 = readFileSync(
  join(repoRoot, "apps/dak-studio/public/maps/radars", `${mapName}.png`),
).toString("base64");

// 时段桶
const PHASES = [
  { n: "开局 0–15s", lo: 0, hi: 15 },
  { n: "默认 15–40s", lo: 15, hi: 40 },
  { n: "中后期 40s+", lo: 40, hi: maxSec },
];
const PANEL = 380, GAP = 16, TOP = 28, sc = PANEL / RS;
const W = PANEL * PHASES.length + GAP * (PHASES.length + 1);
const H = PANEL + TOP + 24;

// mode 标签
const MODE_LABEL: Record<string, string> = {
  ctVis: "CT 视野",
  tVis: "T 视野",
  ctPres: "CT 位置",
  tPres: "T 位置",
  "info-diff": "信息差分 (T暖/CT冷)",
  contested: "对拼线 (双方都看到)",
  ...(isDiff
    ? {
        "delta-ctVis": "CT视野偏移 (红↑/蓝↓)",
        "delta-tPres": "T位置偏移 (红↑/蓝↓)",
        "delta-info-diff": "信息差分偏移 (红↑/蓝↓)",
      } as Record<string, string>
    : {}),
};

// ── 频率聚合 ──
function freqRange(
  merged: Record<FieldName, Float64Array[]>,
  denom: Float64Array,
  lo: number,
  hi: number,
): Record<FieldName, Float64Array> {
  const out: any = {};
  for (const fn of FIELDS) {
    const arr = new Float64Array(gl);
    let d = 0;
    const field = merged[fn];
    for (let s = lo; s < hi && s < maxSec; s++) {
      d += denom[s]!;
      const row = field[s]!;
      for (let g = 0; g < gl; g++) arr[g]! += row[g]!;
    }
    if (d > 0) for (let g = 0; g < gl; g++) arr[g]! /= d;
    out[fn] = arr;
  }
  return out as Record<FieldName, Float64Array>;
}

// ── 格子→颜色/透明度 ──
type Style = { fill: string; op: number } | null;
const seq = (t: number, cap: number) =>
  `hsl(${Math.round(240 - 240 * Math.min(1, t / cap))} 95% 55%)`;

function styleOf(
  mode: string,
  gi: number,
  fq: Record<FieldName, Float64Array>,
  fqTeam?: Record<FieldName, Float64Array>,
): Style {
  // info-diff（及 delta-info-diff）
  if (mode === "info-diff" || mode === "delta-info-diff") {
    const baseDiff = fq.tVis[gi]! - fq.ctVis[gi]!;
    if (mode === "delta-info-diff" && fqTeam) {
      const teamDiff = fqTeam.tVis[gi]! - fqTeam.ctVis[gi]!;
      const d = teamDiff - baseDiff;
      if (Math.abs(d) < 0.03) return null;
      return { fill: d > 0 ? "hsl(14 90% 55%)" : "hsl(208 90% 60%)", op: 0.2 + 0.7 * Math.min(1, Math.abs(d) / 0.25) };
    }
    if (Math.abs(baseDiff) < 0.04) return null;
    return { fill: baseDiff > 0 ? "hsl(14 90% 55%)" : "hsl(208 90% 60%)", op: 0.2 + 0.7 * Math.min(1, Math.abs(baseDiff) / 0.4) };
  }
  // contested
  if (mode === "contested") {
    const c = Math.min(fq.tVis[gi]!, fq.ctVis[gi]!);
    if (c < 0.03) return null;
    return { fill: "hsl(46 95% 55%)", op: 0.25 + 0.65 * Math.min(1, c / 0.3) };
  }
  // delta modes
  const m = mode.startsWith("delta-") ? mode.replace("delta-", "") : mode;
  const baseV = fq[m as FieldName]?.[gi] ?? 0;
  const teamV = fqTeam?.[m as FieldName]?.[gi] ?? 0;
  if (mode.startsWith("delta-")) {
    const d = teamV - baseV;
    if (Math.abs(d) < 0.02) return null;
    return { fill: d > 0 ? "hsl(14 95% 55%)" : "hsl(208 95% 58%)", op: 0.3 + 0.6 * Math.min(1, Math.abs(d) / 0.15) };
  }
  // 基础场
  const cap = mode.endsWith("Pres") ? 0.3 : 0.5;
  if (baseV < 0.03) return null;
  return { fill: seq(baseV, cap), op: 0.25 + 0.65 * Math.min(1, baseV / cap) };
}

// ── 出 SVG ──
function svgBlobs(mode: string, fq: Record<FieldName, Float64Array>, fqTeam?: Record<FieldName, Float64Array>) {
  return grid
    .map((g, gi) => {
      const st = styleOf(mode, gi, fq, fqTeam);
      if (!st) return "";
      const [px, py] = w2r(g[0]!, g[1]!);
      if (px < -50 || px > RS + 50 || py < -50 || py > RS + 50) return "";
      return `<circle cx="${px.toFixed(0)}" cy="${py.toFixed(0)}" r="${(cellPx * 1.35).toFixed(0)}" fill="${st.fill}" opacity="${st.op.toFixed(2)}"/>`;
    })
    .join("");
}

function renderSvg(mode: string) {
  const useTeam = mode.startsWith("delta-") && isDiff;
  const panels = PHASES.map((ph, pi) => {
    const fq = freqRange(baseline.merged, baseline.denom, ph.lo, ph.hi);
    const fqTeam = useTeam ? freqRange(team.merged, team.denom, ph.lo, ph.hi) : undefined;
    return `<g transform="translate(${GAP + pi * (PANEL + GAP)},${TOP})">
  <text x="0" y="-8" fill="#cfe0f0" font-family="monospace" font-size="14">${ph.n}</text>
  <g transform="scale(${sc.toFixed(4)})"><use href="#radar"/><g filter="url(#b)" clip-path="url(#cp)">${svgBlobs(mode, fq, fqTeam)}</g></g>
  <rect width="${PANEL}" height="${PANEL}" fill="none" stroke="#2a3340"/></g>`;
  }).join("\n");
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><clipPath id="cp"><rect width="${RS}" height="${RS}"/></clipPath><image id="radar" width="${RS}" height="${RS}" href="data:image/png;base64,${radarB64}" opacity="0.6"/>
<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(cellPx * 0.6).toFixed(1)}"/></filter></defs>
<rect width="${W}" height="${H}" fill="#0a0e13"/>
<text x="${GAP}" y="18" fill="#9fb3c8" font-family="monospace" font-size="13">${mapName} · ${MODE_LABEL[mode]} · ${baseline.gunRounds}${isDiff ? " vs " + team.gunRounds : ""} 满买局</text>
${panels}</svg>`;
}

const SINGLE_MODES = ["ctVis", "tVis", "tPres", "info-diff", "contested"];
const DELTA_MODES = ["delta-ctVis", "delta-tPres", "delta-info-diff"];
for (const m of [...SINGLE_MODES, ...(isDiff ? DELTA_MODES : [])]) {
  writeFileSync(`${outBase}-${m}.svg`, renderSvg(m));
}

// ── 出 HTML（逐秒进度条 + mode 下拉）──
const dumpField = (f: Float64Array[]) =>
  f.map((r) => Array.from(r).map((v) => Math.round(v)));
const dumpDenom = (d: Float64Array) => Array.from(d).map((v) => Math.round(v));
const teamJson = isDiff
  ? `const TEAM={ctVis:${JSON.stringify(
      dumpField(team.merged.ctVis),
    )},tVis:${JSON.stringify(dumpField(team.merged.tVis))},ctPres:${JSON.stringify(
      dumpField(team.merged.ctPres),
    )},tPres:${JSON.stringify(dumpField(team.merged.tPres))}};const TEAM_DEN=${JSON.stringify(dumpDenom(team.denom))};`
  : "const TEAM=null,TEAM_DEN=null;";
const subtitle = isDiff
  ? `${baseline.gunRounds} vs ${team.gunRounds} 满买局 · ±2s 平滑 · 切换 mode 看 CT/T 视野·位置·差分·对拼线·偏移`
  : `${baseline.gunRounds} 满买局 · ±2s 平滑 · 切换 mode 看 CT/T 视野·位置·差分·对拼线`;

const html = `<!doctype html>
<meta charset=utf8>
<body style="margin:0;background:#0a0e13;color:#cfe0f0;font:13px monospace;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px">
<div style="display:flex;gap:12px;align-items:center"><select id=m></select><span id=lbl></span></div>
<canvas id=c width=${RS} height=${RS} style="width:640px;height:640px;border:1px solid #2a3340;background:#11161d"></canvas>
<input id=t type=range min=0 max=${maxSec - 1} value=20 style="width:640px">
<div style="opacity:.6">${mapName} · ${subtitle}</div>
<script>
const G=${JSON.stringify(grid)},DEN=${JSON.stringify(dumpDenom(baseline.denom))},maxSec=${maxSec};
const BASE={ctVis:${JSON.stringify(dumpField(baseline.merged.ctVis))},tVis:${JSON.stringify(dumpField(baseline.merged.tVis))},ctPres:${JSON.stringify(dumpField(baseline.merged.ctPres))},tPres:${JSON.stringify(dumpField(baseline.merged.tPres))}};
${teamJson}
const calib=${JSON.stringify({ posX: calib.posX, posY: calib.posY, scale: calib.scale })},RS=${RS},R=${(cellPx * 2.2).toFixed(1)};
const MODES=${JSON.stringify(MODE_LABEL)};
const cv=document.getElementById('c'),cx=cv.getContext('2d'),img=new Image();img.src="data:image/png;base64,${radarB64}";
const sel=document.getElementById('m');for(const k in MODES){const o=document.createElement('option');o.value=k;o.textContent=MODES[k];sel.appendChild(o);}sel.value='tPres';
function fr(fields,sec){const W=2;const f=new Float64Array(G.length);let d=0;for(let s=Math.max(0,sec-W);s<=Math.min(maxSec-1,sec+W);s++){d+=DEN[s];for(let g=0;g<G.length;g++)f[g]+=fields[s][g];}if(d>0)for(let g=0;g<G.length;g++)f[g]/=d;return f;}
function seq(t,cap){return 'hsl('+Math.round(240-240*Math.min(1,t/cap))+' 95% 55%)';}
function style(mode,gi,Q,QTeam){
 if(mode==='info-diff'){const d=Q.tVis[gi]-Q.ctVis[gi];if(Math.abs(d)<0.04)return null;return[d>0?'14':'208',0.2+0.7*Math.min(1,Math.abs(d)/0.4)];}
 if(mode==='contested'){const c=Math.min(Q.tVis[gi],Q.ctVis[gi]);if(c<0.03)return null;return['46',0.25+0.65*Math.min(1,c/0.3)];}
 if(mode.startsWith('delta-')&&QTeam){const m2=mode.replace('delta-','');const bv=Q[m2]?.[gi]??0;const tv=QTeam[m2]?.[gi]??0;
  if(m2==='info-diff'){const bd=Q.tVis[gi]-Q.ctVis[gi],td=QTeam.tVis[gi]-QTeam.ctVis[gi];const dv=td-bd;if(Math.abs(dv)<0.03)return null;return[dv>0?'14':'208',0.2+0.7*Math.min(1,Math.abs(dv)/0.25)];}
  const dv=tv-bv;if(Math.abs(dv)<0.02)return null;return[dv>0?'14':'208',0.3+0.6*Math.min(1,Math.abs(dv)/0.15)];}
 var cap=mode.endsWith('Pres')?0.3:0.5,v=Q[mode]?.[gi]??0;if(v<0.03)return null;return[String(Math.round(240-240*Math.min(1,v/cap))),0.25+0.65*Math.min(1,v/cap)];}
function draw(){var sec=+t.value,mode=sel.value;var Q={ctVis:fr(BASE.ctVis,sec),tVis:fr(BASE.tVis,sec),ctPres:fr(BASE.ctPres,sec),tPres:fr(BASE.tPres,sec)};
 var QTeam=TEAM?{ctVis:fr(TEAM.ctVis,sec),tVis:fr(TEAM.tVis,sec),ctPres:fr(TEAM.ctPres,sec),tPres:fr(TEAM.tPres,sec)}:null;
 cx.clearRect(0,0,RS,RS);cx.globalAlpha=0.6;cx.drawImage(img,0,0,RS,RS);cx.globalAlpha=1;cx.globalCompositeOperation=mode.startsWith('delta-')?'source-over':'lighter';
 for(var g=0;g<G.length;g++){var st=style(mode,g,Q,QTeam);if(!st)continue;var px=(G[g][0]-calib.posX)/calib.scale,py=(calib.posY-G[g][1])/calib.scale;
  var grd=cx.createRadialGradient(px,py,0,px,py,R);grd.addColorStop(0,'hsla('+st[0]+' 90% 56% / '+st[1].toFixed(2)+')');grd.addColorStop(1,'hsla('+st[0]+' 90% 56% / 0)');
  cx.fillStyle=grd;cx.beginPath();cx.arc(px,py,R,0,7);cx.fill();}
 cx.globalCompositeOperation='source-over';document.getElementById('lbl').textContent='freeze 后 '+sec+'s';}
t.oninput=draw;sel.onchange=draw;img.onload=draw;
</script>`;
writeFileSync(`${outBase}.html`, html);
console.log(
  `[out] ${outBase}-{${[...SINGLE_MODES, ...(isDiff ? DELTA_MODES : [])].join(",")}}.svg + ${
    outBase
  }.html`,
);
