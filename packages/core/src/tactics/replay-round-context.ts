import { decodeDelta, type DemoPackage, type Side, type TeamKey } from "@cs2dak/contract";
import { calloutNear, type CalloutGrid, type Vec3 } from "@cs2dak/maps";

/**
 * A short-lived decoded replay round shared by replay-derived fact extractors.
 * It is deliberately not a public persisted shape: callers consume compact facts only.
 */
export interface ReplayRoundTrack {
  playerIndex: number;
  teamKey: TeamKey | null;
  side: Side | null;
  steamId64: string | null;
  x: number[];
  y: number[];
  z: number[];
  flags: number[];
  place: number[];
  weapon: number[];
}

export interface ReplayRoundContext {
  round: DemoPackage["rounds"][number];
  startTick: number;
  tickStep: number;
  frameCount: number;
  placeDict: readonly string[];
  weaponDict: readonly string[];
  tracks: ReplayRoundTrack[];
}

export function createReplayRoundContext(
  pkg: DemoPackage,
  round: DemoPackage["rounds"][number],
): ReplayRoundContext | null {
  const replayRound = pkg.replay?.rounds.find((row) => row.roundNumber === round.roundNumber);
  if (!pkg.replay || !replayRound) return null;
  const scale = pkg.replay.meta.coordScale;
  return {
    round,
    startTick: replayRound.startTick,
    tickStep: replayRound.tickStep,
    frameCount: replayRound.frameCount,
    placeDict: pkg.replay.placeDict,
    weaponDict: pkg.replay.weaponDict,
    tracks: replayRound.players.map((track) => {
      const player = pkg.players[track.playerIndex];
      const teamKey = player?.teamKey ?? null;
      const side = teamKey === "teamA" ? round.teamASide : teamKey === "teamB" ? round.teamBSide : null;
      return {
        playerIndex: track.playerIndex,
        teamKey,
        side,
        steamId64: player?.steamId64 ?? null,
        x: decodeDelta(track.x).map((value) => value * scale),
        y: decodeDelta(track.y).map((value) => value * scale),
        z: decodeDelta(track.z).map((value) => value * scale),
        flags: track.flags,
        place: track.place,
        weapon: track.weapon,
      };
    }),
  };
}

export function createReplayRoundContexts(pkg: DemoPackage): Map<number, ReplayRoundContext> {
  const contexts = new Map<number, ReplayRoundContext>();
  for (const round of pkg.rounds) {
    const context = createReplayRoundContext(pkg, round);
    if (context) contexts.set(round.roundNumber, context);
  }
  return contexts;
}

export function replayTickAt(context: ReplayRoundContext, frameIndex: number): number {
  return context.startTick + frameIndex * context.tickStep;
}

export function replayPointAt(track: ReplayRoundTrack, frameIndex: number): Vec3 {
  return { x: track.x[frameIndex] ?? 0, y: track.y[frameIndex] ?? 0, z: track.z[frameIndex] ?? 0 };
}

export function replayCalloutAt(
  context: ReplayRoundContext,
  track: ReplayRoundTrack,
  frameIndex: number,
  grid: CalloutGrid | null,
): string | null {
  const place = context.placeDict[track.place[frameIndex] ?? -1] ?? null;
  if (place) return place;
  if (!grid) return null;
  return calloutNear(grid, replayPointAt(track, frameIndex), { horizontalRadius: 20, verticalRadius: 40 })?.callout ?? null;
}

export function replayWeaponAt(context: ReplayRoundContext, track: ReplayRoundTrack, frameIndex: number): string | null {
  return context.weaponDict[track.weapon[frameIndex] ?? -1] ?? null;
}
