import {
  MAP_INTELLIGENCE_FACT_VERSION,
  type MapIntelligenceAvailability,
  type PlayerPositionRoundFact,
  type DemoPackage,
} from "@cs2dak/contract";
import { positionGroupOf, type CalloutGrid } from "@cs2dak/maps";
import { extractAwpRoundFacts } from "./awp.js";
import { mean, rounded, type TeamSpatialFrame } from "./spatial.js";
import type { ReplayRoundContext, ReplayRoundTrack } from "../tactics/replay-round-context.js";
import { openingResponsibilityWindow } from "./opening-window.js";

function availability(context: ReplayRoundContext | null, track: ReplayRoundTrack | null, grid: CalloutGrid | null, hasNav: boolean, hasShots: boolean): MapIntelligenceAvailability {
  return {
    replay: context && track ? "available" : context ? "degraded" : "missing",
    nav: hasNav ? "available" : "missing",
    callouts: context && (context.placeDict.length > 0 || grid) ? "available" : context ? "degraded" : "missing",
    shots: hasShots ? "available" : "missing",
  };
}

function distances(frame: TeamSpatialFrame, playerIndex: number): { nearest: number | null; centroid: number | null; componentSize: number | null } {
  const player = frame.players.find((row) => row.playerIndex === playerIndex);
  if (!player) return { nearest: null, centroid: null, componentSize: null };
  const teammates = frame.players.filter((row) => row.playerIndex !== playerIndex);
  const distance = (first: typeof player.point, second: typeof player.point) => Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
  const nearest = teammates.length ? Math.min(...teammates.map((row) => distance(player.point, row.point))) : null;
  const centroid = teammates.length
    ? { x: teammates.reduce((sum, row) => sum + row.point.x, 0) / teammates.length, y: teammates.reduce((sum, row) => sum + row.point.y, 0) / teammates.length, z: teammates.reduce((sum, row) => sum + row.point.z, 0) / teammates.length }
    : null;
  const componentSize = frame.components.find((component) => component.includes(playerIndex))?.length ?? null;
  return { nearest, centroid: centroid ? distance(player.point, centroid) : null, componentSize };
}

function movementSync(frames: readonly TeamSpatialFrame[], playerIndex: number): number | null {
  const values: number[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const before = frames[index - 1]!.players.find((row) => row.playerIndex === playerIndex);
    const after = frames[index]!.players.find((row) => row.playerIndex === playerIndex);
    if (!before || !after) continue;
    const teamBefore = frames[index - 1]!.players.filter((row) => row.playerIndex !== playerIndex);
    const teamAfter = frames[index]!.players.filter((row) => row.playerIndex !== playerIndex);
    if (teamBefore.length === 0 || teamBefore.length !== teamAfter.length) continue;
    const self = { x: after.point.x - before.point.x, y: after.point.y - before.point.y, z: after.point.z - before.point.z };
    const team = teamAfter.reduce((sum, row, teammateIndex) => ({ x: sum.x + row.point.x - teamBefore[teammateIndex]!.point.x, y: sum.y + row.point.y - teamBefore[teammateIndex]!.point.y, z: sum.z + row.point.z - teamBefore[teammateIndex]!.point.z }), { x: 0, y: 0, z: 0 });
    const selfLength = Math.hypot(self.x, self.y, self.z);
    const teamLength = Math.hypot(team.x, team.y, team.z);
    if (selfLength === 0 || teamLength === 0) continue;
    values.push((self.x * team.x + self.y * team.y + self.z * team.z) / (selfLength * teamLength));
  }
  return rounded(mean(values));
}

