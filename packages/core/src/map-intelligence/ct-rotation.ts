import {
  CT_ROTATION_FACT_VERSION,
  MAP_INTELLIGENCE_FACT_VERSION,
  type CtRotationAvailability,
  type CtRotationRoundFact,
  type DemoPackage,
} from "@cs2dak/contract";
import { getPrimaryCalloutRegion, positionGroupOf, type CalloutGrid, type TacticalRegion } from "@cs2dak/maps";
import {
  replayCalloutAt,
  type ReplayRoundContext,
  type ReplayRoundTrack,
} from "../tactics/replay-round-context.js";
import { openingResponsibilityWindow } from "./opening-window.js";
import { rounded, type SpatialPlayerSample, type TeamSpatialFrame } from "./spatial.js";

export const CT_ROTATION_RESPONSE_PERSISTENCE_SECONDS = 2;

interface ContactEvent {
  tick: number;
  region: TacticalRegion;
}

interface ResponseObservation {
  leftTick: number;
  targetGroup: string;
  targetRegion: TacticalRegion | null;
  pathSeconds: number;
  initialAreaStillCovered: boolean | null;
  returned: boolean | null;
  resolvedTick: number;
}

function availability(
  pkg: DemoPackage,
  context: ReplayRoundContext | null,
  track: ReplayRoundTrack | null,
  grid: CalloutGrid | null,
  hasNav: boolean,
): CtRotationAvailability {
  const replay = context && track ? "available" : context ? "degraded" : "missing";
  const combatSources = Number(Boolean(pkg.manifest?.files?.damages)) + Number(Boolean(pkg.manifest?.files?.kills));
  return {
    replay,
    nav: hasNav ? "available" : "missing",
    callouts: context && (context.placeDict.length > 0 || grid) ? "available" : context ? "degraded" : "missing",
    shots: pkg.shots ? "available" : "missing",
    combatTimeline: combatSources === 2 ? "available" : combatSources === 1 ? "degraded" : "missing",
  };
}

function frameIndexForTick(context: ReplayRoundContext, tick: number): number {
  return Math.max(0, Math.min(context.frameCount - 1, Math.round((tick - context.startTick) / context.tickStep)));
}

function sideOf(pkg: DemoPackage, round: DemoPackage["rounds"][number], playerIndex: number): "t" | "ct" | null {
  const teamKey = pkg.players[playerIndex]?.teamKey;
  return teamKey === "teamA" ? round.teamASide : teamKey === "teamB" ? round.teamBSide : null;
}

function regionAt(
  pkg: DemoPackage,
  context: ReplayRoundContext,
  grid: CalloutGrid | null,
  playerIndex: number,
  tick: number,
): TacticalRegion | null {
  const track = context.tracks.find((row) => row.playerIndex === playerIndex);
  if (!track) return null;
  const callout = replayCalloutAt(context, track, frameIndexForTick(context, tick), grid);
  return callout ? getPrimaryCalloutRegion(pkg.match.mapName, callout) : null;
}

function contactEvents(
  pkg: DemoPackage,
  context: ReplayRoundContext,
  round: DemoPackage["rounds"][number],
  grid: CalloutGrid | null,
): ContactEvent[] {
  const result: ContactEvent[] = [];
  const add = (tick: number, first: number | null, second: number) => {
    if (first == null || pkg.players[first]?.teamKey === pkg.players[second]?.teamKey) return;
    const tPlayer = sideOf(pkg, round, first) === "t" ? first : sideOf(pkg, round, second) === "t" ? second : null;
    const fallback = sideOf(pkg, round, first) === "ct" ? first : second;
    const region = tPlayer == null ? null : regionAt(pkg, context, grid, tPlayer, tick) ?? regionAt(pkg, context, grid, fallback, tick);
    if (region) result.push({ tick, region });
  };
  for (const damage of pkg.damages) {
    if (damage.roundNumber === round.roundNumber && damage.healthDamageRaw > 0) add(damage.tick, damage.attackerIndex, damage.victimIndex);
  }
  for (const kill of pkg.kills) {
    if (kill.roundNumber === round.roundNumber) add(kill.tick, kill.killerIndex, kill.victimIndex);
  }
  return result.sort((a, b) => a.tick - b.tick);
}

function groupAndRegion(mapName: string, sample: SpatialPlayerSample): { group: string | null; region: TacticalRegion | null } {
  return {
    group: sample.callout ? positionGroupOf(mapName, "ct", sample.callout) : null,
    region: sample.callout ? getPrimaryCalloutRegion(mapName, sample.callout) : null,
  };
}

