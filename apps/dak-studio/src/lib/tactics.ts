import { DEFAULT_POSITIONS } from "@cs2dak/maps";
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
  const entries = f.siteEntries?.[f.targetSite ?? "a"];
  if (!entries || entries.entrants <= 0) return "-";
  return `${f.targetSite}:${entries.entrants}`;
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
    return {
      suspected: true,
      confidence: "medium",
      reason: `${other.toUpperCase()} 区疑似纯道具佯攻 · Experimental（道具${otherGrenades.length}/烟${smokeCount}/进点0）`,
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
