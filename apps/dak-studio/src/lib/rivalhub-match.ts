import type { DemoPackage } from "@cs2dak/contract";
import { entryDate, type StudioDemoEntry } from "./library";
import type { StudioSeriesRecord } from "./series";
import type { RivalHubRemoteMap, RivalHubRemoteTeam } from "./rivalhub-contract";
import type { RivalHubEvidenceTarget } from "./rivalhub-evidence";

export interface RivalHubMatchCandidate {
  series: Pick<StudioSeriesRecord, "id" | "stageKey" | "teamAName" | "teamBName" | "completedAt" | "status">;
  map: RivalHubRemoteMap;
  /** EventRoster membership is the stable team-identity evidence for target discovery. */
  eventTeams?: RivalHubRemoteTeam[];
}

export type RivalHubMatchResult =
  | { status: "matched"; candidate: RivalHubMatchCandidate; mode: "fixed" | "remote_demo_sha" | "event_roster" | "exact_lineup" | "review_fallback" }
  | { status: "needs_target"; candidates: RivalHubMatchCandidate[]; reason: string }
  | { status: "not_found"; reason: string };

const MAX_UNKNOWN_EVENT_ROSTER_PLAYERS = 2;
const MIN_RESOLVED_EVENT_ROSTER_PLAYERS_PER_SIDE = 3;

