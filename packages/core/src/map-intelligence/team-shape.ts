import { MAP_INTELLIGENCE_FACT_VERSION, type MapIntelligenceAvailability, type TeamShapeRoundFact } from "@cs2dak/contract";
import type { CalloutGrid } from "@cs2dak/maps";
import type { ReplayRoundContext } from "../tactics/replay-round-context.js";
import { rounded, type TeamSpatialFrame } from "./spatial.js";

function availability(context: ReplayRoundContext | null, grid: CalloutGrid | null, hasNav: boolean, hasShots: boolean): MapIntelligenceAvailability {
  return { replay: context ? "available" : "missing", nav: hasNav ? "available" : "missing", callouts: context && (context.placeDict.length > 0 || grid) ? "available" : context ? "degraded" : "missing", shots: hasShots ? "available" : "missing" };
}

function signature(frame: TeamSpatialFrame): string {
  return frame.components.map((component) => component.join(",")).join("|");
}

/** Debounce one-frame component flicker while retaining exact component membership in persisted windows. */
function smoothed(frames: readonly TeamSpatialFrame[]): TeamSpatialFrame[] {
  return frames.map((frame, index) => {
    const previous = frames[index - 1];
    const next = frames[index + 1];
    return previous && next && signature(previous) === signature(next) ? { ...frame, components: previous.components } : frame;
  });
}

export function extractTeamShapeRoundFacts(
  pkg: { match: { mapName: string; tickrate: number }; shots?: unknown },
  matchId: string,
  context: ReplayRoundContext | null,
  round: { roundNumber: number; teamASide: "t" | "ct"; teamBSide: "t" | "ct" },
  frames: readonly TeamSpatialFrame[],
  grid: CalloutGrid | null,
  hasNav: boolean,
): TeamShapeRoundFact[] {
  const frameSeconds = context ? context.tickStep / (pkg.match.tickrate || 64) : 0;
  return (["teamA", "teamB"] as const).map((teamKey) => {
    const teamFrames = smoothed(frames.filter((frame) => frame.teamKey === teamKey));
    const windows: TeamShapeRoundFact["windows"] = [];
    for (let start = 0; start < teamFrames.length;) {
      const first = teamFrames[start]!;
      const key = signature(first);
      let end = start + 1;
      while (end < teamFrames.length && signature(teamFrames[end]!) === key) end += 1;
      const last = teamFrames[end - 1]!;
      const componentPlayerIndices = first.components.map((component) => [...component]);
      const componentSizes = componentPlayerIndices.map((component) => component.length).sort((a, b) => b - a);
      windows.push({ startTick: first.tick, endTick: last.tick + context!.tickStep, coverageSeconds: rounded((last.tick + context!.tickStep - first.tick) / (pkg.match.tickrate || 64))!, componentSizes, partition: componentSizes.join("+"), componentPlayerIndices });
      start = end;
    }
    const side = teamKey === "teamA" ? round.teamASide : round.teamBSide;
    return { analysisVersion: MAP_INTELLIGENCE_FACT_VERSION, matchId, mapName: pkg.match.mapName, roundNumber: round.roundNumber, teamKey, side, coverageSeconds: teamFrames.length ? rounded(teamFrames.length * frameSeconds) : null, windows, availability: availability(context, grid, hasNav, Boolean(pkg.shots)) } satisfies TeamShapeRoundFact;
  });
}
