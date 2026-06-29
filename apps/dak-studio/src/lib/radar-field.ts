/**
 * 雷达场缓存与聚合（Studio 编排层）。
 *
 * per-match 贡献（[teamA, teamB] 两份加性场）持久化到 blobs 命名空间——字节存储，
 * IndexedDB / 桌面 SQLite 后端都按字节处理（不走 records 的 JSON 序列化，Int32Array 无损）。
 * 因为场加性：换 scope（赛事基线 / 各队）复用同一批 per-match 缓存，只在内存重聚合（毫秒）；
 * 首次算某图（worker 池并行逐 tick LOS）一次，之后所有 scope、所有会话秒开。
 *
 * 缓存 key 不含版本号，版本写进 blob header；读时校验 computeVersion/calibrationVersion
 * 不符即当未命中重算覆盖（无泄漏）。算法/标定变更 → core 的 RADAR_FIELD_VERSION +1 即可。
 */
import type { RadarField, RadarFieldBase } from "@cs2dak/contract";
import { aggregateRadarFields, RADAR_FIELD_VERSION } from "@cs2dak/core";
import { MAP_CALIBRATION_VERSION } from "@cs2dak/maps";
import { radarFieldInWorker } from "./library";
import { getStorage } from "./storage";

const FIELD_BASES: RadarFieldBase[] = ["ctVis", "tVis", "ctPres", "tPres"];
const SERIAL_FORMAT = 1;
const RADAR_FIELD_LOAD_CONCURRENCY = 2;

const fieldBlobs = getStorage().blobs("radar_field");
// 会话内已反序列化的场，避免重复读盘 / 解码。
const memCache = new Map<string, Promise<RadarField[]>>();

function cacheKey(matchId: string, economy: "gun" | "all"): string {
  return `${matchId}:${economy}`;
}

// ── 紧凑二进制序列化 ──
// [uint32 headerByteLen][header JSON utf8][Int32 payload]
// payload 逐贡献：denomCt(maxSec) denomT(maxSec) ctVis/tVis/ctPres/tPres(各 maxSec*nCells)

interface SerialHeader {
  fmt: number;
  computeVersion: number;
  calibrationVersion: string;
  schemaVersion: number;
  mapName: string;
  maxSec: number;
  triAvailability: "full" | "none";
  grid: { cellSize: number; cells: Array<[number, number, number]> };
  nCells: number;
  contributions: Array<{ team: string | null; economy: "gun" | "all"; roundCount: number; matchIds: string[] }>;
}

function serializeMatchRadarFields(fields: RadarField[]): ArrayBuffer {
  const sample = fields[0];
  const maxSec = sample?.maxSec ?? 0;
  const cells = sample?.grid.cells ?? [];
  const nCells = cells.length;
  const header: SerialHeader = {
    fmt: SERIAL_FORMAT,
    computeVersion: RADAR_FIELD_VERSION,
    calibrationVersion: MAP_CALIBRATION_VERSION,
    schemaVersion: sample?.schemaVersion ?? 1,
    mapName: sample?.mapName ?? "",
    maxSec,
    triAvailability: sample?.triAvailability ?? "none",
    grid: { cellSize: sample?.grid.cellSize ?? 0, cells },
    nCells,
    contributions: fields.map((f) => ({
      team: f.scope.team,
      economy: f.scope.economy,
      roundCount: f.scope.roundCount,
      matchIds: f.scope.matchIds,
    })),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));

  const intsPerContribution = maxSec * 2 + maxSec * nCells * FIELD_BASES.length;
  const ints = new Int32Array(intsPerContribution * fields.length);
  let off = 0;
  for (const f of fields) {
    ints.set(f.denomCt, off); off += maxSec;
    ints.set(f.denomT, off); off += maxSec;
    for (const base of FIELD_BASES) {
      for (let s = 0; s < maxSec; s++) { ints.set(f.fields[base][s]!, off); off += nCells; }
    }
  }

  const out = new Uint8Array(4 + headerBytes.length + ints.byteLength);
  new DataView(out.buffer).setUint32(0, headerBytes.length, true);
  out.set(headerBytes, 4);
  out.set(new Uint8Array(ints.buffer, ints.byteOffset, ints.byteLength), 4 + headerBytes.length);
  return out.buffer;
}

