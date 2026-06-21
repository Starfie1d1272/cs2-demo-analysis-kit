import type { OpeningPattern } from "@cs2dak/core";

export type TacticalExecuteBucket = "rush" | "fast" | "mid" | "late";
export type EconomyEntry = "pistol" | "gun" | "anti_eco" | "force" | "semi" | "eco";

export interface TacticalPatternRow {
  side: "t" | "ct";
  targetSite: "a" | "b" | null;
  matchId: string;
  mapName: string;
  teamKey: string;
  /** 调用方可提供跨场 canonical identity；缺省时兼容回退到规范化原始名称。 */
  teamIdentity?: string;
  opponentIdentity?: string;
  teamName: string;
  opponentName: string;
  economy: string;
  opponentEconomy: string;
  won: boolean;
  roundNumber: number;
  openingPattern: OpeningPattern;
  siteEntries: {
    a: { entrants: number; order: Array<{ entryCallout: string | null; entryChokeId?: string | null; routeFamilyId?: string | null }> };
    b: { entrants: number; order: Array<{ entryCallout: string | null; entryChokeId?: string | null; routeFamilyId?: string | null }> };
  };
  plant: unknown | null;
  grenades: Array<{ type: string; targetRegion: "a" | "b" | "mid" | "other" | "unknown" }>;
  c4Route: { endRegion: "a" | "b" | "mid" | "other" | null; rotated: boolean } | null;
  executeBucket: TacticalExecuteBucket | null;
}

export interface TacticalEntryEvidenceRoute {
  site: "a" | "b";
  combo: string;
  roundCount: number;
  percentOfCovered: number;
}

export interface TacticalEntryEvidence {
  coveredRounds: number;
  totalRounds: number;
  coveragePercent: number;
  routes: TacticalEntryEvidenceRoute[];
}

export interface TacticalCluster {
  id: string;
  mapName: string;
  side: TacticalPatternRow["side"];
  economyEntry: EconomyEntry;
  /** 当前事实中可用的跨场队伍身份（规范化 teamName）。 */
  teamIdentity: string;
  teamName: string;
  opponentNames: string[];
  opponentIdentities: string[];
  /** 真实 OpeningPattern 的区域人数与 spread，不含任何最终打点事实。 */
  openingIntent: Pick<OpeningPattern, "regionCounts" | "spread">;
  /** 真实默认位人数结构；精确人数是开局身份的一部分。 */
  defaultAnchorCounts: Record<string, number>;
  primaryCategory: string;
  openingSignature: string;
  entryEvidence: TacticalEntryEvidence;
  roundCount: number;
  winRatePercent: number | null;
  plantRatePercent: number | null;
  rounds: Array<{ matchId: string; roundNumber: number; teamKey: string; won: boolean; economy: string; planted: boolean }>;
}

export function economyEntryOf(economy: string, opponentEconomy: string): EconomyEntry {
  if (economy === "pistol") return "pistol";
  if (economy === "full") return opponentEconomy === "full" ? "gun" : "anti_eco";
  if (economy === "force") return "force";
  if (economy === "semi") return "semi";
  return "eco";
}

export function defaultsBasisKey(defaults: Record<string, number>): string {
  return Object.entries(defaults)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => `${id}:${count}`)
    .join("|");
}
export const advancedBasisKey = defaultsBasisKey;

/** 稳定默认位身份：按 anchor id 排序，并保留真实人数结构。 */
export function defaultAnchorSetKey(defaults: Record<string, number>): string {
  return defaultsBasisKey(defaults);
}

export function openingIntentKey(pattern: OpeningPattern): string {
  const { a, mid, b } = pattern.regionCounts;
  return `${a}A-${mid}MID-${b}B:${pattern.spread}`;
}

function teamIdentityOf(row: TacticalPatternRow): string {
  return row.teamIdentity ?? row.teamName.trim().toLowerCase();
}

function opponentIdentityOf(row: TacticalPatternRow): string {
  return row.opponentIdentity ?? row.opponentName.trim().toLowerCase();
}

export function openingPatternKey(row: TacticalPatternRow): string {
  return [row.mapName, row.side, openingIntentKey(row.openingPattern), defaultAnchorSetKey(row.openingPattern.defaultAnchorCounts)].join(":");
}

/** 单回合真实进点证据。缺少目标点或入口时返回 null，不用 fallback 猜测。 */
export function entryEvidenceKey(row: TacticalPatternRow): { site: "a" | "b"; combo: string } | null {
  if (row.side !== "t") return null;
  const site = row.targetSite;
  if (!site) return null;
  const ids = new Set<string>();
  for (const occurrence of row.siteEntries[site].order) {
    const id = occurrence.entryChokeId ?? occurrence.routeFamilyId;
    if (id) ids.add(id);
  }
  if (ids.size === 0) return null;
  return { site, combo: [...ids].sort().join("+") };
}

