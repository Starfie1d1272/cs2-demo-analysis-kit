/**
 * coverage-render — 合并 coverage-compute 分片 → 多 mode 出图（验证原型，未进产品）。
 *   tsx coverage-render.mts <map> <outBase> <part1.json> [part2.json ...]
 * 产出：<outBase>-<mode>.svg（3 时段 small multiples，含 ct-vision/t-presence/info-diff/contested）
 *       <outBase>.html（逐秒进度条 + mode 下拉，浏览器打开）
 * mode：ctVis/tVis = CT/T 视野；ctPres/tPres = CT/T 位置；
 *       info-diff = tVis−ctVis（T 信息优势暖 / CT 预警冷）；contested = 双方都看到（对拼线）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getMapCalibration } from "../src/index.js";

const [mapName = "de_inferno", outBase = "coverage", ...parts] = process.argv.slice(2);
const calib = getMapCalibration(mapName); if (!calib) throw new Error(`无标定 ${mapName}`);
const repoRoot = join(import.meta.dirname, "..", "..", "..");

const first = JSON.parse(readFileSync(parts[0]!, "utf8"));
const { maxSec, cell, grid } = first as { maxSec: number; cell: number; grid: number[][] };
const gl = grid.length;
const FIELDS = ["ctVis", "tVis", "ctPres", "tPres"] as const;
type FieldName = typeof FIELDS[number];
const merged: Record<FieldName, Float64Array[]> = { ctVis: [], tVis: [], ctPres: [], tPres: [] };
for (const fn of FIELDS) merged[fn] = Array.from({ length: maxSec }, () => new Float64Array(gl));
const denom = new Float64Array(maxSec);
let gunRounds = 0;
for (const p of parts) {
  const j = JSON.parse(readFileSync(p, "utf8")); gunRounds += j.gunRounds;
  for (let s = 0; s < maxSec; s++) {
    denom[s]! += j.denom[s];
    for (const fn of FIELDS) { const row = merged[fn][s]!, jr = j.fields[fn][s]; for (let g = 0; g < gl; g++) row[g]! += jr[g]; }
  }
}
console.log(`[merge] ${parts.length} 分片 · ${gunRounds} 满买局 · grid ${gl} · ${maxSec}s`);

const cellPx = cell / calib.scale, RS = calib.radarSize;
const w2r = (x: number, y: number) => [(x - calib.posX) / calib.scale, (calib.posY - y) / calib.scale] as const;
const radarB64 = readFileSync(join(repoRoot, "apps/dak-studio/public/maps/radars", `${mapName}.png`)).toString("base64");

function freqRange(field: Float64Array[], lo: number, hi: number): Float64Array {
  const out = new Float64Array(gl); let d = 0;
  for (let s = lo; s < hi && s < maxSec; s++) { d += denom[s]!; const row = field[s]!; for (let g = 0; g < gl; g++) out[g]! += row[g]!; }
  if (d > 0) for (let g = 0; g < gl; g++) out[g]! /= d;
  return out;
}

// ── 每个 mode 的「格子 → 颜色/透明度」 ──
type Style = { fill: string; op: number } | null;
const seq = (t: number, cap: number) => `hsl(${Math.round(240 - 240 * Math.min(1, t / cap))} 95% 55%)`;
function styleOf(mode: string, gi: number, fq: Record<FieldName, Float64Array>): Style {
  if (mode === "info-diff") {
    const d = fq.tVis[gi]! - fq.ctVis[gi]!; if (Math.abs(d) < 0.04) return null;
    return { fill: d > 0 ? "hsl(14 90% 55%)" : "hsl(208 90% 60%)", op: 0.2 + 0.7 * Math.min(1, Math.abs(d) / 0.4) };
  }
  if (mode === "contested") {
    const c = Math.min(fq.tVis[gi]!, fq.ctVis[gi]!); if (c < 0.03) return null;
    return { fill: "hsl(46 95% 55%)", op: 0.25 + 0.65 * Math.min(1, c / 0.3) };
  }
  const cap = mode.endsWith("Pres") ? 0.3 : 0.5;
  const v = fq[mode as FieldName][gi]!; if (v < 0.03) return null;
  return { fill: seq(v, cap), op: 0.25 + 0.65 * Math.min(1, v / cap) };
}

// ── 静态 3 时段 SVG ──
const PH = [{ n: "开局 0–15s", lo: 0, hi: 15 }, { n: "默认 15–40s", lo: 15, hi: 40 }, { n: "中后期 40s+", lo: 40, hi: maxSec }];
const PANEL = 380, GAP = 16, TOP = 28, sc = PANEL / RS;
const W = PANEL * PH.length + GAP * (PH.length + 1), H = PANEL + TOP + 24;
const MODE_LABEL: Record<string, string> = { ctVis: "CT 视野", tVis: "T 视野", ctPres: "CT 位置", tPres: "T 位置", "info-diff": "信息差分 (T暖/CT冷)", contested: "对拼线 (双方都看到)" };

function renderModeSvg(mode: string): void {
  const panels = PH.map((ph, pi) => {
    const fq = { ctVis: freqRange(merged.ctVis, ph.lo, ph.hi), tVis: freqRange(merged.tVis, ph.lo, ph.hi), ctPres: freqRange(merged.ctPres, ph.lo, ph.hi), tPres: freqRange(merged.tPres, ph.lo, ph.hi) };
    const blobs = grid.map((g, gi) => {
      const st = styleOf(mode, gi, fq); if (!st) return "";
      const [px, py] = w2r(g[0]!, g[1]!); if (px < -50 || px > RS + 50 || py < -50 || py > RS + 50) return "";
      return `<circle cx="${px.toFixed(0)}" cy="${py.toFixed(0)}" r="${(cellPx * 1.35).toFixed(0)}" fill="${st.fill}" opacity="${st.op.toFixed(2)}"/>`;
    }).join("");
    return `<g transform="translate(${GAP + pi * (PANEL + GAP)},${TOP})">
  <text x="0" y="-8" fill="#cfe0f0" font-family="monospace" font-size="14">${ph.n}</text>
  <g transform="scale(${sc.toFixed(4)})"><use href="#radar"/><g filter="url(#b)" clip-path="url(#cp)">${blobs}</g></g>
  <rect width="${PANEL}" height="${PANEL}" fill="none" stroke="#2a3340"/></g>`;
  }).join("\n");
  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><clipPath id="cp"><rect width="${RS}" height="${RS}"/></clipPath><image id="radar" width="${RS}" height="${RS}" href="data:image/png;base64,${radarB64}" opacity="0.6"/>
<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(cellPx * 0.6).toFixed(1)}"/></filter></defs>
<rect width="${W}" height="${H}" fill="#0a0e13"/>
<text x="${GAP}" y="18" fill="#9fb3c8" font-family="monospace" font-size="13">${mapName} · ${MODE_LABEL[mode]} · ${gunRounds} 满买局</text>
${panels}</svg>`;
  writeFileSync(`${outBase}-${mode}.svg`, svg);
}
for (const m of ["ctVis", "tVis", "tPres", "info-diff", "contested"]) renderModeSvg(m);

// ── 逐秒 HTML（mode 下拉 + slider + ±2s 平滑）──
const dumpField = (f: Float64Array[]) => f.map((r) => Array.from(r).map((v) => Math.round(v)));
const html = `<!doctype html><meta charset=utf8><body style="margin:0;background:#0a0e13;color:#cfe0f0;font:13px monospace;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px">
<div style="display:flex;gap:12px;align-items:center"><select id=m></select><span id=lbl></span></div>
<canvas id=c width=${RS} height=${RS} style="width:640px;height:640px;border:1px solid #2a3340;background:#11161d"></canvas>
<input id=t type=range min=0 max=${maxSec - 1} value=20 style="width:640px">
<div style="opacity:.6">${mapName} · ${gunRounds} 满买局 · 拖动看逐秒（±2s 平滑）· 切 mode 看 CT/T 视野·位置·差分·对拼线</div>
<script>
const G=${JSON.stringify(grid)},DEN=${JSON.stringify(Array.from(denom))},maxSec=${maxSec};
const F={ctVis:${JSON.stringify(dumpField(merged.ctVis))},tVis:${JSON.stringify(dumpField(merged.tVis))},ctPres:${JSON.stringify(dumpField(merged.ctPres))},tPres:${JSON.stringify(dumpField(merged.tPres))}};
const calib=${JSON.stringify({ posX: calib.posX, posY: calib.posY, scale: calib.scale })},RS=${RS},R=${(cellPx * 2.2).toFixed(1)};
const MODES=${JSON.stringify(MODE_LABEL)};
const cv=document.getElementById('c'),cx=cv.getContext('2d'),img=new Image();img.src="data:image/png;base64,${radarB64}";
const sel=document.getElementById('m');for(const k in MODES){const o=document.createElement('option');o.value=k;o.textContent=MODES[k];sel.appendChild(o);}sel.value='tPres';
function fr(field,sec){const W=2;let d=0;const f=new Float64Array(G.length);for(let s=Math.max(0,sec-W);s<=Math.min(maxSec-1,sec+W);s++){d+=DEN[s];const r=field[s];for(let g=0;g<G.length;g++)f[g]+=r[g];}if(d>0)for(let g=0;g<G.length;g++)f[g]/=d;return f;}
function seq(t,cap){return 'hsl('+Math.round(240-240*Math.min(1,t/cap))+' 95% 55%)';}
function style(mode,gi,Q){
 if(mode==='info-diff'){const d=Q.tVis[gi]-Q.ctVis[gi];if(Math.abs(d)<0.04)return null;return[d>0?'14':'208',0.2+0.7*Math.min(1,Math.abs(d)/0.4)];}
 if(mode==='contested'){const c=Math.min(Q.tVis[gi],Q.ctVis[gi]);if(c<0.03)return null;return['46',0.25+0.65*Math.min(1,c/0.3)];}
 const cap=mode.endsWith('Pres')?0.3:0.5,v=Q[mode][gi];if(v<0.03)return null;return[String(Math.round(240-240*Math.min(1,v/cap))),0.25+0.65*Math.min(1,v/cap)];}
function draw(){const sec=+t.value,mode=sel.value;const Q={ctVis:fr(F.ctVis,sec),tVis:fr(F.tVis,sec),ctPres:fr(F.ctPres,sec),tPres:fr(F.tPres,sec)};
 cx.clearRect(0,0,RS,RS);cx.globalAlpha=0.6;cx.drawImage(img,0,0,RS,RS);cx.globalAlpha=1;cx.globalCompositeOperation=mode==='info-diff'?'source-over':'lighter';
 for(let g=0;g<G.length;g++){const st=style(mode,g,Q);if(!st)continue;const px=(G[g][0]-calib.posX)/calib.scale,py=(calib.posY-G[g][1])/calib.scale;
  const grd=cx.createRadialGradient(px,py,0,px,py,R);grd.addColorStop(0,'hsla('+st[0]+' 90% 56% / '+st[1].toFixed(2)+')');grd.addColorStop(1,'hsla('+st[0]+' 90% 56% / 0)');
  cx.fillStyle=grd;cx.beginPath();cx.arc(px,py,R,0,7);cx.fill();}
 cx.globalCompositeOperation='source-over';
 document.getElementById('lbl').textContent='freeze 后 '+sec+'s（采样 '+DEN[sec]+' tick）';}
t.oninput=draw;sel.onchange=draw;img.onload=draw;
</script>`;
writeFileSync(`${outBase}.html`, html);
console.log(`[out] ${outBase}-{ctVis,tVis,tPres,info-diff,contested}.svg + ${outBase}.html`);
