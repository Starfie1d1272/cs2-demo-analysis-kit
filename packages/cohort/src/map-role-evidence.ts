import {
  MAP_ROLE_EVIDENCE_VERSION,
  playerMapRoleEvidenceSchema,
  teamMapResponsibilityEvidenceSchema,
  type MatchMapIntelligenceFacts,
  type PlayerMapRoleEvidence,
  type PlayerPositionRoundFact,
  type SupportedMapName,
  type TeamMapResponsibilityEvidence,
  type TeamShapeRoundFact,
  type WeaponDuty,
} from "@cs2dak/contract";
import type { PlayerIdentityMap } from "./index.js";

const SUPPORTED_MAPS = new Set<SupportedMapName>([
  "de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_overpass"
]);
const MIN_ELIGIBLE_ROUNDS = 6;

export interface MapRoleEvidenceFacts {
  playerPositionRounds: PlayerPositionRoundFact[];
  teamShapeRounds: TeamShapeRoundFact[];
}

export interface MapRoleEvidenceOptions {
  identityMap?: PlayerIdentityMap;
  /** Canonical team identity by `${matchId}:${teamA|teamB}`. Defaults to the same stable composite key. */
  teamIdentityMap?: Record<string, string>;
}

function flatten(facts: MapRoleEvidenceFacts | MatchMapIntelligenceFacts[]): MapRoleEvidenceFacts {
  if (Array.isArray(facts)) return {
    playerPositionRounds: facts.flatMap((fact) => fact.playerPositionRounds),
    teamShapeRounds: facts.flatMap((fact) => fact.teamShapeRounds),
  };
  return facts;
}

function playerKey(steamId64: string, map: PlayerIdentityMap): string {
  const mapped = map[steamId64];
  return mapped == null ? `steam:${steamId64}` : typeof mapped === "string" ? mapped : mapped.playerKey;
}

function teamKey(row: { matchId: string; teamKey: string }, map: Record<string, string>): string {
  return map[`${row.matchId}:${row.teamKey}`] ?? `${row.matchId}:${row.teamKey}`;
}

function mean(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value != null && Number.isFinite(value));
  return usable.length === 0 ? null : usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function round(value: number | null, digits = 3): number | null {
  return value == null ? null : Number(value.toFixed(digits));
}

function status(rows: PlayerPositionRoundFact[], eligible: number): "ready" | "mixed" | "insufficient" | "unknown" {
  if (rows.length === 0 || rows.every((row) => row.availability.replay === "missing")) return "unknown";
  if (eligible < MIN_ELIGIBLE_ROUNDS) return "insufficient";
  if (rows.some((row) => row.availability.replay !== "available" || row.availability.callouts !== "available")) return "mixed";
  return "ready";
}

function duty(row: { eligible: number; active: number | null; freeze: number; share: number | null; stability: number | null }): WeaponDuty {
  if (row.active == null || row.eligible === 0) return "rifler";
  const ownership = row.freeze / row.eligible;
  const stable = row.stability ?? 0;
  const share = row.share ?? 0;
  if (ownership >= 0.45 && share >= 0.55 && stable >= 0.55) return "primary_awper";
  if (ownership >= 0.2 && share >= 0.22) return "secondary_awper";
  if (ownership > 0 || row.active > 0) return "situational_awper";
  return "rifler";
}

function locators(rows: PlayerPositionRoundFact[]): Array<{ matchId: string; roundNumber: number; positionGroupId?: string }> {
  return [...rows]
    .sort((a, b) => (b.eligibleSeconds ?? 0) - (a.eligibleSeconds ?? 0) || a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber)
    .slice(0, 5)
    .map((row) => ({ matchId: row.matchId, roundNumber: row.roundNumber, positionGroupId: row.positionGroupDwell[0]?.positionGroupId }));
}