function stableGroupAt(
  frames: readonly TeamSpatialFrame[],
  startIndex: number,
  playerIndex: number,
  mapName: string,
  frameSeconds: number,
): { group: string; region: TacticalRegion | null; resolvedTick: number } | null {
  const firstSample = frames[startIndex]?.players.find((row) => row.playerIndex === playerIndex);
  if (!firstSample) return null;
  const first = groupAndRegion(mapName, firstSample);
  if (!first.group) return null;
  const group = first.group;
  let seconds = 0;
  let resolvedTick = frames[startIndex]!.tick;
  for (let index = startIndex; index < frames.length; index += 1) {
    const sample = frames[index]!.players.find((row) => row.playerIndex === playerIndex);
    if (!sample || groupAndRegion(mapName, sample).group !== group) break;
    seconds += frameSeconds;
    resolvedTick = frames[index]!.tick;
    if (seconds >= CT_ROTATION_RESPONSE_PERSISTENCE_SECONDS) return { group, region: first.region, resolvedTick };
  }
  return null;
}

function areaCovered(
  frame: TeamSpatialFrame | undefined,
  playerIndex: number,
  mapName: string,
  initialRegion: TacticalRegion | null,
): boolean | null {
  if (!frame || !initialRegion) return null;
  const resolved = frame.players
    .filter((row) => row.playerIndex !== playerIndex)
    .map((row) => groupAndRegion(mapName, row).region)
    .filter((region): region is TacticalRegion => region != null);
  return resolved.includes(initialRegion);
}

function responseObservation(
  frames: readonly TeamSpatialFrame[],
  playerIndex: number,
  mapName: string,
  initialGroup: string,
  initialRegion: TacticalRegion | null,
  openingEndTick: number,
  deathTick: number | null,
  tickrate: number,
  tickStep: number,
): ResponseObservation | null {
  const frameSeconds = tickStep / tickrate;
  let departureTick: number | null = null;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!;
    if (frame.tick < openingEndTick) continue;
    const sample = frame.players.find((row) => row.playerIndex === playerIndex);
    if (!sample) continue;
    const location = groupAndRegion(mapName, sample);
    if (location.group === initialGroup) {
      departureTick = null;
      continue;
    }
    departureTick ??= frame.tick;
    const target = stableGroupAt(frames, index, playerIndex, mapName, frameSeconds);
    if (!target || target.group === initialGroup) continue;
    const returnStart = frames.findIndex((candidate, candidateIndex) => {
      if (candidateIndex <= index || candidate.tick <= target.resolvedTick) return false;
      const candidateSample = candidate.players.find((row) => row.playerIndex === playerIndex);
      return candidateSample != null && groupAndRegion(mapName, candidateSample).group === initialGroup;
    });
    let returned: boolean | null = null;
    if (returnStart >= 0 && stableGroupAt(frames, returnStart, playerIndex, mapName, frameSeconds)?.group === initialGroup) returned = true;
    else if (deathTick == null) returned = false;
    return {
      leftTick: departureTick,
      targetGroup: target.group,
      targetRegion: target.region,
      pathSeconds: Math.max(0, (frame.tick - departureTick) / tickrate),
      initialAreaStillCovered: areaCovered(frames.find((candidate) => candidate.tick === departureTick), playerIndex, mapName, initialRegion),
      returned,
      resolvedTick: target.resolvedTick,
    };
  }
  return null;
}