function normalize(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function mapNameMatches(pkg: DemoPackage, candidate: RivalHubMatchCandidate): boolean {
  return normalize(pkg.match.mapName) === normalize(candidate.map.mapName)
    && normalize(pkg.match.mapName) === normalize(candidate.map.target.expectedMapName)
    && candidate.map.target.matchMapId === candidate.map.id
    && candidate.map.target.mapOrder === candidate.map.order;
}

function scoreMatches(pkg: DemoPackage, candidate: RivalHubMatchCandidate): boolean {
  const { scoreA, scoreB } = candidate.map;
  const demoA = pkg.match.teamA.score;
  const demoB = pkg.match.teamB.score;
  if (scoreA == null || scoreB == null || demoA == null || demoB == null) return false;
  return (scoreA === demoA && scoreB === demoB) || (scoreA === demoB && scoreB === demoA);
}

function starterSteamIds(candidate: RivalHubMatchCandidate): Set<string> {
  return new Set((candidate.map.lineup ?? []).filter((player) => player.isStarter).map((player) => player.steamId64));
}

function lineupOverlap(pkg: DemoPackage, candidate: RivalHubMatchCandidate): number {
  const remote = starterSteamIds(candidate);
  return pkg.players.reduce((count, player) => count + (remote.has(player.steamId64) ? 1 : 0), 0);
}

function exactLineup(pkg: DemoPackage, candidate: RivalHubMatchCandidate): boolean {
  const starters = (candidate.map.lineup ?? []).filter((player) => player.isStarter);
  if (pkg.players.length !== 10 || starters.length !== 10 || starterSteamIds(candidate).size !== 10) return false;
  return lineupOverlap(pkg, candidate) === 10;
}

type EventRosterIdentity = { entryAId: string; entryBId: string };

/**
 * Resolve only stable team identity from EventRoster membership. `isStarter` is
 * deliberately ignored: it is a team-level roster fact, not this map's
 * MatchRoster declaration. A small unknown bound keeps partial historical
 * projections from becoming an unsafe identity guess.
 */
function eventRosterIdentity(pkg: DemoPackage, candidate: RivalHubMatchCandidate): EventRosterIdentity | null {
  const eventTeams = candidate.eventTeams ?? [];
  if (eventTeams.length === 0 || pkg.players.length !== 10 || new Set(pkg.players.map((player) => player.steamId64)).size !== 10) return null;
  const sidePlayers = {
    teamA: pkg.players.filter((player) => player.teamKey === "teamA"),
    teamB: pkg.players.filter((player) => player.teamKey === "teamB"),
  };
  if (sidePlayers.teamA.length !== 5 || sidePlayers.teamB.length !== 5) return null;

  const entriesBySteam = new Map<string, Set<string>>();
  for (const team of eventTeams) {
    for (const player of team.players) {
      const entries = entriesBySteam.get(player.steamId64) ?? new Set<string>();
      entries.add(player.entryId);
      entriesBySteam.set(player.steamId64, entries);
    }
  }

  let unknownPlayers = 0;
  const entryForSide = (players: DemoPackage["players"]): string | null => {
    const entries = new Set<string>();
    let unknownForSide = 0;
    for (const player of players) {
      const memberships = entriesBySteam.get(player.steamId64);
      if (!memberships || memberships.size === 0) {
        unknownForSide += 1;
        continue;
      }
      if (memberships.size !== 1) return null;
      entries.add([...memberships][0]!);
    }
    unknownPlayers += unknownForSide;
    if (entries.size !== 1 || players.length - unknownForSide < MIN_RESOLVED_EVENT_ROSTER_PLAYERS_PER_SIDE) return null;
    return [...entries][0]!;
  };

  const entryAId = entryForSide(sidePlayers.teamA);
  const entryBId = entryForSide(sidePlayers.teamB);
  if (!entryAId || !entryBId || entryAId === entryBId || unknownPlayers > MAX_UNKNOWN_EVENT_ROSTER_PLAYERS) return null;
  return { entryAId, entryBId };
}

function sameEntryPair(left: EventRosterIdentity, candidate: RivalHubMatchCandidate): boolean {
  return [left.entryAId, left.entryBId].sort().join(":") === [candidate.map.target.entryAId, candidate.map.target.entryBId].sort().join(":");
}

function withinOneDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const day = (value: string): number => {
    const isoDay = /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
    if (isoDay) return Date.parse(`${isoDay}T00:00:00Z`);
    const date = new Date(value);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  };
  const left = day(a);
  const right = day(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 24 * 60 * 60 * 1000;
}

export function evidenceTargetFromRemoteMap(map: RivalHubRemoteMap): RivalHubEvidenceTarget {
  const { stageRunId, ...rest } = map.target;
  return stageRunId == null ? rest : { ...rest, stageRunId };
}

/**
 * DAK-side target discovery. It only establishes which canonical MatchMap is
 * being discussed; participant resolution and evidence validity stay in the
 * producer/evidence boundary.
 */
export function matchRivalHubMap(
  pkg: DemoPackage,
  candidates: RivalHubMatchCandidate[],
  options: { fixedMatchMapId?: string; demoSha256?: string | null; demoDate?: string | null } = {},
): RivalHubMatchResult {
  if (options.fixedMatchMapId) {
    const candidate = candidates.find(({ map }) => map.id === options.fixedMatchMapId);
    return candidate
      ? { status: "matched", candidate, mode: "fixed" }
      : { status: "not_found", reason: "固定的 RivalHub Map 不在当前赛事上下文中" };
  }

  if (options.demoSha256) {
    const hashMatches = candidates.filter(({ map }) => map.demoSha256?.toLowerCase() === options.demoSha256!.toLowerCase());
    if (hashMatches.length === 1) return { status: "matched", candidate: hashMatches[0]!, mode: "remote_demo_sha" };
    if (hashMatches.length > 1) return { status: "needs_target", candidates: hashMatches, reason: "同一个 raw Demo hash 对应多个 RivalHub Map，服务端上下文不一致" };
  }

  const mapCandidates = candidates.filter((candidate) => mapNameMatches(pkg, candidate));
  if (mapCandidates.length === 0) return { status: "not_found", reason: "没有找到地图名称与 target 合同一致的 RivalHub Map" };

  const eventIdentity = mapCandidates.map((candidate) => eventRosterIdentity(pkg, candidate)).find((identity): identity is EventRosterIdentity => identity != null) ?? null;
  const eventRosterMatches = eventIdentity ? mapCandidates.filter((candidate) => sameEntryPair(eventIdentity, candidate)) : [];
  if (eventRosterMatches.length === 1) {
    return { status: "matched", candidate: eventRosterMatches[0]!, mode: "event_roster" };
  }

  // Once EventRoster has confidently resolved a pair, a candidate for another
  // canonical pair must not be rescued by display names or a coincidental score.
  if (eventIdentity && eventRosterMatches.length === 0) {
    return { status: "not_found", reason: "EventRoster canonical Entry pair 与 RivalHub Map 候选不一致" };
  }

  const narrowed = eventRosterMatches.length > 1 ? eventRosterMatches : mapCandidates;
  const exactMatches = narrowed.filter((candidate) => exactLineup(pkg, candidate));
  if (exactMatches.length === 1) return { status: "matched", candidate: exactMatches[0]!, mode: "exact_lineup" };

  let evidenceCandidates = exactMatches.length > 1 ? exactMatches : narrowed;
  const availableLineups = evidenceCandidates.filter((candidate) => (candidate.map.lineup?.length ?? 0) > 0);
  if (availableLineups.length > 0) {
    const overlaps = availableLineups.map((candidate) => ({ candidate, overlap: lineupOverlap(pkg, candidate) }));
    const max = Math.max(...overlaps.map((row) => row.overlap));
    if (max >= 5) {
      const best = overlaps.filter((row) => row.overlap === max);
      if (best.length === 1) return { status: "matched", candidate: best[0]!.candidate, mode: "review_fallback" };
      evidenceCandidates = best.map((row) => row.candidate);
    }
  }

  const scoreMatchesOnly = evidenceCandidates.filter((candidate) => scoreMatches(pkg, candidate));
  if (scoreMatchesOnly.length === 1) return { status: "matched", candidate: scoreMatchesOnly[0]!, mode: "review_fallback" };
  if (scoreMatchesOnly.length > 1) evidenceCandidates = scoreMatchesOnly;

  const dateMatches = evidenceCandidates.filter((candidate) => withinOneDay(options.demoDate ?? null, candidate.series.completedAt ?? candidate.map.completedAt));
  if (dateMatches.length === 1) return { status: "matched", candidate: dateMatches[0]!, mode: "review_fallback" };
  if (evidenceCandidates.length > 1) {
    return { status: "needs_target", candidates: evidenceCandidates, reason: "地图、Canonical Entry、MatchRoster、比分和日期仍对应多个 RivalHub Map" };
  }

  return { status: "not_found", reason: "没有找到满足地图、Canonical Entry、比分或 MatchRoster 证据的 RivalHub Map" };
}

export function candidateFromSeriesMap(series: StudioSeriesRecord, map: RivalHubRemoteMap, eventTeams: RivalHubRemoteTeam[] = []): RivalHubMatchCandidate {
  return { series, map, eventTeams };
}

export function demoDateForEntry(entry: Pick<StudioDemoEntry, "fileName" | "meta">): string | null {
  return entryDate(entry);
}
