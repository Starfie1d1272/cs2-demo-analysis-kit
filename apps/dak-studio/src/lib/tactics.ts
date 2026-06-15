import { DEFAULT_POSITIONS, calloutTendency } from "@cs2dak/maps";
import type { TacticalRoundFact, ExecuteBucket } from "./facts.js";

// ── Phase 3.1: 双层 basis 序列化 ─────────────────────────────────────────────

export function defaultsBasisKey(defaults: Record<string, number>): string {
  return Object.entries(defaults)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, n]) => `${id}:${n}`)
    .join("|");
}

export const advancedBasisKey = defaultsBasisKey;

// ── Phase 3.2: 聚类 key + 簇构建 ─────────────────────────────────────────────

export interface TacticalCluster {
  id: string;
  mapName: string;
  side: TacticalRoundFact["side"];
  teamName: string;
  opponentName: string;
  targetSite: "a" | "b" | null;
  /** 大分类：T 方为打A/打B/中路争夺；CT 方为双B/三中路/双B单A 等站位架构。 */
  primaryCategory: string;
  defaultsBasis: string;
  executeBucket: ExecuteBucket | null;
  roundCount: number;
  winRatePercent: number | null;
  /** T 簇：本方下包率；CT 簇：对手下包率（同一回合事件，按本簇 side 的回合统计，不跨 side 重复计数）。 */
  plantRatePercent: number | null;
  /** 簇内疑似纯道具佯攻的回合数（仅 T 簇有意义，CT 恒为 0）。 */
  fakeRoundCount: number;
  rounds: Array<{ matchId: string; roundNumber: number; won: boolean; economy: string; planted: boolean }>;
}

function snapshotBasisKey(snapshot: TacticalRoundFact["snapshots"][number] | undefined): string {
  if (!snapshot) return "-";
  const defaults = defaultsBasisKey(snapshot.defaults);
  const advanced = advancedBasisKey(snapshot.advanced);
  if (defaults && advanced) return `${defaults}+${advanced}`;
  return defaults || advanced || "-";
}

export function tacticalClusterKey(f: TacticalRoundFact, defaultsBasis?: string): string {
  const first = defaultsBasis ?? snapshotBasisKey(f.snapshots[0]);
  if (f.side === "ct") {
    return [
      f.mapName,
      f.side,
      f.economy,
      first,
      snapshotBasisKey(f.snapshots[1]),
      snapshotBasisKey(f.snapshots[2]),
      "-",
    ].join(":");
  }
  return [
    f.mapName,
    f.side,
    f.economy,
    first,
    snapshotBasisKey(f.snapshots[1]),
    f.targetSite ?? "-",
    entryStructureKey(f),
    f.executeBucket ?? "-",
  ].join(":");
}

// ── 大分类推导 ─────────────────────────────────────────────────────────────────

function tPrimaryCategory(targetSite: "a" | "b" | null): string {
  if (targetSite === "a") return "打A";
  if (targetSite === "b") return "打B";
  return "中路争夺";
}

const NUM_CN = ["", "单", "双", "三", "四", "五"];

/** 查锚点或 callout 的倾向方向：
 *  1. calloutName → CALLOUT_NAME_CN.tendency（如 SideHall → ["a"]）
 *  2. anchorId → DEFAULT_POSITIONS.callouts → calloutName → tendency（如 donut → SideHall → ["a"]）
 *  3. 前缀启发式 fallback（a_/b_/back_/mid*）
 */
function regionOfAnchor(mapName: string, side: "t" | "ct", anchorId: string): "a" | "b" | "mid" | null {
  // 直接查 callout 倾向
  const t = calloutTendency(mapName, anchorId)?.[0];
  if (t) return t;
  // anchorId → anchor.callouts → callout 倾向（覆盖前缀推不出的锚点）
  const anchor = DEFAULT_POSITIONS[mapName]?.[side]?.anchors[anchorId];
  if (anchor) {
    for (const callout of anchor.callouts) {
      const ct = calloutTendency(mapName, callout)?.[0];
      if (ct) return ct;
    }
  }
  // 前缀启发式 fallback
  if (anchorId.startsWith("a_") || anchorId === "a") return "a";
  if (anchorId.startsWith("b_") || anchorId.startsWith("back_") || anchorId === "b") return "b";
  if (anchorId.startsWith("mid")) return "mid";
  return null;
}

/** 按 region 统计人数，生成如"双B单中路"的大分类标签。 */
function regionCategory(defaultsBasis: string, mapName: string, side: "t" | "ct"): string {
  if (!defaultsBasis || defaultsBasis === "-") return "其他";
  let a = 0, b = 0, mid = 0;
  for (const seg of defaultsBasis.split("|").filter(Boolean)) {
    const [id, nStr] = seg.split(":");
    const n = parseInt(nStr ?? "1", 10);
    if (!id) continue;
    const r = regionOfAnchor(mapName, side, id);
    if (r === "a") a += n;
    else if (r === "b") b += n;
    else if (r === "mid") mid += n;
  }
  const parts: string[] = [];
  if (b > 0) parts.push(`${NUM_CN[Math.min(b, 5)] ?? b}B`);
  if (mid > 0) parts.push(`${NUM_CN[Math.min(mid, 5)] ?? mid}中路`);
  if (a > 0) parts.push(`${NUM_CN[Math.min(a, 5)] ?? a}A`);
  return parts.length > 0 ? parts.join("") : "其他";
}

