import { positionGroupDisplay } from "./default-positions.js";

export const MAP_POSITION_CANDIDATE_VERSION = 1;
export type PositionCandidateType = "stable_spatial_position" | "responsibility_group" | "opening_action" | "transit" | "unresolved" | "unclassifiable";
export type PositionCandidateReviewAction = "keep" | "rename" | "merge" | "split" | "opening_action" | "transit" | "unclassifiable" | "unresolved";

export interface OpeningPositionCandidateInput {
  matchId: string; mapName: string; roundNumber: number; teamKey: string; side: "t" | "ct"; playerIndex: number; steamId64: string;
  openingEligibleSeconds: number | null;
  openingPositionGroupDwell: Array<{ positionGroupId: string; seconds: number; share: number }>;
  openingPath: Array<{ tick: number; callout: string | null; positionGroupId: string | null; x: number; y: number; z: number }>;
}

export interface MapPositionCandidate {
  version: typeof MAP_POSITION_CANDIDATE_VERSION; id: string; mapName: string; side: "t" | "ct"; type: PositionCandidateType;
  proposedId: string; proposedDisplayName: string; callouts: string[];
  trajectorySummary: { start: { x: number; y: number; z: number } | null; end: { x: number; y: number; z: number } | null; dwellSeconds: number; pathSamples: number };
  sampleCount: number; teamCount: number; playerCount: number; assignmentStability: number | null; overlap: number | null;
  representativeEvidence: Array<{ matchId: string; roundNumber: number; playerIndex: number }>;
  confidence: number; limitations: string[];
}

function rounded(value: number): number { return Number(value.toFixed(3)); }

export function generateMapPositionCandidates(rows: OpeningPositionCandidateInput[]): MapPositionCandidate[] {
  const groups = new Map<string, Array<{ row: OpeningPositionCandidateInput; dwell: OpeningPositionCandidateInput["openingPositionGroupDwell"][number] | null }>>();
  for (const row of rows) {
    const dwell = row.openingPositionGroupDwell.length ? [...row.openingPositionGroupDwell].sort((a, b) => b.seconds - a.seconds || a.positionGroupId.localeCompare(b.positionGroupId))[0]! : null;
    const groupId = dwell?.positionGroupId ?? "unresolved";
    const key = `${row.mapName}\t${row.side}\t${groupId}`;
    groups.set(key, [...(groups.get(key) ?? []), { row, dwell }]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, items], index) => {
    items.sort((a, b) => a.row.matchId.localeCompare(b.row.matchId) || a.row.roundNumber - b.row.roundNumber || a.row.playerIndex - b.row.playerIndex);
    const [mapName, side, groupId] = key.split("\t") as [string, "t" | "ct", string];
    const display = positionGroupDisplay(mapName, side, groupId);
    const paths = items.flatMap((item) => item.row.openingPath);
    const shares = items.map((item) => item.dwell?.share ?? 0);
    const assignmentStability = shares.length ? rounded(shares.reduce((sum, value) => sum + value, 0) / shares.length) : null;
    const roundAssignments = new Map<string, number>();
    for (const item of items) {
      const roundKey = `${item.row.matchId}:${item.row.roundNumber}:${item.row.teamKey}`;
      roundAssignments.set(roundKey, (roundAssignments.get(roundKey) ?? 0) + 1);
    }
    const overlap = roundAssignments.size ? rounded([...roundAssignments.values()].filter((count) => count > 1).length / roundAssignments.size) : null;
    const type: PositionCandidateType = groupId === "unresolved" ? "unresolved" : (assignmentStability ?? 0) >= 0.55 ? "stable_spatial_position" : "responsibility_group";
    return {
      version: MAP_POSITION_CANDIDATE_VERSION, id: `${mapName}:${side}:${String(index + 1).padStart(3, "0")}`, mapName, side, type,
      proposedId: groupId === "unresolved" ? `${side}_candidate_${String(index + 1).padStart(2, "0")}` : groupId,
      proposedDisplayName: display.resolved ? display.displayName : "未命名候选",
      callouts: [...new Set(paths.map((point) => point.callout).filter((value): value is string => value != null))].sort(),
      trajectorySummary: { start: paths[0] ? { x: paths[0].x, y: paths[0].y, z: paths[0].z } : null, end: paths.at(-1) ? { x: paths.at(-1)!.x, y: paths.at(-1)!.y, z: paths.at(-1)!.z } : null, dwellSeconds: rounded(items.reduce((sum, item) => sum + (item.dwell?.seconds ?? 0), 0)), pathSamples: paths.length },
      sampleCount: new Set(items.map((item) => `${item.row.matchId}:${item.row.roundNumber}`)).size,
      teamCount: new Set(items.map((item) => `${item.row.matchId}:${item.row.teamKey}`)).size,
      playerCount: new Set(items.map((item) => item.row.steamId64)).size,
      assignmentStability, overlap,
      representativeEvidence: items.slice(0, 5).map((item) => ({ matchId: item.row.matchId, roundNumber: item.row.roundNumber, playerIndex: item.row.playerIndex })),
      confidence: rounded(Math.min(1, items.length / 20) * (assignmentStability ?? 0.25) * (1 - (overlap ?? 0))),
      limitations: [...(paths.length === 0 ? ["缺少 opening path/coordinates。"] : []), ...(groupId === "unresolved" ? ["无法从当前地图资产解析 position group；保持 unresolved，不自动猜名。"] : [])],
    };
  });
}

