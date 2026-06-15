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
  targetSite: "a" | "b" | null;
  defaultsBasis: string;
  entryAnchors: string[];
  executeBucket: ExecuteBucket | null;
  roundCount: number;
  winRatePercent: number | null;
  plantRatePercent: number | null;
  rounds: Array<{ matchId: string; roundNumber: number; won: boolean; economy: string }>;
}

export function tacticalClusterKey(f: TacticalRoundFact, defaultsBasis?: string): string {
  const defaults = defaultsBasis ?? defaultsBasisKey(f.snapshots[0]?.defaults ?? {});
  const entries = [...f.entryAnchors].sort().join(",");
  return `${f.mapName}:${f.side}:${f.targetSite ?? "-"}:${defaults}:${entries}:${f.executeBucket ?? "-"}`;
}

export function buildTacticalClusters(rows: TacticalRoundFact[]): TacticalCluster[] {
  const map = new Map<string, TacticalCluster>();
  for (const f of rows) {
    const db = defaultsBasisKey(f.snapshots[0]?.defaults ?? {});
    const id = tacticalClusterKey(f, db);
    const c = map.get(id) ?? {
      id,
      mapName: f.mapName,
      side: f.side,
      targetSite: f.targetSite,
      defaultsBasis: db,
      entryAnchors: f.entryAnchors,
      executeBucket: f.executeBucket,
      roundCount: 0,
      winRatePercent: null,
      plantRatePercent: null,
      rounds: [],
    };
    c.roundCount += 1;
    c.rounds.push({ matchId: f.matchId, roundNumber: f.roundNumber, won: f.won, economy: f.economy });
    map.set(id, c);
  }
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  return [...map.values()]
    .map((c) => ({
      ...c,
      winRatePercent: pct(c.rounds.filter((r) => r.won).length, c.roundCount),
    }))
    .sort((a, b) => b.roundCount - a.roundCount || a.id.localeCompare(b.id));
}

// ── Phase 4: 判断层 v0 ────────────────────────────────────────────────────────

const BUCKET_CN: Record<string, string> = { rush: "提速", fast: "速爆", mid: "默认", late: "后打" };

export function suspectFake(f: TacticalRoundFact): { suspected: boolean; reason?: string } {
  const other = f.targetSite === "a" ? "b" : "a";
  if (!f.targetSite) return { suspected: false };
  const inv = f.siteInvestment[other as "a" | "b"];
  if (inv && inv.grenadeCount >= 2 && inv.entryCount === 0) {
    return {
      suspected: true,
      reason: `${other.toUpperCase()} 区道具佯攻（道具${inv.grenadeCount}/进点0）`,
    };
  }
  return { suspected: false };
}

export function autoName(
  c: Pick<TacticalCluster, "mapName" | "side" | "defaultsBasis" | "entryAnchors" | "executeBucket" | "targetSite">
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
