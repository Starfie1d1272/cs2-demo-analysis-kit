/**
 * 雷达覆盖场计算 —— 把一场 DemoPackage 的 replay 榨成「按队归属」的加性场贡献。
 *
 * 几何判定复用地图侧 `staticLineOfSight` 与共享眼高/靶高常量；屏幕可见与准星覆盖只在
 * 相机坐标中分口径，避免重算昂贵 LOS。
 *
 * 每场产出两份贡献（teamA / teamB），各自：ct* 只填该队作 CT 的回合，
 * t* 只填该队作 T 的回合。于是：
 *   - 联赛基线 = 所有贡献相加（每回合的 CT 数据落 CT 队那份、T 数据落 T 队那份，不重复）
 *   - 单队场 = 该队所有贡献相加（该队 CT 回合看哪、T 回合站哪）
 * denom 按 side 分（每回合恰一个 CT 一个 T 队），归一化 = 计数 / 对应 side denom。
 */
import type { DemoPackage, PackageGrenade, RadarField, RadarFieldBase } from "@cs2dak/contract";
import { RADAR_FIELD_SCHEMA_VERSION, RADAR_FIELD_MAX_SEC, RADAR_FIELD_BASES, decodeDelta } from "@cs2dak/contract";
import {
  type RadarFieldGridIndex,
  type Vec3,
  type TriangleBvh,
  staticLineOfSight,
  radarFieldCellAt,
  MAP_CALIBRATION_VERSION,
} from "@cs2dak/maps";
import {
  EYE_HEIGHT,
  TARGET_HEIGHT,
} from "./duel-window.js";

/** 算法参数指纹；锥角/采样率/格大小/眼高/MAX_DIST 任一变更即 +1，使旧缓存场失效。 */
export const RADAR_FIELD_VERSION = 2;

/** 视野判定最大距离（世界单位），超出直接跳过 LOS。 */
const MAX_DIST = 4096;
const MAX_DIST_SQ = MAX_DIST * MAX_DIST;
const AIM_CONE_HALF_DEGREES = 30;
const AIM_CONE_COS = Math.cos((AIM_CONE_HALF_DEGREES * Math.PI) / 180);
const SCREEN_4X3_TAN_H = Math.tan((45 * Math.PI) / 180);
const SCREEN_4X3_TAN_V = Math.tan((36.87 * Math.PI) / 180);
const SMOKE_RADIUS = 144;
const SOUND_RADIUS = 800;
const SOUND_RADIUS_SQ = SOUND_RADIUS * SOUND_RADIUS;
const GUN_ECONOMY = new Set(["full", "conversion"]);
const SMOKE_TYPES = new Set(["smoke", "smokegrenade"]);
const EMPTY_SMOKES: SmokeGrenade[] = [];

const FIELD_BASES = RADAR_FIELD_BASES;

interface Track {
  x: number[];
  y: number[];
  z: number[];
  yaw: number[];
  pitch: number[];
  hp: number[];
  flash: number[];
}

interface ActiveViewer {
  eye: Vec3;
  fx: number;
  fy: number;
  fz: number;
  rx: number;
  ry: number;
  ux: number;
  uy: number;
  uz: number;
}

type SmokeGrenade = PackageGrenade & { effectPosition: Vec3 };

interface Contribution {
  team: string;
  matchId: string;
  roundCount: number;
  denomCt: Int32Array;
  denomT: Int32Array;
  fields: Record<RadarFieldBase, Int32Array[]>;
}

function makeFieldRows(maxSec: number, nCells: number): Int32Array[] {
  return Array.from({ length: maxSec }, () => new Int32Array(nCells));
}

function makeFields(maxSec: number, nCells: number): Record<RadarFieldBase, Int32Array[]> {
  const fields = {} as Record<RadarFieldBase, Int32Array[]>;
  for (const base of FIELD_BASES) fields[base] = makeFieldRows(maxSec, nCells);
  return fields;
}

function makeContribution(team: string, matchId: string, maxSec: number, nCells: number): Contribution {
  return {
    team,
    matchId,
    roundCount: 0,
    denomCt: new Int32Array(maxSec),
    denomT: new Int32Array(maxSec),
    fields: makeFields(maxSec, nCells),
  };
}

