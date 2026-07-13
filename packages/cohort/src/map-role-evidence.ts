import {
  MAP_ROLE_EVIDENCE_VERSION,
  playerMapRoleEvidenceSchema,
  teamMapResponsibilityEvidenceSchema,
  type MatchMapIntelligenceFacts,
  type PlayerMapRoleEvidence,
  type PlayerPositionRoundFact,
  type SupportedMapName,
  type TeamMapResponsibilityEvidence,
  type TeamResponsibility,
  type TeamShapeRoundFact,
  type WeaponDuty,
} from "@cs2dak/contract";
import type { PlayerIdentityMap } from "./index.js";

export const MAP_ROLE_MODEL_VERSION = "cs2-demo-analysis-kit/map-role-model-2.0";
export const MAP_ROLE_THRESHOLDS = Object.freeze({
  minimumEligibleRounds: 6,
  reliableEligibleRounds: 12,
  primaryAwpMinimumQualifiedRounds: 12,
  secondaryAwpMinimumQualifiedRounds: 6,
  dominantPositionShare: 0.45,
  responsibilitySeparation: 0.12,
});

const SUPPORTED_MAPS = new Set<SupportedMapName>([
  "de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_overpass",
]);

export interface MapRoleEvidenceFacts {
  playerPositionRounds: PlayerPositionRoundFact[];
  teamShapeRounds: TeamShapeRoundFact[];
}

export interface MapRoleEvidenceOptions {
  identityMap?: PlayerIdentityMap;
  teamIdentityMap?: Record<string, string>;
}

function flatten(facts: MapRoleEvidenceFacts | MatchMapIntelligenceFacts[]): MapRoleEvidenceFacts {
  return Array.isArray(facts)
    ? { playerPositionRounds: facts.flatMap((fact) => fact.playerPositionRounds), teamShapeRounds: facts.flatMap((fact) => fact.teamShapeRounds) }
    : facts;
}

function identityKey(steamId64: string, map: PlayerIdentityMap): string {
  const mapped = map[steamId64];
  return mapped == null ? `steam:${steamId64}` : typeof mapped === "string" ? mapped : mapped.playerKey;
}

function canonicalTeam(row: { matchId: string; teamKey: string }, map: Record<string, string>): string {
  return map[`${row.matchId}:${row.teamKey}`] ?? `${row.matchId}:${row.teamKey}`;
}

function mean(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value != null && Number.isFinite(value));
  return usable.length === 0 ? null : usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function rounded(value: number | null, digits = 3): number | null {
  return value == null ? null : Number(value.toFixed(digits));
}

function dataQuality(rows: PlayerPositionRoundFact[]): number {
  if (rows.length === 0) return 0;
  const replay = rows.filter((row) => row.availability.replay === "available").length / rows.length;
  const callouts = rows.reduce((sum, row) => sum + (row.calloutCoverage ?? 0), 0) / rows.length;
  const economy = rows.filter((row) => row.economyType != null).length / rows.length;
  return rounded(replay * 0.5 + callouts * 0.35 + economy * 0.15)!;
}

function evidenceStatus(rows: PlayerPositionRoundFact[], eligible: number, quality: number): "ready" | "mixed" | "insufficient" | "unknown" {
  if (rows.length === 0 || rows.every((row) => row.availability.replay === "missing")) return "unknown";
  if (eligible < MAP_ROLE_THRESHOLDS.minimumEligibleRounds) return "insufficient";
  return quality < 0.72 ? "mixed" : "ready";
}

function localAwpDuty(input: { qualified: number; active: number | null; freeze: number; share: number | null; consistency: number | null }): WeaponDuty {
  if (input.active == null) return "rifler";
  const ownership = input.qualified > 0 ? input.freeze / input.qualified : 0;
  if (input.qualified >= MAP_ROLE_THRESHOLDS.primaryAwpMinimumQualifiedRounds && ownership >= 0.4 && (input.share ?? 0) >= 0.55 && (input.consistency ?? 0) >= 0.55) return "primary_awper";
  if (input.qualified >= MAP_ROLE_THRESHOLDS.secondaryAwpMinimumQualifiedRounds && ownership >= 0.18 && (input.share ?? 0) >= 0.2) return "secondary_awper";
  if (input.freeze > 0 || input.active > 0) return "situational_awper";
  return "rifler";
}