export function buildTacticalClusters(rows: TacticalRoundFact[]): TacticalCluster[] {
  const map = new Map<string, TacticalCluster>();
  for (const f of rows) {
    const db = snapshotBasisKey(f.snapshots[0]);
    const id = tacticalClusterKey(f, db);
    const c = map.get(id) ?? {
      id,
      mapName: f.mapName,
      side: f.side,
      teamName: f.teamName,
      opponentName: f.opponentName,
      // CT 视角下"目标包点 / 执行节奏"是 T 方语义，不属于防守方 → 固定 null，
      // 避免出现"CT 执行剩余 115s / CT 下包率"这类不成立的描述。
      targetSite: f.side === "ct" ? null : f.targetSite,
      primaryCategory: f.side === "t" ? tPrimaryCategory(f.targetSite) : regionCategory(db, f.mapName, "ct"),
      defaultsBasis: db,
      executeBucket: f.side === "ct" ? null : f.executeBucket,
      roundCount: 0,
      winRatePercent: null,
      plantRatePercent: null,
      fakeRoundCount: 0,
      rounds: [],
    };
    c.roundCount += 1;
    c.rounds.push({ matchId: f.matchId, roundNumber: f.roundNumber, won: f.won, economy: f.economy, planted: f.plant != null });
    if (suspectFake(f).suspected) c.fakeRoundCount += 1;
    map.set(id, c);
  }
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  return [...map.values()]
    .map((c) => ({
      ...c,
      winRatePercent: pct(c.rounds.filter((r) => r.won).length, c.roundCount),
      // 簇内回合都同 side（cluster key 含 side），按本簇回合的 planted 统计即可，
      // 不再回扫全量 rows（旧实现 T/CT 两条 fact 共享同一 plant，会双倍计数甚至 >100%）。
      plantRatePercent: pct(c.rounds.filter((r) => r.planted).length, c.roundCount),
    }))
    .sort((a, b) => b.roundCount - a.roundCount || a.id.localeCompare(b.id));
}

function entryStructureKey(f: TacticalRoundFact): string {
  if (!f.targetSite) return "-";
  const entries = f.siteEntries[f.targetSite];
  if (!entries || entries.entrants <= 0) return "-";
  // 按真实进点路线（entryCallout）分组，区分 A1/A2/拱门 等不同打法；
  // 无路线信息（旧 facts）时回退到"总进点人数"。
  const counts = new Map<string, number>();
  for (const o of entries.order) {
    if (!o.entryCallout) continue;
    counts.set(o.entryCallout, (counts.get(o.entryCallout) ?? 0) + 1);
  }
  if (counts.size === 0) return `${f.targetSite}:${entries.entrants}`;
  const structure = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([route, n]) => `${route}:${n}`)
    .join(",");
  return `${f.targetSite}:${structure}`;
}

// ── Phase 4: 判断层 v0 ────────────────────────────────────────────────────────

const BUCKET_CN: Record<string, string> = { rush: "提速", fast: "速爆", mid: "默认", late: "后打" };

/**
 * 疑似"纯道具佯攻"：仅对 T（进攻方）有意义。当前只覆盖一种形态——
 * 在非目标点投放成片道具（含烟）却无人真正进点。CT 防守方不存在"佯攻"语义，直接返回 false。
 */
export function suspectFake(f: TacticalRoundFact): { suspected: boolean; confidence?: "low" | "medium"; reason?: string } {
  if (f.side !== "t" || !f.targetSite) return { suspected: false };
  const other = f.targetSite === "a" ? "b" : "a";
  const otherEntries = f.siteEntries[other as "a" | "b"];
  const otherGrenades = f.grenades.filter((grenade) => grenade.targetRegion === other);
  const smokeCount = otherGrenades.filter((grenade) => grenade.type === "smoke").length;
  if (otherGrenades.length >= 3 && smokeCount >= 1 && otherEntries.entrants === 0) {
    // C4 轨迹作为第二条独立证据：C4 最终走向真实目标点（与道具佯攻点相反）→ 提高置信。
    const c4 = f.c4Route;
    const c4Corroborates = Boolean(c4 && (c4.endRegion === f.targetSite || c4.rotated));
    const c4Note = c4
      ? `；C4 ${c4.rotated ? "中途转点" : "走向"}${c4.endRegion ? c4.endRegion.toUpperCase() : "？"}`
      : "";
    return {
      suspected: true,
      confidence: c4Corroborates ? "medium" : "low",
      reason: `${other.toUpperCase()} 区疑似纯道具佯攻 · Experimental（道具${otherGrenades.length}/烟${smokeCount}/进点0${c4Note}）`,
    };
  }
  return { suspected: false };
}

export function autoName(
  c: Pick<TacticalCluster, "mapName" | "side" | "defaultsBasis" | "executeBucket" | "targetSite">
): string {
  const anchors = DEFAULT_POSITIONS[c.mapName]?.[c.side].anchors ?? {};
  const parts = c.defaultsBasis
    .split("|")
    .filter(Boolean)
    .map((seg) => {
      const [id, n] = seg.split(":");
      return `${anchors[id!]?.name ?? id}×${n}`;
    });
  const bucket = c.executeBucket ? BUCKET_CN[c.executeBucket] ?? c.executeBucket : "";
  const site = c.targetSite ? c.targetSite.toUpperCase() : "";
  return `${bucket} ${site} · ${parts.join(" / ")}`.trim().replace(/^· /, "");
}
