import type { DemoPackage, Side } from "@cs2dak/contract";

export interface OpeningPatternInput {
  matchId: string;
  pkg: DemoPackage;
}

export interface OpeningPatternCluster {
  id: string;
  mapName: string;
  side: Side;
  windowSeconds: number;
  basis: string;
  roundCount: number;
  winRatePercent: number | null;
  grenadeSequence: string[];
  rounds: Array<{ matchId: string; roundNumber: number; won: boolean }>;
}

export interface OpeningPatternOptions {
  windowSeconds?: 15 | 20 | 30;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function distributionKey(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, count]) => `${label}:${count}`).join("|");
}

/** Resolve a player's side (t/ct) for a given round from their teamKey. */
function playerSideAtRound(pkg: DemoPackage, round: { teamASide: Side; teamBSide: Side }, playerIndex: number): Side | null {
  const player = pkg.players[playerIndex];
  if (!player) return null;
  return player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
}

function grenadeKey(pkg: DemoPackage, round: { roundNumber: number; teamASide: Side; teamBSide: Side }, side: Side, windowStart: number, windowEnd: number): string[] {
  return pkg.grenades
    .filter((grenade) => {
      if (grenade.roundNumber !== round.roundNumber) return false;
      if (grenade.throwTick < windowStart || grenade.throwTick > windowEnd) return false;
      return playerSideAtRound(pkg, round, grenade.throwerIndex) === side;
    })
    .sort((a, b) => a.throwTick - b.throwTick)
    .map((grenade) => grenade.grenade);
}

export function buildOpeningPatternClusters(
  demos: OpeningPatternInput[],
  opts: OpeningPatternOptions = {}
): OpeningPatternCluster[] {
  const windowSeconds = opts.windowSeconds ?? 15;
  const clusters = new Map<string, OpeningPatternCluster>();

  for (const { matchId, pkg } of demos) {
    const tickrate = pkg.match.tickrate || 64;
    for (const round of pkg.rounds) {
      const sampleTick = round.freezeEndTick + windowSeconds * tickrate;
      for (const side of ["t", "ct"] as const) {
        // positions-1s was removed in v3; spatial label clustering pending replay-based re-impl
        const labels: string[] = [];
        if (labels.length === 0) continue;
        const basis = distributionKey(labels);
        const grenades = grenadeKey(pkg, round, side, round.freezeEndTick, sampleTick);
        const key = `${pkg.match.mapName}:${side}:${windowSeconds}:${basis}:${grenades.join(">")}`;
        const won = round.winnerSide === side;
        const cluster = clusters.get(key) ?? {
          id: key,
          mapName: pkg.match.mapName,
          side,
          windowSeconds,
          basis,
          roundCount: 0,
          winRatePercent: null,
          grenadeSequence: grenades,
          rounds: []
        };
        cluster.roundCount += 1;
        cluster.rounds.push({ matchId, roundNumber: round.roundNumber, won });
        clusters.set(key, cluster);
      }
    }
  }

  return [...clusters.values()]
    .map((cluster) => {
      const wins = cluster.rounds.filter((row) => row.won).length;
      return { ...cluster, winRatePercent: cluster.roundCount > 0 ? round(wins / cluster.roundCount * 100, 1) : null };
    })
    .sort((a, b) => b.roundCount - a.roundCount || a.id.localeCompare(b.id));
}