export function extractPlayerPositionRoundFacts(
  pkg: DemoPackage,
  matchId: string,
  context: ReplayRoundContext | null,
  round: DemoPackage["rounds"][number],
  frames: readonly TeamSpatialFrame[],
  grid: CalloutGrid | null,
  hasNav: boolean,
): PlayerPositionRoundFact[] {
  const economyType = (teamKey: "teamA" | "teamB") => teamKey === "teamA" ? round.teamAEconomy : round.teamBEconomy;
  const configuredOpeningWindow = openingResponsibilityWindow(round, pkg.match.tickrate || 64);
  const utilityCounts = (playerIndex: number) => {
    const events = pkg.grenades.filter((grenade) => grenade.roundNumber === round.roundNumber && grenade.throwerIndex === playerIndex);
    const tickOf = (grenade: (typeof events)[number]) => grenade.throwTick ?? grenade.effectTick;
    return {
      utilityUseCount: events.length,
      openingUtilityUseCount: events.filter((grenade) => {
        const tick = tickOf(grenade);
        return tick >= configuredOpeningWindow.startTick && tick < configuredOpeningWindow.endTick;
      }).length,
    };
  };
  if (!context) {
    return pkg.players.map((player, playerIndex) => ({
      analysisVersion: MAP_INTELLIGENCE_FACT_VERSION, matchId, mapName: pkg.match.mapName, roundNumber: round.roundNumber,
      teamKey: player.teamKey, side: player.teamKey === "teamA" ? round.teamASide : round.teamBSide,
      playerIndex, steamId64: player.steamId64, economyType: economyType(player.teamKey), openingWindow: null,
      openingEligibleSeconds: null, openingPositionGroupDwell: [], openingMeanComponentSize: null, openingIsolationSeconds: null,
      ...utilityCounts(playerIndex),
      openingPath: [],
      eligibleSeconds: null, positionGroupDwell: [],
      unresolvedCalloutSeconds: null, calloutCoverage: null, meanNearestTeammateDistance: null, meanTeamCentroidDistance: null,
      meanComponentSize: null, isolationSegments: [], rejoinTicks: [], movementSync: null,
      freezeAwpOwnership: null, activeAwpSeconds: null, awpShots: null, awpKills: null,
      availability: availability(null, null, grid, hasNav, Boolean(pkg.shots)),
    }));
  }
  const frameSeconds = context.tickStep / (pkg.match.tickrate || 64);
  return pkg.players.map((player, playerIndex) => {
    const track = context.tracks.find((row) => row.playerIndex === playerIndex) ?? null;
    const side = player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
    if (!track) {
      return {
        analysisVersion: MAP_INTELLIGENCE_FACT_VERSION, matchId, mapName: pkg.match.mapName, roundNumber: round.roundNumber,
        teamKey: player.teamKey, side, playerIndex, steamId64: player.steamId64, economyType: economyType(player.teamKey), openingWindow: null,
        openingEligibleSeconds: null, openingPositionGroupDwell: [], openingMeanComponentSize: null, openingIsolationSeconds: null,
        ...utilityCounts(playerIndex),
        openingPath: [],
        eligibleSeconds: null, positionGroupDwell: [],
        unresolvedCalloutSeconds: null, calloutCoverage: null, meanNearestTeammateDistance: null, meanTeamCentroidDistance: null,
        meanComponentSize: null, isolationSegments: [], rejoinTicks: [], movementSync: null,
        freezeAwpOwnership: null, activeAwpSeconds: null, awpShots: null, awpKills: null,
        availability: availability(context, null, grid, hasNav, Boolean(pkg.shots)),
      } satisfies PlayerPositionRoundFact;
    }
    const ownFrames = frames.filter((frame) => frame.teamKey === player.teamKey && frame.players.some((row) => row.playerIndex === playerIndex));
    const openingWindow = configuredOpeningWindow;
    const openingFrames = ownFrames.filter((frame) => frame.tick >= openingWindow.startTick && frame.tick < openingWindow.endTick);
    const dwell = new Map<string, number>();
    let unresolved = 0;
    const nearest: number[] = [];
    const centroid: number[] = [];
    const components: number[] = [];
    for (const frame of ownFrames) {
      const sample = frame.players.find((row) => row.playerIndex === playerIndex)!;
      const group = positionGroupOf(pkg.match.mapName, side, sample.callout ?? "");
      if (group) dwell.set(group, (dwell.get(group) ?? 0) + frameSeconds);
      if (!sample.callout) unresolved += frameSeconds;
      const values = distances(frame, playerIndex);
      if (values.nearest != null) nearest.push(values.nearest);
      if (values.centroid != null) centroid.push(values.centroid);
      if (values.componentSize != null) components.push(values.componentSize);
    }
    const isolationSegments: PlayerPositionRoundFact["isolationSegments"] = [];
    const rejoinTicks: number[] = [];
    let startTick: number | null = null;
    for (const frame of ownFrames) {
      const isolated = distances(frame, playerIndex).componentSize === 1 && frame.players.length > 1;
      if (isolated && startTick == null) startTick = frame.tick;
      if (!isolated && startTick != null) {
        const seconds = (frame.tick - startTick) / (pkg.match.tickrate || 64);
        if (seconds >= 0.5) isolationSegments.push({ startTick, endTick: frame.tick, seconds: rounded(seconds)! });
        rejoinTicks.push(frame.tick);
        startTick = null;
      }
    }
    if (startTick != null && ownFrames.length > 0) {
      const endTick = ownFrames.at(-1)!.tick + context.tickStep;
      const seconds = (endTick - startTick) / (pkg.match.tickrate || 64);
      if (seconds >= 0.5) isolationSegments.push({ startTick, endTick, seconds: rounded(seconds)! });
    }
    const eligibleSeconds = ownFrames.length * frameSeconds;
    const openingEligibleSeconds = openingFrames.length * frameSeconds;
    const openingDwell = new Map<string, number>();
    const openingComponents: number[] = [];
    let openingIsolatedFrames = 0;
    for (const frame of openingFrames) {
      const sample = frame.players.find((row) => row.playerIndex === playerIndex)!;
      const group = positionGroupOf(pkg.match.mapName, side, sample.callout ?? "");
      if (group) openingDwell.set(group, (openingDwell.get(group) ?? 0) + frameSeconds);
      const componentSize = distances(frame, playerIndex).componentSize;
      if (componentSize != null) openingComponents.push(componentSize);
      if (componentSize === 1 && frame.players.length > 1) openingIsolatedFrames += 1;
    }
    const awp = extractAwpRoundFacts(pkg, context, track);
    const pathStride = Math.max(1, Math.round(5 / frameSeconds));
    const openingPath = openingFrames.filter((frame, index) => index === 0 || index === openingFrames.length - 1 || index % pathStride === 0).slice(0, 8).map((frame) => {
      const sample = frame.players.find((row) => row.playerIndex === playerIndex)!;
      return { tick: frame.tick, callout: sample.callout, positionGroupId: positionGroupOf(pkg.match.mapName, side, sample.callout ?? ""), ...sample.point };
    });
    return {
      analysisVersion: MAP_INTELLIGENCE_FACT_VERSION, matchId, mapName: pkg.match.mapName, roundNumber: round.roundNumber,
      teamKey: player.teamKey, side, playerIndex, steamId64: player.steamId64, economyType: economyType(player.teamKey),
      openingWindow,
      openingEligibleSeconds: rounded(openingEligibleSeconds),
      openingPositionGroupDwell: [...openingDwell.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([positionGroupId, seconds]) => ({ positionGroupId, seconds: rounded(seconds)!, share: openingEligibleSeconds === 0 ? 0 : rounded(seconds / openingEligibleSeconds)! })),
      openingMeanComponentSize: rounded(mean(openingComponents)),
      openingIsolationSeconds: rounded(openingIsolatedFrames * frameSeconds),
      ...utilityCounts(playerIndex),
      openingPath,
      eligibleSeconds: rounded(eligibleSeconds),
      positionGroupDwell: [...dwell.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([positionGroupId, seconds]) => ({ positionGroupId, seconds: rounded(seconds)!, share: eligibleSeconds === 0 ? 0 : rounded(seconds / eligibleSeconds)! })),
      unresolvedCalloutSeconds: rounded(unresolved), calloutCoverage: eligibleSeconds === 0 ? null : rounded(1 - unresolved / eligibleSeconds),
      meanNearestTeammateDistance: rounded(mean(nearest)), meanTeamCentroidDistance: rounded(mean(centroid)), meanComponentSize: rounded(mean(components)),
      isolationSegments, rejoinTicks, movementSync: movementSync(ownFrames, playerIndex), ...awp,
      availability: availability(context, track, grid, hasNav, Boolean(pkg.shots)),
    } satisfies PlayerPositionRoundFact;
  });
}