/** 兼容既有调用：该函数现在只读取真实进点 evidence，不参与聚类 key。 */
export function chokeComboOf(row: TacticalPatternRow, site: "a" | "b" | null): string | null {
  const evidence = entryEvidenceKey(row);
  return evidence?.site === site ? evidence.combo : null;
}

export function tacticalClusterKey(row: TacticalPatternRow): string {
  return [
    row.side,
    row.mapName,
    teamIdentityOf(row),
    economyEntryOf(row.economy, row.opponentEconomy),
    openingIntentKey(row.openingPattern),
    defaultAnchorSetKey(row.openingPattern.defaultAnchorCounts) || "-",
  ].join("|");
}

function primaryCategoryOf(pattern: OpeningPattern): string {
  const { a, mid, b } = pattern.regionCounts;
  const max = Math.max(a, mid, b);
  const leaders = [a === max ? "A侧" : null, mid === max ? "中路" : null, b === max ? "B侧" : null].filter(Boolean);
  return leaders.length === 1 ? `${leaders[0]}控图` : "均衡控图";
}

export function buildTacticalClusters(rows: readonly TacticalPatternRow[]): TacticalCluster[] {
  const clusters = new Map<string, TacticalCluster>();
  const entryCounts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const id = tacticalClusterKey(row);
    const cluster: TacticalCluster = clusters.get(id) ?? {
      id,
      mapName: row.mapName,
      side: row.side,
      economyEntry: economyEntryOf(row.economy, row.opponentEconomy),
      teamIdentity: teamIdentityOf(row),
      teamName: row.teamName,
      opponentNames: [row.opponentName],
      opponentIdentities: [opponentIdentityOf(row)],
      openingIntent: {
        regionCounts: { ...row.openingPattern.regionCounts },
        spread: row.openingPattern.spread,
      },
      defaultAnchorCounts: { ...row.openingPattern.defaultAnchorCounts },
      primaryCategory: primaryCategoryOf(row.openingPattern),
      openingSignature: openingPatternKey(row),
      entryEvidence: { coveredRounds: 0, totalRounds: 0, coveragePercent: 0, routes: [] },
      roundCount: 0,
      winRatePercent: null,
      plantRatePercent: null,
      rounds: [],
    };
    cluster.roundCount += 1;
    if (!cluster.opponentNames.includes(row.opponentName)) {
      cluster.opponentNames.push(row.opponentName);
      cluster.opponentNames.sort((a, b) => a.localeCompare(b));
    }
    const opponentIdentity = opponentIdentityOf(row);
    if (!cluster.opponentIdentities.includes(opponentIdentity)) cluster.opponentIdentities.push(opponentIdentity);
    cluster.rounds.push({
      matchId: row.matchId,
      roundNumber: row.roundNumber,
      teamKey: row.teamKey,
      won: row.won,
      economy: row.economy,
      planted: row.plant != null,
    });
    const evidence = entryEvidenceKey(row);
    if (evidence) {
      const counts = entryCounts.get(id) ?? new Map<string, number>();
      const routeKey = `${evidence.site}:${evidence.combo}`;
      counts.set(routeKey, (counts.get(routeKey) ?? 0) + 1);
      entryCounts.set(id, counts);
    }
    clusters.set(id, cluster);
  }
  const percent = (numerator: number, denominator: number) =>
    denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
  return [...clusters.values()]
    .map((cluster) => {
      const counts = entryCounts.get(cluster.id) ?? new Map<string, number>();
      const coveredRounds = [...counts.values()].reduce((sum, count) => sum + count, 0);
      return {
        ...cluster,
        winRatePercent: percent(cluster.rounds.filter((round) => round.won).length, cluster.roundCount),
        plantRatePercent: percent(cluster.rounds.filter((round) => round.planted).length, cluster.roundCount),
        entryEvidence: {
          coveredRounds,
          totalRounds: cluster.roundCount,
          coveragePercent: percent(coveredRounds, cluster.roundCount),
          routes: [...counts.entries()]
            .map(([key, roundCount]) => ({
              site: key.slice(0, 1) as "a" | "b",
              combo: key.slice(2),
              roundCount,
              percentOfCovered: percent(roundCount, coveredRounds),
            }))
            .sort((a, b) => b.roundCount - a.roundCount || a.site.localeCompare(b.site) || a.combo.localeCompare(b.combo)),
        },
      };
    })
    .sort((a, b) => b.roundCount - a.roundCount || a.id.localeCompare(b.id));
}
