import { decodeDelta, type DemoPackage, type Side, type TeamKey } from "@cs2dak/contract";
import { calloutNear, type CalloutGrid, type Vec3, type LineupGrenadeLike } from "@cs2dak/maps";

export interface MatchLineupObservations { matchId: string; mapName: string; tickrate: number; roundWinners: Array<[roundNumber: number, winnerTeamKey: TeamKey]>; grenades: Array<Omit<LineupGrenadeLike, "entryId">> }

function sideOf(pkg: DemoPackage, playerIndex: number, roundNumber: number): Side | null {
  const player = pkg.players[playerIndex];
  const round = pkg.rounds.find((row) => row.roundNumber === roundNumber);
  if (!player || !round) return null;
  return player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
}

function throwerPlaceAt(pkg: DemoPackage, roundNumber: number, playerIndex: number, tick: number): string | null {
  const replay = pkg.replay;
  if (!replay) return null;
  const replayRound = replay.rounds.find((row) => row.roundNumber === roundNumber);
  if (!replayRound) return null;
  const track = replayRound.players.find((player) => player.playerIndex === playerIndex);
  if (!track) return null;
  if (replayRound.frameCount <= 0 || replayRound.tickStep <= 0 || tick < replayRound.startTick || tick > replayRound.startTick + (replayRound.frameCount - 1) * replayRound.tickStep) return null;
  const frameIndex = Math.max(
    0,
    Math.min(replayRound.frameCount - 1, Math.round((tick - replayRound.startTick) / replayRound.tickStep)),
  );
  const placeIndex = track.place[frameIndex];
  if (placeIndex == null || placeIndex < 0 || placeIndex >= replay.placeDict.length) return null;
  return replay.placeDict[placeIndex] || null;
}

function throwerPracticePoseAt(
  pkg: DemoPackage,
  roundNumber: number,
  playerIndex: number,
  tick: number,
): LineupGrenadeLike["practicePose"] {
  const replay = pkg.replay;
  if (!replay) return null;
  const replayRound = replay.rounds.find((row) => row.roundNumber === roundNumber);
  if (!replayRound) return null;
  const track = replayRound.players.find((player) => player.playerIndex === playerIndex);
  if (!track) return null;
  if (replayRound.frameCount <= 0 || replayRound.tickStep <= 0 || tick < replayRound.startTick || tick > replayRound.startTick + (replayRound.frameCount - 1) * replayRound.tickStep) return null;
  const frameIndex = Math.max(
    0,
    Math.min(replayRound.frameCount - 1, Math.round((tick - replayRound.startTick) / replayRound.tickStep)),
  );
  const coordScale = replay.meta.coordScale || 1;
  const angleScale = replay.meta.angleScale || 1;
  const xs = decodeDelta(track.x);
  const ys = decodeDelta(track.y);
  const zs = decodeDelta(track.z);
  const yaws = decodeDelta(track.yaw);
  const pitches = decodeDelta(track.pitch ?? []);
  const values = [xs[frameIndex], ys[frameIndex], zs[frameIndex], yaws[frameIndex], pitches[frameIndex], coordScale, angleScale];
  if (!values.every((value) => value != null && Number.isFinite(value)) || angleScale === 0) return null;
  return { position: { x: xs[frameIndex]! * coordScale, y: ys[frameIndex]! * coordScale, z: zs[frameIndex]! * coordScale }, yaw: yaws[frameIndex]! / angleScale, pitch: pitches[frameIndex]! / angleScale };
}

function effectCalloutFor(grid: CalloutGrid | null, point: Vec3): {
  callout: string | null;
  confidence: number | null;
  samples: number | null;
  source: "exact" | "nearby" | null;
  distance: number | null;
} {
  if (!grid) return { callout: null, confidence: null, samples: null, source: null, distance: null };
  const result = calloutNear(grid, point, { horizontalRadius: 20, verticalRadius: 40 });
  return result
    ? { callout: result.callout, confidence: result.confidence, samples: result.samples, source: result.source, distance: result.distance }
    : { callout: null, confidence: null, samples: null, source: null, distance: null };
}

export function extractMatchLineupObservations(pkg: DemoPackage, options: { matchId: string; calloutGrid?: CalloutGrid | null }): MatchLineupObservations {
  const { matchId, calloutGrid: grid = null } = options;
  const roundsByNumber = new Map(pkg.rounds.map((round) => [round.roundNumber, round]));
  return {
    matchId,
    mapName: pkg.match.mapName,
    tickrate: pkg.match.tickrate || 64,
    roundWinners: pkg.rounds.map((round) => [round.roundNumber, round.winnerTeamKey]),
    grenades: (pkg.grenades ?? []).map((grenade) => {
      const round = roundsByNumber.get(grenade.roundNumber);
      const player = pkg.players[grenade.throwerIndex];
      const practicePose = throwerPracticePoseAt(pkg, grenade.roundNumber, grenade.throwerIndex, grenade.throwTick);
      const effect = effectCalloutFor(grid, grenade.effectPosition);
      return {
        roundNumber: grenade.roundNumber,
        grenade: grenade.grenade,
        throwerIndex: grenade.throwerIndex,
        throwTick: grenade.throwTick,
        throwPosition: grenade.throwPosition,
        effectPosition: grenade.effectPosition,
        practicePose,
        freezeEndTick: round?.freezeEndTick ?? 0,
        throwerPlaceName: throwerPlaceAt(pkg, grenade.roundNumber, grenade.throwerIndex, grenade.throwTick),
        effectCallout: effect.callout,
        effectCalloutConfidence: effect.confidence,
        effectCalloutSamples: effect.samples,
        side: sideOf(pkg, grenade.throwerIndex, grenade.roundNumber),
        teamKey: player?.teamKey ?? null,
      };
    }),
  };
}