function locators(rows: PlayerPositionRoundFact[]): Array<{ matchId: string; roundNumber: number; positionGroupId?: string }> {
  return [...rows]
    .sort((a, b) => (b.openingEligibleSeconds ?? 0) - (a.openingEligibleSeconds ?? 0) || a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber)
    .slice(0, 5)
    .map((row) => ({ matchId: row.matchId, roundNumber: row.roundNumber, positionGroupId: row.openingPositionGroupDwell[0]?.positionGroupId }));
}

interface ShapeSummary {
  mainShare: number | null;
  isolatedShare: number | null;
  formationShares: Record<string, number>;
}

function shapeSummary(rows: PlayerPositionRoundFact[], shapeByRound: Map<string, TeamShapeRoundFact>): ShapeSummary {
  let covered = 0;
  let main = 0;
  let isolated = 0;
  const formations = new Map<string, number>();
  for (const row of rows) {
    const shape = shapeByRound.get(`${row.matchId}\t${row.roundNumber}\t${row.teamKey}`);
    if (!shape) continue;
    for (const window of shape.openingWindows) {
      const component = window.componentPlayerIndices.find((members) => members.includes(row.playerIndex));
      if (!component) continue;
      covered += window.coverageSeconds;
      const largest = Math.max(...window.componentSizes);
      if (component.length === largest && component.length > 1) main += window.coverageSeconds;
      if (component.length === 1) isolated += window.coverageSeconds;
      formations.set(window.partition, (formations.get(window.partition) ?? 0) + window.coverageSeconds);
    }
  }
  return {
    mainShare: covered > 0 ? rounded(main / covered) : null,
    isolatedShare: covered > 0 ? rounded(isolated / covered) : null,
    formationShares: Object.fromEntries([...formations.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, rounded(value / Math.max(covered, 1))!])),
  };
}

function responsibility(side: "t" | "ct", input: { stability: number | null; relative: number | null; openingMain: number | null; openingIsolated: number | null; rejoin: number | null; movementSync: number | null }): TeamResponsibility {
  const stable = input.stability ?? 0;
  const main = input.openingMain ?? 0;
  const isolated = input.openingIsolated ?? 0;
  const sync = input.movementSync ?? 0;
  const rejoin = input.rejoin ?? 0;
  if (side === "t") {
    if (isolated >= 0.28 && rejoin >= 1) return "lurk_late_join";
    if (isolated >= 0.32 && stable >= 0.45) return "extremity";
    if (main >= 0.68 && sync >= 0.08) return "core_pack";
    if (stable >= 0.45 && main >= 0.25) return "map_control";
    return "mixed";
  }
  if (stable >= 0.6 && (input.relative ?? 0) >= 0.08) return "anchor";
  if (rejoin >= 2 && stable < 0.55) return "rotator";
  if (isolated >= 0.2 && sync >= 0.05) return "active_control";
  return "mixed";
}

