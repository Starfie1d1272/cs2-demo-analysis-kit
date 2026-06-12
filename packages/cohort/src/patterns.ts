import type { DemoPackage, Side } from "@cs2dak/contract";
import { FLAG_ALIVE } from "@cs2dak/contract";
import { createResolverFromPackage } from "@cs2dak/core";

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

function grenadeKey(pkg: DemoPackage, round: { roundNumber: number; teamASide: Side; teamBSide: Side }, side: Side, windowStart: number, windowEnd: number): string[] {
  const resolver = createResolverFromPackage(pkg);
  return pkg.grenades
    .filter((grenade) => {
      if (grenade.roundNumber !== round.roundNumber) return false;
      if (grenade.throwTick < windowStart || grenade.throwTick > windowEnd) return false;
      return resolver.sideOf(grenade.throwerIndex, round.roundNumber) === side;
    })
    .sort((a, b) => a.throwTick - b.throwTick)
    .map((grenade) => grenade.grenade);
}

function replayLabelsAt(
  pkg: DemoPackage,
  round: { roundNumber: number; teamASide: Side; teamBSide: Side },
  side: Side,
  sampleTick: number
): string[] {
  const replay = pkg.replay;
  const replayRound = replay?.rounds.find((row) => row.roundNumber === round.roundNumber);
  if (!replay || !replayRound) return [];
  const labels: string[] = [];
  for (const track of replayRound.players) {
    const player = pkg.players[track.playerIndex];
    if (!player) continue;
    const playerSide = player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
    if (playerSide !== side) continue;
    const frameIndex = Math.max(
      0,
      Math.min(replayRound.frameCount - 1, Math.round((sampleTick - replayRound.startTick) / replayRound.tickStep))
    );
    if (((track.flags[frameIndex] ?? 0) & FLAG_ALIVE) === 0) continue;
    const place = replay.placeDict?.[track.place[frameIndex] ?? -1];
    if (place) labels.push(place);
  }
  return labels.sort();
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
        const labels = replayLabelsAt(pkg, round, side, sampleTick);
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