export interface PositionCandidateReview { candidateId: string; action: PositionCandidateReviewAction; displayName?: string; targetId?: string; note?: string }
export interface ReviewedPositionAsset { version: 1; mapName: string; side: "t" | "ct"; groups: Array<{ id: string; name: string; callouts: string[] }>; unresolvedCandidateIds: string[]; provenance: { candidateVersion: number; reviewedAt: string; reviewer: string; decisions: PositionCandidateReview[] } }

export function materializeReviewedPositionAsset(candidates: MapPositionCandidate[], decisions: PositionCandidateReview[], input: { mapName: string; side: "t" | "ct"; reviewedAt: string; reviewer: string }): ReviewedPositionAsset {
  const decisionById = new Map(decisions.map((decision) => [decision.candidateId, decision]));
  const groups = new Map<string, { id: string; name: string; callouts: Set<string> }>();
  const unresolvedCandidateIds: string[] = [];
  for (const candidate of candidates.filter((row) => row.mapName === input.mapName && row.side === input.side)) {
    const decision = decisionById.get(candidate.id) ?? { candidateId: candidate.id, action: "unresolved" as const };
    if (["unresolved", "unclassifiable", "opening_action", "transit", "split"].includes(decision.action)) { unresolvedCandidateIds.push(candidate.id); continue; }
    const id = decision.action === "merge" ? decision.targetId : candidate.proposedId;
    if (!id) { unresolvedCandidateIds.push(candidate.id); continue; }
    const current = groups.get(id) ?? { id, name: decision.displayName ?? candidate.proposedDisplayName, callouts: new Set<string>() };
    if (decision.action === "rename" && decision.displayName) current.name = decision.displayName;
    for (const callout of candidate.callouts) current.callouts.add(callout);
    groups.set(id, current);
  }
  return { version: 1, mapName: input.mapName, side: input.side, groups: [...groups.values()].map((group) => ({ ...group, callouts: [...group.callouts].sort() })).sort((a, b) => a.id.localeCompare(b.id)), unresolvedCandidateIds: unresolvedCandidateIds.sort(), provenance: { candidateVersion: MAP_POSITION_CANDIDATE_VERSION, reviewedAt: input.reviewedAt, reviewer: input.reviewer, decisions: [...decisions].sort((a, b) => a.candidateId.localeCompare(b.candidateId)) } };
}
