import { positionGroupDisplay } from "./default-positions.js";

export const MAP_POSITION_CANDIDATE_VERSION = 3;
export type PositionCandidateType = "stable_spatial_position" | "responsibility_group" | "opening_action" | "transit" | "unresolved" | "unclassifiable";
export type PositionCandidateReviewAction = "keep" | "rename" | "merge" | "split" | "opening_action" | "transit" | "unclassifiable" | "unresolved";

export interface OpeningPositionCandidateInput {
  matchId: string; mapName: string; roundNumber: number; teamKey: string; side: "t" | "ct"; playerIndex: number; steamId64: string;
  openingEligibleSeconds: number | null;
  openingMeanComponentSize?: number | null;
  openingIsolationSeconds?: number | null;
  openingPositionGroupDwell: Array<{ positionGroupId: string; seconds: number; share: number }>;
  openingPath: Array<{ tick: number; callout: string | null; positionGroupId: string | null; x: number; y: number; z: number }>;
}

export interface MapPositionCandidate {
  version: typeof MAP_POSITION_CANDIDATE_VERSION; id: string; parentCandidateId?: string; mapName: string; side: "t" | "ct"; type: PositionCandidateType;
  proposedId: string; proposedDisplayName: string; callouts: string[];
  trajectorySummary: { start: { x: number; y: number; z: number } | null; end: { x: number; y: number; z: number } | null; dwellSeconds: number; pathSamples: number };
  sampleCount: number; teamCount: number; playerCount: number; assignmentStability: number | null; overlap: number | null;
  teamKeys: string[];
  componentSummary: { meanOpeningComponentSize: number | null; isolatedShare: number | null };
  representativeEvidence: Array<{ matchId: string; roundNumber: number; playerIndex: number }>;
  confidence: number; limitations: string[];
}

function rounded(value: number): number { return Number(value.toFixed(3)); }

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

function evidenceKey(value: { matchId: string; roundNumber: number; playerIndex: number }): string {
  return `${value.matchId}:${value.roundNumber}:${value.playerIndex}`;
}