function deserializeMatchRadarFields(buf: ArrayBuffer): RadarField[] | null {
  if (buf.byteLength < 4) return null;
  const headerLen = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headerLen))) as SerialHeader;
  if (header.computeVersion !== RADAR_FIELD_VERSION || header.calibrationVersion !== MAP_CALIBRATION_VERSION) return null;
  if (header.contributions.length === 0) return [];

  const { maxSec, nCells } = header;
  const ints = new Int32Array(buf.slice(4 + headerLen)); // slice → 4 字节对齐的独立拷贝
  let off = 0;
  return header.contributions.map((c) => {
    const denomCt = ints.slice(off, off + maxSec); off += maxSec;
    const denomT = ints.slice(off, off + maxSec); off += maxSec;
    const fieldRows = {} as Record<RadarFieldBase, Int32Array[]>;
    for (const base of FIELD_BASES) {
      const rows: Int32Array[] = [];
      for (let s = 0; s < maxSec; s++) { rows.push(ints.slice(off, off + nCells)); off += nCells; }
      fieldRows[base] = rows;
    }
    return {
      schemaVersion: header.schemaVersion,
      computeVersion: header.computeVersion,
      mapName: header.mapName,
      calibrationVersion: header.calibrationVersion,
      triAvailability: header.triAvailability,
      scope: { kind: "team", team: c.team, economy: c.economy, roundCount: c.roundCount, matchIds: c.matchIds },
      grid: header.grid,
      maxSec,
      denomCt,
      denomT,
      fields: fieldRows,
    } satisfies RadarField;
  });
}

async function computeAndCache(matchId: string, economy: "gun" | "all"): Promise<RadarField[]> {
  const buffer = await getStorage().blobs("demos").get(matchId);
  if (!buffer) return [];
  const fields = await radarFieldInWorker(buffer, matchId, economy, false);
  try {
    await fieldBlobs.put(cacheKey(matchId, economy), serializeMatchRadarFields(fields));
  } catch {
    // 缓存是优化；落盘失败不影响本次结果。
  }
  return fields;
}

/** 取一场的两份场贡献（[teamA, teamB]）；命中持久化缓存直接解码，否则 worker 算后落盘。 */
export function getMatchRadarFields(matchId: string, economy: "gun" | "all" = "gun"): Promise<RadarField[]> {
  const key = cacheKey(matchId, economy);
  const inMem = memCache.get(key);
  if (inMem) return inMem;
  const loading = (async () => {
    try {
      const cached = await fieldBlobs.get(key);
      if (cached) {
        const fields = deserializeMatchRadarFields(cached);
        if (fields) return fields;
      }
    } catch {
      // 读盘失败 → 重算。
    }
    return computeAndCache(matchId, economy);
  })();
  memCache.set(key, loading);
  loading.catch(() => memCache.delete(key));
  return loading;
}

export interface RadarScopeRequest {
  matchIds: string[];
  economy?: "gun" | "all";
  scope: { kind: "league" | "team"; team: string | null };
  /** team scope：仅保留 raw 队名经此判定为真的贡献（按 identity 归并后的显示名匹配）。 */
  includeTeam?: (rawTeamName: string) => boolean;
  onProgress?: (done: number, total: number) => void;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await run(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** 聚合一个 scope 的雷达场（赛事基线或单队）。worker 池并发算缺失场，命中缓存秒回。 */
export async function buildScopeRadarField(req: RadarScopeRequest): Promise<RadarField | null> {
  const economy = req.economy ?? "gun";
  const total = req.matchIds.length;
  let done = 0;
  const perMatch = await mapLimit(req.matchIds, RADAR_FIELD_LOAD_CONCURRENCY, async (id) => {
    const fields = await getMatchRadarFields(id, economy);
    done += 1;
    req.onProgress?.(done, total);
    return fields;
  });
  const contributions: RadarField[] = [];
  for (const fields of perMatch) {
    for (const f of fields) {
      if (req.scope.kind === "league" || !req.includeTeam || (f.scope.team != null && req.includeTeam(f.scope.team))) {
        contributions.push(f);
      }
    }
  }
  return aggregateRadarFields(contributions, req.scope);
}
