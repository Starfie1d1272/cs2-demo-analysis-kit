/**
 * coverage-compute — L2 空间场计算（验证原型，未进产品）。逐秒桶，可分片并行。
 *
 * 一次算四个基础场（counts[sec][grid]，可加性合并）：
 *   ctVis / tVis  = CT / T 视野覆盖（视锥 ∩ .tri LOS ∩ 烟雾，复用 visibility.ts）
 *   ctPres / tPres= CT / T 位置占据（最近 nav 格，无 LOS，便宜）
 * render 再合成差分(tVis−ctVis)、交集(双方都看到)等。
 *
 *   tsx coverage-compute.mts <map> <zipDir> <outJson> <shardIndex> <shardCount>
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { parseAwpyTri, buildTriangleBvh, staticLineOfSight, type TriangleBvh } from "../src/visibility.js";

const EYE_HEIGHT = 64, TARGET_HEIGHT = 40, VIEW_CONE_HALF_DEGREES = 40, SMOKE_RADIUS = 144;
const CELL = 128, SAMPLE_EVERY = 8, MAX_DIST = 4096, CT_ECON_LABEL = "full", MAX_SEC = 115; // 一回合 1:55

type Vec3 = { x: number; y: number; z: number };
type Track = { x: number[]; y: number[]; z: number[]; yaw: number[]; pitch: number[]; hp: number[]; flash: number[] };
const decodeDelta = (a: number[]) => { const o = new Array(a.length); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]!; o[i] = s; } return o; };
const forward = (yd: number, pd: number): Vec3 => { const y = yd * Math.PI / 180, p = pd * Math.PI / 180, cp = Math.cos(p); return { x: cp * Math.cos(y), y: cp * Math.sin(y), z: -Math.sin(p) }; };
function inCone(yaw: number, pitch: number, eye: Vec3, t: Vec3): boolean {
  const f = forward(yaw, pitch); let dx = t.x - eye.x, dy = t.y - eye.y, dz = t.z - eye.z;
  const len = Math.hypot(dx, dy, dz); if (len < 1e-6) return true; dx /= len; dy /= len; dz /= len;
  return Math.acos(Math.max(-1, Math.min(1, f.x * dx + f.y * dy + f.z * dz))) * 180 / Math.PI <= VIEW_CONE_HALF_DEGREES;
}
function pToSeg(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const d = abx * abx + aby * aby + abz * abz, t = d < 1e-6 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / d));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t), p.z - (a.z + abz * t));
}

const [mapName = "de_inferno", zipDir = "", outJson = "part.json", shardIdx = "0", shardCnt = "1", teamFilter = ""] = process.argv.slice(2);
const si = Number(shardIdx), sc = Number(shardCnt);
const tf = teamFilter.toLowerCase(); // 非空 = 只统计该队作为 CT 满买的回合（队伍防守视角）
const repoRoot = join(import.meta.dirname, "..", "..", "..");

const triPath = process.env.AWPY_TRIS_DIR ? join(process.env.AWPY_TRIS_DIR, `${mapName}.tri`) : join(homedir(), ".awpy", "tris", `${mapName}.tri`);
const triBuf = readFileSync(triPath);
const bvh: TriangleBvh = buildTriangleBvh(parseAwpyTri(triBuf.buffer.slice(triBuf.byteOffset, triBuf.byteOffset + triBuf.byteLength)));

const nav = JSON.parse(readFileSync(join(repoRoot, "packages/maps/map-nav", `${mapName}.nav.json`), "utf8"));
const cellMap = new Map<string, { x: number; y: number; z: number; n: number }>();
for (const a of nav.areas as Array<{ corners: Vec3[] }>) {
  const c = a.corners.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y, z: s.z + p.z }), { x: 0, y: 0, z: 0 });
  const cx = c.x / a.corners.length, cy = c.y / a.corners.length, cz = c.z / a.corners.length;
  const key = `${Math.floor(cx / CELL)},${Math.floor(cy / CELL)}`;
  const e = cellMap.get(key) ?? { x: 0, y: 0, z: 0, n: 0 }; e.x += cx; e.y += cy; e.z += cz; e.n += 1; cellMap.set(key, e);
}
const sorted = [...cellMap.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
const grid = sorted.map(([, e]) => ({ x: e.x / e.n, y: e.y / e.n, z: e.z / e.n + TARGET_HEIGHT }));
const keyToIndex = new Map(sorted.map(([k], i) => [k, i]));
const gl = grid.length;

const mkField = () => Array.from({ length: MAX_SEC }, () => new Float64Array(gl));
const ctVis = mkField(), tVis = mkField(), ctPres = mkField(), tPres = mkField();
const denom = new Float64Array(MAX_SEC);
let gunRounds = 0;

const allZips = readdirSync(zipDir).filter((f) => f.includes(mapName) && f.endsWith(".zip")).sort();
const zips = allZips.filter((_, i) => i % sc === si);

function decode(t: any, coordScale: number, angleScale: number): Track {
  return { x: decodeDelta(t.x).map((v) => v * coordScale), y: decodeDelta(t.y).map((v) => v * coordScale), z: decodeDelta(t.z).map((v) => v * coordScale),
    yaw: decodeDelta(t.yaw).map((v) => v / angleScale), pitch: decodeDelta(t.pitch).map((v) => v / angleScale), hp: t.hp, flash: t.flash };
}
function markVision(viewers: Track[], i: number, out: Float64Array, active: any[]): void {
  for (let g = 0; g < gl; g++) {
    const G = grid[g]!; let seen = false;
    for (const v of viewers) {
      if ((v.hp[i] ?? 0) <= 0 || (v.flash[i] ?? 0) > 0) continue;
      const eye: Vec3 = { x: v.x[i]!, y: v.y[i]!, z: v.z[i]! + EYE_HEIGHT };
      const dx = G.x - eye.x, dy = G.y - eye.y, dz = G.z - eye.z;
      if (dx * dx + dy * dy + dz * dz > MAX_DIST * MAX_DIST) continue;
      if (!inCone(v.yaw[i]!, v.pitch[i]!, eye, G)) continue;
      let blk = false; for (const sm of active) if (pToSeg(sm.effectPosition, eye, G) <= SMOKE_RADIUS) { blk = true; break; }
      if (blk || !staticLineOfSight(bvh, eye, G)) continue;
      seen = true; break;
    }
    if (seen) out[g]! += 1;
  }
}
function markPresence(players: Track[], i: number, out: Float64Array): void {
  const hit = new Set<number>();
  for (const p of players) {
    if ((p.hp[i] ?? 0) <= 0) continue;
    const idx = keyToIndex.get(`${Math.floor((p.x[i] ?? 0) / CELL)},${Math.floor((p.y[i] ?? 0) / CELL)}`);
    if (idx != null) hit.add(idx);
  }
  for (const idx of hit) out[idx]! += 1;
}

for (const zf of zips) {
  const zip = await JSZip.loadAsync(readFileSync(join(zipDir, zf)));
  const rd = async (n: string) => JSON.parse(await zip.file(n)!.async("string"));
  const replay = await rd("replay.json"), rounds = await rd("rounds.json"), players = await rd("players.json"), grenades = await rd("grenades.json"), match = await rd("match.json");
  const coordScale = replay.meta.coordScale, angleScale = replay.meta.angleScale;
  const teamByIndex: string[] = players.map((p: any) => p.teamKey);
  const roundRow = new Map<number, any>(rounds.map((r: any) => [r.roundNumber, r]));
  const smokes = grenades.filter((g: any) => g.grenade === "smoke");
  // 队伍过滤：只取目标队在 CT 侧的回合
  const targetTeamKey = tf ? ((match.teamA?.name ?? "").toLowerCase().includes(tf) ? "teamA" : "teamB") : null;

  for (const rr of replay.rounds) {
    const meta = roundRow.get(rr.roundNumber); if (!meta) continue;
    const ctTeam = meta.teamASide === "ct" ? "teamA" : "teamB";
    if (targetTeamKey && ctTeam !== targetTeamKey) continue;
    if ((ctTeam === "teamA" ? meta.teamAEconomy : meta.teamBEconomy) !== CT_ECON_LABEL) continue;
    gunRounds += 1;
    const tickStep = rr.tickStep, startTick = rr.startTick, freezeEnd = meta.freezeEndTick;
    const cts: Track[] = [], ts: Track[] = [];
    for (const t of rr.players) (teamByIndex[t.playerIndex] === ctTeam ? cts : ts).push(decode(t, coordScale, angleScale));
    const frames = cts[0]?.x.length ?? ts[0]?.x.length ?? 0;
    for (let i = 0; i < frames; i += SAMPLE_EVERY) {
      const sec = Math.floor((startTick + i * tickStep - freezeEnd) / 64);
      if (sec < 0 || sec >= MAX_SEC) continue;
      const tick = startTick + i * tickStep;
      denom[sec]! += 1;
      const active = smokes.filter((g: any) => g.roundNumber === rr.roundNumber && g.effectTick <= tick && (g.destroyTick == null || tick <= g.destroyTick));
      markVision(cts, i, ctVis[sec]!, active);
      markVision(ts, i, tVis[sec]!, active);
      markPresence(cts, i, ctPres[sec]!);
      markPresence(ts, i, tPres[sec]!);
    }
  }
}

const dump = (f: Float64Array[]) => f.map((r) => Array.from(r).map((v) => Math.round(v)));
writeFileSync(outJson, JSON.stringify({
  mapName, cell: CELL, maxSec: MAX_SEC, gunRounds,
  grid: grid.map((g) => [Math.round(g.x), Math.round(g.y), Math.round(g.z)]),
  denom: Array.from(denom),
  fields: { ctVis: dump(ctVis), tVis: dump(tVis), ctPres: dump(ctPres), tPres: dump(tPres) },
}));
console.log(`[shard ${si}/${sc}] ${zips.length} 场 ${gunRounds} 满买局 → ${outJson}`);