function distance(first: { x: number; y: number; z: number }, second: { x: number; y: number; z: number }): number {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

function pathClass(row: OpeningPositionCandidateInput): "stationary" | "opening_action" | "transit" | "no_path" {
  const start = row.openingPath[0];
  const end = row.openingPath.at(-1);
  if (!start || !end) return "no_path";
  const displacement = distance(start, end);
  if (displacement >= 900) return "transit";
  if (displacement >= 400 && new Set(row.openingPath.map((point) => point.callout).filter(Boolean)).size >= 2) return "opening_action";
  return "stationary";
}

function unresolvedSpatialKey(row: OpeningPositionCandidateInput): string {
  const point = row.openingPath.at(-1) ?? row.openingPath[0];
  if (!point) return "no_path";
  return [pathClass(row), Math.round(point.x / 384), Math.round(point.y / 384), Math.round(point.z / 192)].join(":");
}

function meanPoint(points: Array<{ x: number; y: number; z: number }>): { x: number; y: number; z: number } | null {
  if (points.length === 0) return null;
  return {
    x: rounded(points.reduce((sum, point) => sum + point.x, 0) / points.length),
    y: rounded(points.reduce((sum, point) => sum + point.y, 0) / points.length),
    z: rounded(points.reduce((sum, point) => sum + point.z, 0) / points.length),
  };
}

export function generateMapPositionCandidates(rows: OpeningPositionCandidateInput[]): MapPositionCandidate[] {
  const groups = new Map<string, Array<{ row: OpeningPositionCandidateInput; dwell: OpeningPositionCandidateInput["openingPositionGroupDwell"][number] | null }>>();
  for (const row of rows) {
    const dwell = row.openingPositionGroupDwell.length ? [...row.openingPositionGroupDwell].sort((a, b) => b.seconds - a.seconds || a.positionGroupId.localeCompare(b.positionGroupId))[0]! : null;
    const groupId = dwell?.positionGroupId ?? `unresolved:${unresolvedSpatialKey(row)}`;
    const key = `${row.mapName}\t${row.side}\t${groupId}`;
    groups.set(key, [...(groups.get(key) ?? []), { row, dwell }]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => {
    items.sort((a, b) => a.row.matchId.localeCompare(b.row.matchId) || a.row.roundNumber - b.row.roundNumber || a.row.playerIndex - b.row.playerIndex);
    const [mapName, side, groupId] = key.split("\t") as [string, "t" | "ct", string];
    const unresolved = groupId.startsWith("unresolved:");
    const display = unresolved ? { resolved: false, displayName: "未命名候选", officialName: null } : positionGroupDisplay(mapName, side, groupId);
    const paths = items.flatMap((item) => item.row.openingPath);
    const shares = items.map((item) => item.dwell?.share ?? 0);
    const endPoints = items.map((item) => item.row.openingPath.at(-1)).filter((point): point is NonNullable<typeof point> => point != null);
    const center = meanPoint(endPoints);
    const spatialStability = center && endPoints.length ? rounded(Math.max(0, 1 - endPoints.reduce((sum, point) => sum + distance(point, center), 0) / endPoints.length / 600)) : null;
    const assignmentStability = unresolved ? spatialStability : shares.length ? rounded(shares.reduce((sum, value) => sum + value, 0) / shares.length) : null;
    const roundAssignments = new Map<string, number>();
    for (const item of items) {
      const roundKey = `${item.row.matchId}:${item.row.roundNumber}:${item.row.teamKey}`;
      roundAssignments.set(roundKey, (roundAssignments.get(roundKey) ?? 0) + 1);
    }
    const overlap = roundAssignments.size ? rounded([...roundAssignments.values()].filter((count) => count > 1).length / roundAssignments.size) : null;
    const motion = pathClass(items[0]!.row);
    const type: PositionCandidateType = unresolved
      ? motion === "transit" ? "transit" : motion === "opening_action" ? "opening_action" : (assignmentStability ?? 0) >= 0.55 && items.length >= 2 ? "stable_spatial_position" : "unresolved"
      : (assignmentStability ?? 0) >= 0.55 ? "stable_spatial_position" : "responsibility_group";
    const starts = items.map((item) => item.row.openingPath[0]).filter((point): point is NonNullable<typeof point> => point != null);
    const openingSeconds = items.reduce((sum, item) => sum + (item.row.openingEligibleSeconds ?? 0), 0);
    const isolatedSeconds = items.reduce((sum, item) => sum + (item.row.openingIsolationSeconds ?? 0), 0);
    const componentValues = items.map((item) => item.row.openingMeanComponentSize).filter((value): value is number => value != null);
    const semanticKey = [MAP_POSITION_CANDIDATE_VERSION, mapName, side, type, groupId, motion, ...items.map((item) => `${evidenceKey(item.row)}:${Math.round((item.row.openingPath.at(-1)?.x ?? 0) / 64)}:${Math.round((item.row.openingPath.at(-1)?.y ?? 0) / 64)}:${Math.round((item.row.openingPath.at(-1)?.z ?? 0) / 32)}`)].join("|");
    const stableId = `${mapName}:${side}:${type}:${stableHash(semanticKey)}`;
    return {
      version: MAP_POSITION_CANDIDATE_VERSION, id: stableId, mapName, side, type,
      proposedId: unresolved ? `${side}_candidate_${stableHash(semanticKey)}` : groupId,
      proposedDisplayName: display.resolved ? display.displayName : "未命名候选",
      callouts: [...new Set(paths.map((point) => point.callout).filter((value): value is string => value != null))].sort(),
      trajectorySummary: { start: meanPoint(starts), end: meanPoint(endPoints), dwellSeconds: rounded(items.reduce((sum, item) => sum + (item.dwell?.seconds ?? (motion === "stationary" ? item.row.openingEligibleSeconds ?? 0 : 0)), 0)), pathSamples: paths.length },
      sampleCount: new Set(items.map((item) => `${item.row.matchId}:${item.row.roundNumber}`)).size,
      teamCount: new Set(items.map((item) => `${item.row.matchId}:${item.row.teamKey}`)).size,
      playerCount: new Set(items.map((item) => item.row.steamId64)).size,
      teamKeys: [...new Set(items.map((item) => item.row.teamKey))].sort(),
      componentSummary: { meanOpeningComponentSize: componentValues.length ? rounded(componentValues.reduce((sum, value) => sum + value, 0) / componentValues.length) : null, isolatedShare: openingSeconds > 0 ? rounded(isolatedSeconds / openingSeconds) : null },
      assignmentStability, overlap,
      representativeEvidence: items.slice(0, 5).map((item) => ({ matchId: item.row.matchId, roundNumber: item.row.roundNumber, playerIndex: item.row.playerIndex })),
      confidence: rounded(Math.min(1, items.length / 20) * (assignmentStability ?? 0.25) * (1 - (overlap ?? 0))),
      limitations: [...(paths.length === 0 ? ["缺少 opening path/coordinates。"] : []), ...(unresolved ? ["无法从当前地图资产解析 position group；候选名称保持未命名，需审阅后才能写入资产。"] : [])],
    };
  });
}

export interface PositionCandidateSplitGroup { id: string; evidence: Array<{ matchId: string; roundNumber: number; playerIndex: number }>; displayName?: string }
export interface PositionCandidateReview { candidateId: string; action: PositionCandidateReviewAction; displayName?: string; targetId?: string; note?: string; splitGroups?: PositionCandidateSplitGroup[] }
export interface ReviewedPositionAsset { version: 3; mapName: string; side: "t" | "ct"; groups: Array<{ id: string; name: string; callouts: string[] }>; unresolvedCandidateIds: string[]; splitCandidates: MapPositionCandidate[]; unmatchedDecisionIds: string[]; provenance: { candidateVersion: number; reviewedAt: string; reviewer: string; decisions: PositionCandidateReview[] } }

function splitChildren(candidate: MapPositionCandidate, decision: PositionCandidateReview): MapPositionCandidate[] {
  const groups = decision.splitGroups;
  if (!groups || groups.length < 2) throw new Error(`候选 ${candidate.id} 的 split 至少需要两个具名 evidence 分组。`);
  const parentEvidence = new Set(candidate.representativeEvidence.map(evidenceKey));
  const seen = new Set<string>();
  for (const group of groups) {
    if (!group.id.trim() || group.evidence.length === 0) throw new Error(`候选 ${candidate.id} 的 split 分组必须提供名称和 evidence。`);
    for (const evidence of group.evidence) {
      const key = evidenceKey(evidence);
      if (!parentEvidence.has(key) || seen.has(key)) throw new Error(`候选 ${candidate.id} 的 split evidence 必须来自父候选且不可重复。`);
      seen.add(key);
    }
  }
  if (seen.size !== parentEvidence.size) throw new Error(`候选 ${candidate.id} 的 split 必须明确分配全部代表 evidence。`);
  return groups.map((group) => {
    const members = [...group.evidence].sort((a, b) => evidenceKey(a).localeCompare(evidenceKey(b)));
    const childId = `${candidate.id}:split:${stableHash([candidate.id, group.id, ...members.map(evidenceKey)].join("|"))}`;
    return {
      ...candidate,
      id: childId,
      parentCandidateId: candidate.id,
      proposedId: `${candidate.proposedId}_${group.id}`,
      proposedDisplayName: group.displayName?.trim() || "未命名候选",
      representativeEvidence: members,
      sampleCount: new Set(members.map((item) => `${item.matchId}:${item.roundNumber}`)).size,
      playerCount: new Set(members.map((item) => item.playerIndex)).size,
      confidence: rounded(Math.min(candidate.confidence, members.length / Math.max(candidate.representativeEvidence.length, 1))),
      limitations: [...candidate.limitations, "由人工 split 审阅产生；名称和归类仍需独立确认。"],
    };
  });
}

export function materializeReviewedPositionAsset(candidates: MapPositionCandidate[], decisions: PositionCandidateReview[], input: { mapName: string; side: "t" | "ct"; reviewedAt: string; reviewer: string }): ReviewedPositionAsset {
  const decisionById = new Map(decisions.map((decision) => [decision.candidateId, decision]));
  const groups = new Map<string, { id: string; name: string; callouts: Set<string> }>();
  const unresolvedCandidateIds: string[] = [];
  const splitCandidates: MapPositionCandidate[] = [];
  const matchedDecisionIds = new Set<string>();
  for (const candidate of candidates.filter((row) => row.mapName === input.mapName && row.side === input.side)) {
    const decision = decisionById.get(candidate.id) ?? { candidateId: candidate.id, action: "unresolved" as const };
    if (decisionById.has(candidate.id)) matchedDecisionIds.add(candidate.id);
    if (decision.action === "split") {
      const children = splitChildren(candidate, decision);
      splitCandidates.push(...children);
      unresolvedCandidateIds.push(...children.map((child) => child.id));
      continue;
    }
    if (["unresolved", "unclassifiable", "opening_action", "transit"].includes(decision.action)) { unresolvedCandidateIds.push(candidate.id); continue; }
    const id = decision.action === "merge" ? decision.targetId : candidate.proposedId;
    if (!id) { unresolvedCandidateIds.push(candidate.id); continue; }
    const current = groups.get(id) ?? { id, name: decision.displayName ?? candidate.proposedDisplayName, callouts: new Set<string>() };
    if (decision.action === "rename" && decision.displayName) current.name = decision.displayName;
    for (const callout of candidate.callouts) current.callouts.add(callout);
    groups.set(id, current);
  }
  const unmatchedDecisionIds = decisions.filter((decision) => !matchedDecisionIds.has(decision.candidateId)).map((decision) => decision.candidateId).sort();
  return { version: 3, mapName: input.mapName, side: input.side, groups: [...groups.values()].map((group) => ({ ...group, callouts: [...group.callouts].sort() })).sort((a, b) => a.id.localeCompare(b.id)), unresolvedCandidateIds: unresolvedCandidateIds.sort(), splitCandidates: splitCandidates.sort((a, b) => a.id.localeCompare(b.id)), unmatchedDecisionIds, provenance: { candidateVersion: MAP_POSITION_CANDIDATE_VERSION, reviewedAt: input.reviewedAt, reviewer: input.reviewer, decisions: [...decisions].sort((a, b) => a.candidateId.localeCompare(b.candidateId)) } };
}