function decodeTrack(t: { x: number[]; y: number[]; z: number[]; yaw: number[]; pitch: number[]; hp: number[]; flash: number[] }, coordScale: number, angleScale: number): Track {
  const cum = (arr: number[], by: number) => decodeDelta(arr).map((v) => v / by);
  return {
    x: cum(t.x, coordScale),
    y: cum(t.y, coordScale),
    z: cum(t.z, coordScale),
    yaw: cum(t.yaw, angleScale),
    pitch: cum(t.pitch, angleScale),
    hp: t.hp,
    flash: t.flash,
  };
}

function activeViewersAt(viewers: Track[], i: number): ActiveViewer[] {
  const out: ActiveViewer[] = [];
  for (const v of viewers) {
    if ((v.hp[i] ?? 0) <= 0 || (v.flash[i] ?? 0) > 0) continue;
    const yaw = (v.yaw[i]! * Math.PI) / 180;
    const pitch = (v.pitch[i]! * Math.PI) / 180;
    const cp = Math.cos(pitch);
    const fx = cp * Math.cos(yaw);
    const fy = cp * Math.sin(yaw);
    const fz = -Math.sin(pitch);
    const rx = -Math.sin(yaw);
    const ry = Math.cos(yaw);
    out.push({
      eye: { x: v.x[i]!, y: v.y[i]!, z: v.z[i]! + EYE_HEIGHT },
      fx,
      fy,
      fz,
      rx,
      ry,
      ux: -fz * ry,
      uy: fz * rx,
      uz: fx * ry - fy * rx,
    });
  }
  return out;
}

function activeSmokesAt(smokes: SmokeGrenade[], tick: number): SmokeGrenade[] {
  let out: SmokeGrenade[] | null = null;
  for (const grenade of smokes) {
    if (grenade.effectTick <= tick && (grenade.destroyTick == null || tick <= grenade.destroyTick)) {
      (out ??= []).push(grenade);
    }
  }
  return out ?? EMPTY_SMOKES;
}

function pointToSegmentDistance(point: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = point.x - a.x, apy = point.y - a.y, apz = point.z - a.z;
  const denom = abx * abx + aby * aby + abz * abz;
  const t = denom < 1e-6 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / denom));
  const cx = a.x + abx * t, cy = a.y + aby * t, cz = a.z + abz * t;
  return Math.hypot(point.x - cx, point.y - cy, point.z - cz);
}

function smokeBlocksActiveRay(smokes: SmokeGrenade[], from: Vec3, to: Vec3): boolean {
  for (const smoke of smokes) {
    if (pointToSegmentDistance(smoke.effectPosition, from, to) <= SMOKE_RADIUS) return true;
  }
  return false;
}

function targetVector(viewer: ActiveViewer, target: Vec3): { dx: number; dy: number; dz: number; distSq: number; forward: number } | null {
  const dx = target.x - viewer.eye.x;
  const dy = target.y - viewer.eye.y;
  const dz = target.z - viewer.eye.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq <= 1e-6 || distSq > MAX_DIST_SQ) return null;
  const forward = viewer.fx * dx + viewer.fy * dy + viewer.fz * dz;
  return forward > 0 ? { dx, dy, dz, distSq, forward } : null;
}

function insideScreen4x3(viewer: ActiveViewer, target: Vec3): { dx: number; dy: number; dz: number; distSq: number; forward: number } | null {
  const v = targetVector(viewer, target);
  if (!v) return null;
  const x = viewer.rx * v.dx + viewer.ry * v.dy;
  const y = viewer.ux * v.dx + viewer.uy * v.dy + viewer.uz * v.dz;
  return Math.abs(x) <= v.forward * SCREEN_4X3_TAN_H && Math.abs(y) <= v.forward * SCREEN_4X3_TAN_V ? v : null;
}

function insideAimCone(v: { distSq: number; forward: number }): boolean {
  return v.forward * v.forward >= AIM_CONE_COS * AIM_CONE_COS * v.distSq;
}

export interface BuildMatchRadarFieldOptions {
  matchId: string;
  grid: RadarFieldGridIndex;
  /** 静态墙体 BVH；缺失时跳过 LOS（triAvailability=none，只保留锥+烟）。 */
  bvh?: TriangleBvh | null;
  /** gun = 长枪局（双方 full/conversion）；all = 全部回合。默认 gun。 */
  economy?: "gun" | "all";
}