export function extractCtRotationRoundFacts(
  pkg: DemoPackage,
  matchId: string,
  context: ReplayRoundContext | null,
  round: DemoPackage["rounds"][number],
  frames: readonly TeamSpatialFrame[],
  grid: CalloutGrid | null,
  hasNav: boolean,
): CtRotationRoundFact[] {
  const tickrate = pkg.match.tickrate || 64;
  const teamKey = round.teamASide === "ct" ? "teamA" : "teamB";
  const ctPlayers = pkg.players.flatMap((player, playerIndex) => player.teamKey === teamKey ? [{ player, playerIndex }] : []);
  const deaths = new Map(pkg.kills.filter((row) => row.roundNumber === round.roundNumber).map((row) => [row.victimIndex, row.tick]));
  if (!context) {
    return ctPlayers.map(({ player, playerIndex }) => ({
      analysisVersion: MAP_INTELLIGENCE_FACT_VERSION,
      factVersion: CT_ROTATION_FACT_VERSION,
      matchId,
      mapName: pkg.match.mapName,
      roundNumber: round.roundNumber,
      teamKey,
      side: "ct",
      playerIndex,
      steamId64: player.steamId64,
      initialPositionGroupId: null,
      initialRegion: null,
      initialPositionGroupShare: null,
      initialResponsibilityResolved: false,
      initialWindowEligibleSeconds: null,
      firstOwnAreaContactTick: null,
      firstOtherAreaContactTick: null,
      firstTeamContactTick: null,
      leftInitialAreaTick: null,
      leaveDelayAfterFirstOtherAreaContactSeconds: null,
      responseTargetPositionGroupId: null,
      responseTargetRegion: null,
      crossedResponsibilityArea: null,
      returnedToInitialArea: null,
      responsePathEligibleSeconds: null,
      rotationStartOrder: null,
      firstResponder: null,
      teammatesAlreadyRotating: null,
      initialAreaStillCovered: null,
      deathTick: deaths.get(playerIndex) ?? null,
      censoredByDeath: null,
      roundEndTick: round.endTick,
      availability: availability(pkg, null, null, grid, hasNav),
    }));
  }

  const contacts = contactEvents(pkg, context, round, grid);
  const openingWindow = openingResponsibilityWindow(round, tickrate);
  const teamFrames = frames.filter((frame) => frame.teamKey === teamKey && frame.side === "ct");
  const frameSeconds = context.tickStep / tickrate;
  const rows = ctPlayers.map(({ player, playerIndex }): CtRotationRoundFact => {
    const track = context.tracks.find((row) => row.playerIndex === playerIndex) ?? null;
    const playerFrames = teamFrames.filter((frame) => frame.players.some((row) => row.playerIndex === playerIndex));
    const openingFrames = playerFrames.filter((frame) => frame.tick >= openingWindow.startTick && frame.tick < openingWindow.endTick);
    const groups = new Map<string, number>();
    const regions = new Map<TacticalRegion, number>();
    for (const frame of openingFrames) {
      const sample = frame.players.find((row) => row.playerIndex === playerIndex)!;
      const location = groupAndRegion(pkg.match.mapName, sample);
      if (location.group) groups.set(location.group, (groups.get(location.group) ?? 0) + frameSeconds);
      if (location.region) regions.set(location.region, (regions.get(location.region) ?? 0) + frameSeconds);
    }
    const initialGroup = [...groups.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
    const initialRegion = [...regions.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    const openingSeconds = track ? openingFrames.length * frameSeconds : null;
    const deathTick = deaths.get(playerIndex) ?? null;
    const response = initialGroup == null ? null : responseObservation(
      teamFrames,
      playerIndex,
      pkg.match.mapName,
      initialGroup[0],
      initialRegion,
      openingWindow.endTick,
      deathTick,
      tickrate,
      context.tickStep,
    );
    const firstTeamContact = contacts[0]?.tick ?? null;
    const firstOwnContact = initialRegion == null ? null : contacts.find((row) => row.region === initialRegion)?.tick ?? null;
    const firstOtherContact = initialRegion == null ? null : contacts.find((row) => row.region !== initialRegion)?.tick ?? null;
    const crossed = response && initialRegion && response.targetRegion
      ? response.targetRegion !== initialRegion
      : response == null && deathTick == null && initialGroup != null && initialRegion != null
        ? false
        : null;
    return {
      analysisVersion: MAP_INTELLIGENCE_FACT_VERSION,
      factVersion: CT_ROTATION_FACT_VERSION,
      matchId,
      mapName: pkg.match.mapName,
      roundNumber: round.roundNumber,
      teamKey,
      side: "ct",
      playerIndex,
      steamId64: player.steamId64,
      initialPositionGroupId: initialGroup?.[0] ?? null,
      initialRegion,
      initialPositionGroupShare: initialGroup == null || openingSeconds == null || openingSeconds === 0 ? null : rounded(initialGroup[1] / openingSeconds),
      initialResponsibilityResolved: initialGroup != null && initialRegion != null,
      initialWindowEligibleSeconds: rounded(openingSeconds),
      firstOwnAreaContactTick: firstOwnContact,
      firstOtherAreaContactTick: firstOtherContact,
      firstTeamContactTick: firstTeamContact,
      leftInitialAreaTick: response?.leftTick ?? null,
      leaveDelayAfterFirstOtherAreaContactSeconds: response && firstOtherContact != null && response.leftTick >= firstOtherContact ? rounded((response.leftTick - firstOtherContact) / tickrate) : null,
      responseTargetPositionGroupId: response?.targetGroup ?? null,
      responseTargetRegion: response?.targetRegion ?? null,
      crossedResponsibilityArea: crossed,
      returnedToInitialArea: response?.returned ?? null,
      responsePathEligibleSeconds: response == null ? null : rounded(response.pathSeconds),
      rotationStartOrder: null,
      firstResponder: null,
      teammatesAlreadyRotating: null,
      initialAreaStillCovered: response?.initialAreaStillCovered ?? null,
      deathTick,
      censoredByDeath: track == null ? null : deathTick == null ? false : response == null || deathTick <= response.resolvedTick,
      roundEndTick: round.endTick,
      availability: availability(pkg, context, track, grid, hasNav),
    };
  });

  const crossArea = rows.filter((row) => row.crossedResponsibilityArea === true && row.leftInitialAreaTick != null);
  for (const row of crossArea) {
    const earlier = crossArea.filter((candidate) => candidate.leftInitialAreaTick! < row.leftInitialAreaTick!).length;
    row.teammatesAlreadyRotating = crossArea.filter((candidate) => candidate.leftInitialAreaTick! < row.leftInitialAreaTick!
      && (candidate.deathTick == null || candidate.deathTick > row.leftInitialAreaTick!)).length;
    row.rotationStartOrder = earlier + 1;
    row.firstResponder = earlier === 0;
  }
  return rows;
}
