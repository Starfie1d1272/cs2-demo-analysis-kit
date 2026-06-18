import { inferTacticalFake, type OpeningPattern, type TacticalFakeInput } from "@cs2dak/core";

export type TacticalExecuteBucket = "rush" | "fast" | "mid" | "late";

export interface TacticalPatternRow extends TacticalFakeInput {
  matchId: string;
  mapName: string;
  teamName: string;
  opponentName: string;
  economy: string;
  won: boolean;
  roundNumber: number;
  openingPattern: OpeningPattern;
  siteEntries: {
    a: { entrants: number; order: Array<{ entryCallout: string | null }> };
    b: { entrants: number; order: Array<{ entryCallout: string | null }> };
  };
  plant: unknown | null;
  executeBucket: TacticalExecuteBucket | null;
}

export interface TacticalCluster {
  id: string;
  mapName: string;
  side: TacticalPatternRow["side"];
  teamName: string;
  opponentName: string;
  targetSite: "a" | "b" | null;
  primaryCategory: string;
  openingSignature: string;
  defaultsBasis: string;
  executeBucket: TacticalExecuteBucket | null;
  roundCount: number;
  winRatePercent: number | null;
  plantRatePercent: number | null;
  fakeRoundCount: number;
  rounds: Array<{ matchId: string; roundNumber: number; won: boolean; economy: string; planted: boolean }>;
}

export function defaultsBasisKey(defaults: Record<string, number>): string {
  return Object.entries(defaults)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => `${id}:${count}`)
    .join("|");
}

export const advancedBasisKey = defaultsBasisKey;

export function openingPatternKey(fact: TacticalPatternRow): string {
  return [fact.mapName, fact.side, fact.openingPattern.coarseSignature, fact.openingPattern.detailedSignature].join(":");
}

function entryStructureKey(fact: TacticalPatternRow): string {
  if (!fact.targetSite) return "-";
  const entries = fact.siteEntries[fact.targetSite];
  if (entries.entrants <= 0) return "-";
  const counts = new Map<string, number>();
  for (const occurrence of entries.order) {
    if (!occurrence.entryCallout) continue;
    counts.set(occurrence.entryCallout, (counts.get(occurrence.entryCallout) ?? 0) + 1);
  }
  if (counts.size === 0) return `${fact.targetSite}:${entries.entrants}`;
  return `${fact.targetSite}:${[...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([route, count]) => `${route}:${count}`)
    .join(",")}`;
}

export function tacticalClusterKey(fact: TacticalPatternRow): string {
  const opening = openingPatternKey(fact);
  if (fact.side === "ct") return opening;
  return [opening, fact.targetSite ?? "-", entryStructureKey(fact), fact.executeBucket ?? "-"].join(":");
}

const NUM_CN = ["", "单", "双", "三", "四", "五"];

function regionCategory(counts: OpeningPattern["regionCounts"]): string {
  const parts: string[] = [];
  if (counts.b > 0) parts.push(`${NUM_CN[Math.min(counts.b, 5)] ?? counts.b}B`);
  if (counts.mid > 0) parts.push(`${NUM_CN[Math.min(counts.mid, 5)] ?? counts.mid}中路`);
  if (counts.a > 0) parts.push(`${NUM_CN[Math.min(counts.a, 5)] ?? counts.a}A`);
  if (counts.unknown > 0) parts.push(`${counts.unknown}未知`);
  return parts.length > 0 ? parts.join("") : "其他";
}

export function buildTacticalClusters(rows: readonly TacticalPatternRow[]): TacticalCluster[] {
  const clusters = new Map<string, TacticalCluster>();
  for (const fact of rows) {
    const id = tacticalClusterKey(fact);
    const cluster = clusters.get(id) ?? {
      id,
      mapName: fact.mapName,
      side: fact.side,
      teamName: fact.teamName,
      opponentName: fact.opponentName,
      targetSite: fact.side === "ct" ? null : fact.targetSite,
      primaryCategory: regionCategory(fact.openingPattern.regionCounts),
      openingSignature: openingPatternKey(fact),
      defaultsBasis: defaultsBasisKey(fact.openingPattern.defaultAnchorCounts) || "-",
      executeBucket: fact.side === "ct" ? null : fact.executeBucket,
      roundCount: 0,
      winRatePercent: null,
      plantRatePercent: null,
      fakeRoundCount: 0,
      rounds: [],
    };
    cluster.roundCount += 1;
    cluster.rounds.push({
      matchId: fact.matchId,
      roundNumber: fact.roundNumber,
      won: fact.won,
      economy: fact.economy,
      planted: fact.plant != null,
    });
    if (inferTacticalFake(fact).suspected) cluster.fakeRoundCount += 1;
    clusters.set(id, cluster);
  }
  const percent = (numerator: number, denominator: number) =>
    denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
  return [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      winRatePercent: percent(cluster.rounds.filter((round) => round.won).length, cluster.roundCount),
      plantRatePercent: percent(cluster.rounds.filter((round) => round.planted).length, cluster.roundCount),
    }))
    .sort((a, b) => b.roundCount - a.roundCount || a.id.localeCompare(b.id));
}

