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
  plantRatePercent: number | null;
  rounds: Array<{ matchId: string; roundNumber: number; won: boolean; economy: string }>;
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
      targetSite: f.targetSite,
      defaultsBasis: db,
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
      plantRatePercent: pct(
        rows.filter((f) => c.rounds.some((r) => r.matchId === f.matchId && r.roundNumber === f.roundNumber) && f.plant != null).length,
        c.roundCount
      ),
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

export function suspectFake(f: TacticalRoundFact): { suspected: boolean; confidence?: "low" | "medium"; reason?: string } {
  const other = f.targetSite === "a" ? "b" : "a";
  if (!f.targetSite) return { suspected: false };
  const otherEntries = f.siteEntries[other as "a" | "b"];
  const otherGrenades = f.grenades.filter((grenade) => grenade.targetRegion === other);
  const smokeCount = otherGrenades.filter((grenade) => grenade.type === "smoke").length;
  if (otherGrenades.length >= 3 && smokeCount >= 1 && otherEntries.entrants === 0) {
    return {
      suspected: true,
      confidence: "medium",
      reason: `${other.toUpperCase()} 区疑似道具佯攻 · Experimental（道具${otherGrenades.length}/烟${smokeCount}/进点0）`,
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