/**
 * 算一场的雷达场贡献，返回 [teamA, teamB] 两份（各为独立 RadarField，scope.kind=team）。
 * 无 replay 时返回 []。studio 缓存这两份并跨场聚合。
 */
export function buildMatchRadarField(pkg: DemoPackage, options: BuildMatchRadarFieldOptions): RadarField[] {
  const { matchId, grid, bvh = null, economy = "gun" } = options;
  const replay = pkg.replay;
  if (!replay || replay.rounds.length === 0) return [];

  const maxSec = RADAR_FIELD_MAX_SEC;
  const nCells = grid.cells.length;
  const { coordScale, angleScale, sampleRate, tickrate } = replay.meta;

  // 预算每格的视线目标点（含靶高）。
  const targets: Vec3[] = grid.cells.map(([x, y, z]) => ({ x, y, z: z + TARGET_HEIGHT }));

  const teamKeyByIndex = pkg.players.map((p) => p.teamKey);
  const roundMeta = new Map(pkg.rounds.map((r) => [r.roundNumber, r]));
  const smokesByRound = new Map<number, SmokeGrenade[]>();
  for (const grenade of pkg.grenades ?? []) {
    if (!SMOKE_TYPES.has(grenade.grenade) || !grenade.effectPosition) continue;
    const bucket = smokesByRound.get(grenade.roundNumber) ?? [];
    bucket.push(grenade as SmokeGrenade);
    smokesByRound.set(grenade.roundNumber, bucket);
  }
  const teamNameByKey = { teamA: pkg.match.teamA.name ?? "Team A", teamB: pkg.match.teamB.name ?? "Team B" } as const;

  const contributions: Record<"teamA" | "teamB", Contribution> = {
    teamA: makeContribution(teamNameByKey.teamA, matchId, maxSec, nCells),
    teamB: makeContribution(teamNameByKey.teamB, matchId, maxSec, nCells),
  };

  const markVision = (viewers: Track[], i: number, screenOut: Int32Array, aimOut: Int32Array, activeSmokes: SmokeGrenade[]) => {
    const activeViewers = activeViewersAt(viewers, i);
    if (activeViewers.length === 0) return;
    for (let g = 0; g < nCells; g++) {
      const target = targets[g]!;
      for (const viewer of activeViewers) {
        const view = insideScreen4x3(viewer, target);
        if (!view) continue;
        if (activeSmokes.length > 0 && smokeBlocksActiveRay(activeSmokes, viewer.eye, target)) continue;
        if (bvh && !staticLineOfSight(bvh, viewer.eye, target)) continue;
        screenOut[g]! += 1;
        if (insideAimCone(view)) aimOut[g]! += 1;
        break;
      }
    }
  };

  const markSoundRisk = (listeners: Track[], i: number, out: Int32Array) => {
    const alive: Array<[number, number]> = [];
    for (const p of listeners) if ((p.hp[i] ?? 0) > 0) alive.push([p.x[i]!, p.y[i]!]);
    if (alive.length === 0) return;
    for (let g = 0; g < nCells; g++) {
      const [x, y] = grid.cells[g]!;
      for (const [lx, ly] of alive) {
        const dx = x - lx, dy = y - ly;
        if (dx * dx + dy * dy <= SOUND_RADIUS_SQ) {
          out[g]! += 1;
          break;
        }
      }
    }
  };

  const markPresence = (players: Track[], i: number, out: Int32Array) => {
    const hit = new Set<number>();
    for (const p of players) {
      if ((p.hp[i] ?? 0) <= 0) continue;
      const idx = radarFieldCellAt(grid, p.x[i] ?? 0, p.y[i] ?? 0);
      if (idx >= 0) hit.add(idx);
    }
    for (const idx of hit) out[idx]! += 1;
  };

  for (const rr of replay.rounds) {
    const meta = roundMeta.get(rr.roundNumber);
    if (!meta) continue;
    if (economy === "gun" && !(GUN_ECONOMY.has(meta.teamAEconomy) && GUN_ECONOMY.has(meta.teamBEconomy))) continue;

    const ctKey = meta.teamASide === "ct" ? "teamA" : "teamB";
    const tKey = ctKey === "teamA" ? "teamB" : "teamA";
    const ctContrib = contributions[ctKey];
    const tContrib = contributions[tKey];
    ctContrib.roundCount += 1;
    tContrib.roundCount += 1;

    const cts: Track[] = [];
    const ts: Track[] = [];
    for (const track of rr.players) {
      const decoded = decodeTrack(track, coordScale, angleScale);
      (teamKeyByIndex[track.playerIndex] === ctKey ? cts : ts).push(decoded);
    }
    const frames = cts[0]?.x.length ?? ts[0]?.x.length ?? 0;
    for (let i = 0; i < frames; i += sampleRate) {
      const tick = rr.startTick + i * rr.tickStep;
      const sec = Math.floor((tick - meta.freezeEndTick) / tickrate);
      if (sec < 0 || sec >= maxSec) continue;
      const activeSmokes = activeSmokesAt(smokesByRound.get(rr.roundNumber) ?? EMPTY_SMOKES, tick);
      ctContrib.denomCt[sec]! += 1;
      tContrib.denomT[sec]! += 1;
      markVision(cts, i, ctContrib.fields.ctVis[sec]!, ctContrib.fields.ctAim[sec]!, activeSmokes);
      markVision(ts, i, tContrib.fields.tVis[sec]!, tContrib.fields.tAim[sec]!, activeSmokes);
      markPresence(cts, i, ctContrib.fields.ctPres[sec]!);
      markPresence(ts, i, tContrib.fields.tPres[sec]!);
      markSoundRisk(ts, i, ctContrib.fields.ctSound[sec]!);
      markSoundRisk(cts, i, tContrib.fields.tSound[sec]!);
    }
  }

  const triAvailability = bvh ? "full" : "none";
  return (["teamA", "teamB"] as const).map((key) => {
    const c = contributions[key];
    const field: RadarField = {
      schemaVersion: RADAR_FIELD_SCHEMA_VERSION,
      computeVersion: RADAR_FIELD_VERSION,
      mapName: pkg.match.mapName,
      calibrationVersion: MAP_CALIBRATION_VERSION,
      triAvailability,
      scope: { kind: "team", team: c.team, economy, roundCount: c.roundCount, matchIds: [matchId] },
      grid: { cellSize: grid.cellSize, cells: grid.cells },
      maxSec,
      denomCt: c.denomCt,
      denomT: c.denomT,
      fields: c.fields,
    };
    return field;
  });
}