export function buildPlayerMapRoleEvidence(facts: MapRoleEvidenceFacts | MatchMapIntelligenceFacts[], options: MapRoleEvidenceOptions = {}): PlayerMapRoleEvidence[] {
  const input = flatten(facts);
  const identityMap = options.identityMap ?? {};
  const teamIdentityMap = options.teamIdentityMap ?? {};
  const shapeByRound = new Map(input.teamShapeRounds.map((row) => [`${row.matchId}\t${row.roundNumber}\t${row.teamKey}`, row]));
  const groups = new Map<string, PlayerPositionRoundFact[]>();
  for (const row of input.playerPositionRounds) {
    if (!SUPPORTED_MAPS.has(row.mapName as SupportedMapName)) continue;
    const key = [identityKey(row.steamId64, identityMap), canonicalTeam(row, teamIdentityMap), row.mapName, row.side].join("\t");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const cells = [...groups.entries()].map(([key, rows]) => {
    const [playerKey, teamKey, mapName, side] = key.split("\t") as [string, string, SupportedMapName, "t" | "ct"];
    const eligibleRows = rows.filter((row) => (row.openingEligibleSeconds ?? 0) > 0);
    const eligibleSeconds = eligibleRows.reduce((sum, row) => sum + (row.openingEligibleSeconds ?? 0), 0);
    const quality = dataQuality(rows);
    const dwell = new Map<string, { seconds: number; rounds: Set<string> }>();
    for (const row of eligibleRows) for (const item of row.openingPositionGroupDwell) {
      const cell = dwell.get(item.positionGroupId) ?? { seconds: 0, rounds: new Set<string>() };
      cell.seconds += item.seconds;
      cell.rounds.add(`${row.matchId}:${row.roundNumber}`);
      dwell.set(item.positionGroupId, cell);
    }
    const positionGroups = [...dwell.entries()].map(([positionGroupId, value]) => ({
      positionGroupId, seconds: rounded(value.seconds, 2)!, share: eligibleSeconds > 0 ? rounded(value.seconds / eligibleSeconds)! : 0, roundCount: value.rounds.size,
    })).sort((a, b) => b.seconds - a.seconds || a.positionGroupId.localeCompare(b.positionGroupId));
    const dominant = positionGroups[0] ?? null;
    const isolationSeconds = eligibleRows.reduce((sum, row) => sum + row.isolationSegments.reduce((inner, segment) => inner + segment.seconds, 0), 0);
    const fullSeconds = eligibleRows.reduce((sum, row) => sum + (row.eligibleSeconds ?? 0), 0);
    const shape = shapeSummary(eligibleRows, shapeByRound);
    const qualified = eligibleRows.filter((row) => row.economyType === "full");
    const active = qualified.some((row) => row.activeAwpSeconds != null) ? qualified.reduce((sum, row) => sum + (row.activeAwpSeconds ?? 0), 0) : null;
    const shots = qualified.some((row) => row.awpShots != null) ? qualified.reduce((sum, row) => sum + (row.awpShots ?? 0), 0) : null;
    const kills = qualified.some((row) => row.awpKills != null) ? qualified.reduce((sum, row) => sum + (row.awpKills ?? 0), 0) : null;
    const byMatch = new Map<string, PlayerPositionRoundFact[]>();
    for (const row of qualified) byMatch.set(row.matchId, [...(byMatch.get(row.matchId) ?? []), row]);
    const matchConsistency = byMatch.size === 0 ? null : rounded([...byMatch.values()].filter((matchRows) => matchRows.some((row) => row.freezeAwpOwnership || (row.activeAwpSeconds ?? 0) >= 3)).length / byMatch.size);
    const spatial = {
      dominantGroupStability: dominant == null ? null : rounded(dominant.roundCount / Math.max(eligibleRows.length, 1)),
      teamRelativeGroupShare: null as number | null,
      isolationSeconds: fullSeconds > 0 ? rounded(isolationSeconds, 2) : null,
      isolationShare: fullSeconds > 0 ? rounded(isolationSeconds / fullSeconds) : null,
      rejoinCount: fullSeconds > 0 ? eligibleRows.reduce((sum, row) => sum + row.rejoinTicks.length, 0) : null,
      movementSync: rounded(mean(eligibleRows.map((row) => row.movementSync))),
      openingMainComponentShare: shape.mainShare,
      openingIsolatedShare: shape.isolatedShare,
      formationShares: shape.formationShares,
    };
    return {
      version: MAP_ROLE_EVIDENCE_VERSION, playerKey, teamKey, mapName, side,
      status: evidenceStatus(rows, eligibleRows.length, quality),
      confidence: rounded(Math.min(1, eligibleRows.length / MAP_ROLE_THRESHOLDS.reliableEligibleRounds) * quality)!,
      sample: { observedRounds: rows.length, eligibleRounds: eligibleRows.length, eligibleSeconds: rounded(eligibleSeconds, 2)!, matchCount: new Set(rows.map((row) => row.matchId)).size, dataQuality: quality, coverage: rounded(mean(rows.map((row) => row.calloutCoverage))) },
      positionGroups, spatial,
      responsibility: responsibility(side, { stability: spatial.dominantGroupStability, relative: spatial.teamRelativeGroupShare, openingMain: shape.mainShare, openingIsolated: shape.isolatedShare, rejoin: spatial.rejoinCount, movementSync: spatial.movementSync }),
      awp: { duty: "rifler" as WeaponDuty, eligibleRounds: eligibleRows.length, qualifiedLongGunRounds: qualified.length, freezeOwnershipRounds: qualified.filter((row) => row.freezeAwpOwnership === true).length, activeSeconds: rounded(active, 2), shots, kills, teamActiveShare: null as number | null, usageConcentration: null as number | null, matchConsistency },
      representativeRounds: locators(rows),
      basis: [`${MAP_ROLE_MODEL_VERSION}：opening position/component 用于默认职责，full-round movement 用于轮转、分离和回归解释。`],
      limitations: ["职责是观察性描述，不是固定五槽；Support/Supportive 不会由低输出代理推断。"],
    };
  });

  for (const cell of cells) {
    const peers = cells.filter((peer) => peer.teamKey === cell.teamKey && peer.mapName === cell.mapName && peer.side === cell.side);
    const group = cell.positionGroups[0]?.positionGroupId;
    if (group) {
      const values = peers.filter((peer) => peer.playerKey !== cell.playerKey).map((peer) => peer.positionGroups.find((item) => item.positionGroupId === group)?.share ?? 0);
      cell.spatial.teamRelativeGroupShare = values.length ? rounded(cell.positionGroups[0]!.share - values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    }
    const total = peers.reduce((sum, peer) => sum + (peer.awp.activeSeconds ?? 0), 0);
    cell.awp.teamActiveShare = cell.awp.activeSeconds == null || total === 0 ? null : rounded(cell.awp.activeSeconds / total);
    cell.awp.usageConcentration = total === 0 ? null : rounded(Math.max(...peers.map((peer) => peer.awp.activeSeconds ?? 0)) / total);
    cell.awp.duty = localAwpDuty({ qualified: cell.awp.qualifiedLongGunRounds, active: cell.awp.activeSeconds, freeze: cell.awp.freezeOwnershipRounds, share: cell.awp.teamActiveShare, consistency: cell.awp.matchConsistency });
    cell.responsibility = responsibility(cell.side, { stability: cell.spatial.dominantGroupStability, relative: cell.spatial.teamRelativeGroupShare, openingMain: cell.spatial.openingMainComponentShare, openingIsolated: cell.spatial.openingIsolatedShare, rejoin: cell.spatial.rejoinCount, movementSync: cell.spatial.movementSync });
  }
  return cells.map((cell) => playerMapRoleEvidenceSchema.parse(cell));
}

export function buildTeamMapResponsibilityEvidence(facts: MapRoleEvidenceFacts | MatchMapIntelligenceFacts[], options: MapRoleEvidenceOptions = {}): TeamMapResponsibilityEvidence[] {
  const players = buildPlayerMapRoleEvidence(facts, options);
  const groups = new Map<string, PlayerMapRoleEvidence[]>();
  for (const player of players) groups.set([player.teamKey, player.mapName, player.side].join("\t"), [...(groups.get([player.teamKey, player.mapName, player.side].join("\t")) ?? []), player]);
  return [...groups.entries()].map(([key, rows]) => {
    const [teamKey, mapName, side] = key.split("\t") as [string, SupportedMapName, "t" | "ct"];
    const overlap = new Map<string, string[]>();
    for (const player of rows) {
      const primary = player.positionGroups[0];
      if (primary && primary.share >= 0.35) overlap.set(primary.positionGroupId, [...(overlap.get(primary.positionGroupId) ?? []), player.playerKey]);
    }
    const positionOverlap = [...overlap.entries()].filter(([, keys]) => keys.length >= 2).map(([positionGroupId, playerKeys]) => ({ positionGroupId, playerKeys: playerKeys.sort(), share: rounded(playerKeys.length / Math.max(rows.length, 1))! })).sort((a, b) => a.positionGroupId.localeCompare(b.positionGroupId));
    const usable = rows.filter((row) => row.status === "ready" || row.status === "mixed");
    const responsibilityConflict = positionOverlap.some((row) => row.share >= 0.6);
    const unstableCoverage = usable.length > 0 && (usable.some((row) => (row.spatial.dominantGroupStability ?? 1) < 0.45) || usable.filter((row) => row.status === "mixed").length / usable.length >= 0.5);
    const status = usable.length === 0 ? rows.some((row) => row.status === "unknown") ? "unknown" : "insufficient" : usable.length < 2 ? "insufficient" : responsibilityConflict || unstableCoverage ? "mixed" : "ready";
    return teamMapResponsibilityEvidenceSchema.parse({
      version: MAP_ROLE_EVIDENCE_VERSION, teamKey, mapName, side, status,
      confidence: rounded(rows.reduce((sum, row) => sum + row.confidence * row.sample.eligibleSeconds, 0) / Math.max(rows.reduce((sum, row) => sum + row.sample.eligibleSeconds, 0), 1))!,
      players: rows.sort((a, b) => a.playerKey.localeCompare(b.playerKey)), positionOverlap, responsibilityConflict, unstableCoverage,
      representativeRounds: rows.flatMap((row) => row.representativeRounds).slice(0, 5),
      basis: ["逐回合 opening component membership、position group 与 full-round continuity 共同形成描述性职责。"],
      limitations: ["不强制五个位置或职责覆盖；缺少 utility/trade 证据时不强推 Support/Supportive。"],
    });
  }).sort((a, b) => a.teamKey.localeCompare(b.teamKey) || a.mapName.localeCompare(b.mapName) || a.side.localeCompare(b.side));
}