/** Aggregates compact facts only; it intentionally contains no IGL inference or fixed five-player template. */
export function buildPlayerMapRoleEvidence(
  facts: MapRoleEvidenceFacts | MatchMapIntelligenceFacts[],
  options: MapRoleEvidenceOptions = {},
): PlayerMapRoleEvidence[] {
  const input = flatten(facts);
  const identityMap = options.identityMap ?? {};
  const teamIdentityMap = options.teamIdentityMap ?? {};
  const groups = new Map<string, PlayerPositionRoundFact[]>();
  for (const row of input.playerPositionRounds) {
    if (!SUPPORTED_MAPS.has(row.mapName as SupportedMapName)) continue;
    const key = [playerKey(row.steamId64, identityMap), teamKey(row, teamIdentityMap), row.mapName, row.side].join("\t");
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const cells = [...groups.entries()].map(([key, rows]) => {
    const [canonicalPlayerKey, canonicalTeamKey, mapName, side] = key.split("\t") as [string, string, SupportedMapName, "t" | "ct"];
    const eligibleRows = rows.filter((row) => row.eligibleSeconds != null && row.eligibleSeconds > 0);
    const eligible = eligibleRows.length;
    const totalEligibleSeconds = eligibleRows.reduce((sum, row) => sum + (row.eligibleSeconds ?? 0), 0);
    const dwell = new Map<string, { seconds: number; rounds: Set<string> }>();
    for (const row of eligibleRows) for (const item of row.positionGroupDwell) {
      const bucket = dwell.get(item.positionGroupId) ?? { seconds: 0, rounds: new Set<string>() };
      bucket.seconds += item.seconds;
      bucket.rounds.add(`${row.matchId}:${row.roundNumber}`);
      dwell.set(item.positionGroupId, bucket);
    }
    const positionGroups = [...dwell.entries()]
      .map(([positionGroupId, value]) => ({ positionGroupId, seconds: round(value.seconds, 2)!, share: totalEligibleSeconds > 0 ? round(value.seconds / totalEligibleSeconds)! : 0, roundCount: value.rounds.size }))
      .sort((a, b) => b.seconds - a.seconds || a.positionGroupId.localeCompare(b.positionGroupId));
    const dominant = positionGroups[0] ?? null;
    const dominantGroupStability = dominant == null ? null : round(dominant.roundCount / Math.max(eligible, 1));
    const isolationSeconds = eligibleRows.reduce((sum, row) => sum + row.isolationSegments.reduce((inner, segment) => inner + segment.seconds, 0), 0);
    const isolationShare = totalEligibleSeconds > 0 ? round(isolationSeconds / totalEligibleSeconds) : null;
    const active = eligibleRows.some((row) => row.activeAwpSeconds != null)
      ? eligibleRows.reduce((sum, row) => sum + (row.activeAwpSeconds ?? 0), 0)
      : null;
    const shots = eligibleRows.some((row) => row.awpShots != null)
      ? eligibleRows.reduce((sum, row) => sum + (row.awpShots ?? 0), 0)
      : null;
    const kills = eligibleRows.some((row) => row.awpKills != null)
      ? eligibleRows.reduce((sum, row) => sum + (row.awpKills ?? 0), 0)
      : null;
    const result = {
      version: MAP_ROLE_EVIDENCE_VERSION,
      playerKey: canonicalPlayerKey,
      teamKey: canonicalTeamKey,
      mapName,
      side,
      status: status(rows, eligible),
      confidence: round(Math.min(1, eligible / 12) * (rows.length === 0 ? 0 : eligibleRows.length / rows.length))!,
      sample: { observedRounds: rows.length, eligibleRounds: eligible, matchCount: new Set(rows.map((row) => row.matchId)).size, coverage: totalEligibleSeconds > 0 ? round(eligibleRows.reduce((sum, row) => sum + (row.calloutCoverage ?? 0), 0) / eligibleRows.length) : null },
      positionGroups,
      spatial: {
        dominantGroupStability,
        teamRelativeGroupShare: null as number | null,
        isolationSeconds: totalEligibleSeconds > 0 ? round(isolationSeconds, 2) : null,
        isolationShare,
        rejoinCount: totalEligibleSeconds > 0 ? eligibleRows.reduce((sum, row) => sum + row.rejoinTicks.length, 0) : null,
        movementSync: round(mean(eligibleRows.map((row) => row.movementSync))),
      },
      awp: { duty: "rifler" as WeaponDuty, eligibleRounds: eligible, freezeOwnershipRounds: eligibleRows.filter((row) => row.freezeAwpOwnership === true).length, activeSeconds: round(active, 2), shots, kills, teamActiveShare: null as number | null, mapStability: null as number | null },
      representativeRounds: locators(rows),
      basis: ["聚合逐回合 position-group、队形隔离、回归与 AWP 持有事实。"],
      limitations: ["紧凑事实不保留逐帧推进顺序；T 侧空间结论是相对位置近似，不等同于首杀或战术指挥判断。"],
    };
    return result;
  });

  // Team-relative separation and AWP shares are deliberately computed after identity aggregation.
  for (const cell of cells) {
    const peers = cells.filter((other) => other.teamKey === cell.teamKey && other.mapName === cell.mapName && other.side === cell.side);
    const group = cell.positionGroups[0]?.positionGroupId;
    if (group) {
      const own = cell.positionGroups[0]!.share;
      const peerAverage = peers.filter((peer) => peer.playerKey !== cell.playerKey)
        .map((peer) => peer.positionGroups.find((item) => item.positionGroupId === group)?.share ?? 0);
      cell.spatial.teamRelativeGroupShare = peerAverage.length ? round(own - peerAverage.reduce((sum, value) => sum + value, 0) / peerAverage.length) : null;
    }
    const activeTotal = peers.reduce((sum, peer) => sum + (peer.awp.activeSeconds ?? 0), 0);
    cell.awp.teamActiveShare = cell.awp.activeSeconds == null || activeTotal === 0 ? null : round(cell.awp.activeSeconds / activeTotal);
    const dutyPeers = peers.filter((peer) => peer.awp.activeSeconds != null && (peer.awp.activeSeconds ?? 0) > 0).length;
    cell.awp.mapStability = cell.awp.activeSeconds == null ? null : round(dutyPeers === 0 ? 0 : 1 / dutyPeers);
    cell.awp.duty = duty({ eligible: cell.sample.eligibleRounds, active: cell.awp.activeSeconds, freeze: cell.awp.freezeOwnershipRounds, share: cell.awp.teamActiveShare, stability: cell.awp.mapStability });
  }
  return cells.map((cell) => playerMapRoleEvidenceSchema.parse(cell));
}

export function buildTeamMapResponsibilityEvidence(
  facts: MapRoleEvidenceFacts | MatchMapIntelligenceFacts[],
  options: MapRoleEvidenceOptions = {},
): TeamMapResponsibilityEvidence[] {
  const players = buildPlayerMapRoleEvidence(facts, options);
  const groups = new Map<string, PlayerMapRoleEvidence[]>();
  for (const player of players) {
    const key = [player.teamKey, player.mapName, player.side].join("\t");
    const bucket = groups.get(key) ?? [];
    bucket.push(player);
    groups.set(key, bucket);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const [teamKey, mapName, side] = key.split("\t") as [string, SupportedMapName, "t" | "ct"];
    const overlap = new Map<string, string[]>();
    for (const player of rows) {
      const primary = player.positionGroups[0];
      if (primary && primary.share >= 0.35) overlap.set(primary.positionGroupId, [...(overlap.get(primary.positionGroupId) ?? []), player.playerKey]);
    }
    const positionOverlap = [...overlap.entries()]
      .filter(([, playerKeys]) => playerKeys.length >= 2)
      .map(([positionGroupId, playerKeys]) => ({ positionGroupId, playerKeys: playerKeys.sort(), share: round(playerKeys.length / Math.max(rows.length, 1))! }))
      .sort((a, b) => a.positionGroupId.localeCompare(b.positionGroupId));
    const usable = rows.filter((row) => row.status === "ready" || row.status === "mixed");
    const responsibilityConflict = positionOverlap.some((row) => row.share >= 0.6);
    const unstableCoverage = usable.length > 0 && (usable.some((row) => row.spatial.dominantGroupStability != null && row.spatial.dominantGroupStability < 0.45) || usable.filter((row) => row.status === "mixed").length / usable.length >= 0.5);
    const state = rows.some((row) => row.status === "unknown") && usable.length === 0 ? "unknown" : usable.length < 2 ? "insufficient" : responsibilityConflict || unstableCoverage ? "mixed" : "ready";
    return teamMapResponsibilityEvidenceSchema.parse({
      version: MAP_ROLE_EVIDENCE_VERSION, teamKey, mapName, side, status: state,
      confidence: round(rows.reduce((sum, row) => sum + row.confidence, 0) / Math.max(rows.length, 1))!,
      players: rows.sort((a, b) => a.playerKey.localeCompare(b.playerKey)), positionOverlap, responsibilityConflict, unstableCoverage,
      representativeRounds: rows.flatMap((row) => row.representativeRounds).slice(0, 5),
      basis: ["按队内相对 position-group、空间隔离和 AWP 使用份额汇总。"],
      limitations: ["冲突和不稳定仅描述观察到的职责重叠或换手，不套用固定五槽模板。"],
    });
  }).sort((a, b) => a.teamKey.localeCompare(b.teamKey) || a.mapName.localeCompare(b.mapName) || a.side.localeCompare(b.side));
}