/** 把多份场加性合并成一个 scope 场（联赛基线或单队）。grid/maxSec 必须一致。 */
export function aggregateRadarFields(
  fields: RadarField[],
  scope: { kind: "league" | "team"; team: string | null }
): RadarField | null {
  if (fields.length === 0) return null;
  const first = fields[0]!;
  const maxSec = first.maxSec;
  const nCells = first.grid.cells.length;
  const denomCt = new Int32Array(maxSec);
  const denomT = new Int32Array(maxSec);
  const out = makeFields(maxSec, nCells);
  const matchIds = new Set<string>();
  const countedForRounds = new Set<string>();
  let roundCount = 0;
  let economy = first.scope.economy;

  for (const f of fields) {
    economy = f.scope.economy;
    for (let s = 0; s < maxSec; s++) {
      denomCt[s]! += f.denomCt[s]!;
      denomT[s]! += f.denomT[s]!;
      for (const base of FIELD_BASES) {
        const dst = out[base][s]!;
        const src = f.fields[base][s]!;
        for (let g = 0; g < nCells; g++) dst[g]! += src[g]!;
      }
    }
    // roundCount 按 matchId 去重计：联赛求和时同场两份贡献只算一次回合数。
    const mid = f.scope.matchIds[0];
    if (mid && !countedForRounds.has(mid)) {
      countedForRounds.add(mid);
      roundCount += f.scope.roundCount;
    }
    for (const m of f.scope.matchIds) matchIds.add(m);
  }

  return {
    schemaVersion: first.schemaVersion,
    computeVersion: first.computeVersion,
    mapName: first.mapName,
    calibrationVersion: first.calibrationVersion,
    triAvailability: fields.some((f) => f.triAvailability === "none") ? "none" : "full",
    scope: { kind: scope.kind, team: scope.team, economy, roundCount, matchIds: [...matchIds] },
    grid: first.grid,
    maxSec,
    denomCt,
    denomT,
    fields: out,
  };
}
