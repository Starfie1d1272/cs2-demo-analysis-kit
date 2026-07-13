import {
  playerMapRoleProfileSchema,
  teamMapRoleMatrixSchema,
  type DeclaredRole,
  type EvidenceRef,
  type InferredMapRole,
  type MapRoleStatus,
  type PlayerMapRoleEvidence,
  type PlayerMapRoleProfile,
  type RoleDeclaration,
  type TeamMapResponsibilityEvidence,
  type TeamMapRoleMatrix,
  type WeaponDuty,
} from "@cs2dak/contract";
import { MAP_ROLE_MODEL_VERSION, MAP_ROLE_THRESHOLDS } from "@cs2dak/cohort";
import { positionGroupDisplay } from "@cs2dak/maps";

const ROLE_ORDER: InferredMapRole[] = ["awper", "anchor", "opener", "closer"];

function rounded(value: number, digits = 3): number { return Number(value.toFixed(digits)); }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

function evidence(rows: PlayerMapRoleEvidence[]): EvidenceRef[] {
  return rows.flatMap((row) => row.representativeRounds.map((ref) => ({ ...ref, reason: `${row.mapName} ${row.side.toUpperCase()} 的位置职责代表回合`, role: "example" as const }))).slice(0, 8);
}

function aggregateStatus(rows: PlayerMapRoleEvidence[]): MapRoleStatus {
  if (rows.length === 0 || rows.every((row) => row.status === "unknown")) return "unknown";
  if (rows.every((row) => row.status === "insufficient" || row.status === "unknown")) return "insufficient";
  return "mixed";
}

function weighted(rows: PlayerMapRoleEvidence[], value: (row: PlayerMapRoleEvidence) => number): number {
  const usable = rows.filter((row) => row.status === "ready" || row.status === "mixed");
  const total = usable.reduce((sum, row) => sum + row.sample.eligibleSeconds * row.sample.dataQuality, 0);
  return total === 0 ? 0 : usable.reduce((sum, row) => sum + value(row) * row.sample.eligibleSeconds * row.sample.dataQuality, 0) / total;
}

function globalWeaponDuty(rows: PlayerMapRoleEvidence[]): WeaponDuty | null {
  const usable = rows.filter((row) => row.awp.activeSeconds != null);
  if (usable.length === 0) return null;
  const qualified = usable.reduce((sum, row) => sum + row.awp.qualifiedLongGunRounds, 0);
  const freeze = usable.reduce((sum, row) => sum + row.awp.freezeOwnershipRounds, 0);
  const active = usable.reduce((sum, row) => sum + (row.awp.activeSeconds ?? 0), 0);
  const share = weighted(usable, (row) => row.awp.teamActiveShare ?? 0);
  const consistency = weighted(usable, (row) => row.awp.matchConsistency ?? 0);
  const matches = new Set(usable.flatMap((row) => row.representativeRounds.map((ref) => ref.matchId))).size;
  const maps = new Set(usable.filter((row) => row.awp.duty !== "rifler").map((row) => row.mapName)).size;
  const ownership = qualified > 0 ? freeze / qualified : 0;
  if (qualified >= 20 && matches >= 3 && maps >= 2 && ownership >= 0.38 && share >= 0.52 && consistency >= 0.55) return "primary_awper";
  if (qualified >= 10 && matches >= 2 && ownership >= 0.18 && share >= 0.2 && consistency >= 0.45) return "secondary_awper";
  return freeze > 0 || active > 0 ? "situational_awper" : "rifler";
}

function similarities(rows: PlayerMapRoleEvidence[], weaponDuty: WeaponDuty | null): Record<InferredMapRole, number> {
  const awper = weaponDuty == null ? 0 : ({ primary_awper: 1, secondary_awper: 0.72, situational_awper: 0.3, rifler: 0 } as const)[weaponDuty];
  const anchor = weighted(rows.filter((row) => row.side === "ct"), (row) => {
    const duty = row.responsibility === "anchor" ? 1 : row.responsibility === "active_control" ? 0.35 : 0;
    return clamp(duty * 0.65 + (row.spatial.dominantGroupStability ?? 0) * 0.25 + Math.max(0, row.spatial.teamRelativeGroupShare ?? 0) * 0.1);
  });
  const opener = weighted(rows.filter((row) => row.side === "t"), (row) => {
    const responsibility = row.responsibility === "core_pack" || row.responsibility === "map_control" ? 0.65 : 0.15;
    return clamp(responsibility + Math.max(0, row.spatial.movementSync ?? 0) * 0.2 + (row.spatial.openingMainComponentShare ?? 0) * 0.15);
  });
  const closer = weighted(rows.filter((row) => row.side === "t"), (row) => {
    const responsibility = row.responsibility === "lurk_late_join" ? 0.75 : row.responsibility === "extremity" ? 0.5 : 0.1;
    return clamp(responsibility + Math.min(1, (row.spatial.rejoinCount ?? 0) / Math.max(row.sample.eligibleRounds, 1)) * 0.25);
  });
  const headlineCap = weaponDuty === "primary_awper" ? 0.75 : 1;
  return { awper: rounded(awper), anchor: rounded(anchor * headlineCap), opener: rounded(opener * headlineCap), closer: rounded(closer * headlineCap) };
}

function rankScores(scores: Record<InferredMapRole, number>): Array<[InferredMapRole, number]> {
  return ROLE_ORDER.map((role) => [role, scores[role]] as [InferredMapRole, number]).sort((a, b) => b[1] - a[1] || ROLE_ORDER.indexOf(a[0]) - ROLE_ORDER.indexOf(b[0]));
}

function declarationApplies(declaration: RoleDeclaration, rows: PlayerMapRoleEvidence[], matchTimes: Record<string, string | null>): boolean {
  const teams = new Set(rows.map((row) => row.teamKey));
  const maps = new Set(rows.map((row) => row.mapName));
  if (declaration.teamKey != null && !teams.has(declaration.teamKey)) return false;
  if (declaration.mapName != null && !maps.has(declaration.mapName)) return false;
  if (declaration.validFrom == null && declaration.validTo == null) return true;
  const ids = new Set(rows.flatMap((row) => row.representativeRounds.map((ref) => ref.matchId)));
  const times = [...ids].map((id) => matchTimes[id]).filter((time): time is string => time != null);
  if (times.length === 0) return true;
  return times.some((time) => (declaration.validFrom == null || time >= declaration.validFrom) && (declaration.validTo == null || time <= declaration.validTo));
}

function alignment(declarations: RoleDeclaration[], inferred: InferredMapRole | null, scores: Record<InferredMapRole, number>, rows: PlayerMapRoleEvidence[]) {
  const primary = declarations.find((declaration) => declaration.priority === "primary")?.role ?? null;
  const secondary = declarations.filter((declaration) => declaration.priority === "secondary").map((declaration) => declaration.role);
  const comparablePrimary = primary === "igl" ? null : primary;
  const overall = primary == null || inferred == null ? "not_comparable"
    : comparablePrimary === inferred ? "aligned"
    : secondary.includes(inferred as DeclaredRole) || (comparablePrimary != null && scores[comparablePrimary] >= 0.5) ? "partially_aligned"
    : "different_observation";
  const top = (side: "t" | "ct") => rows.filter((row) => row.side === side).sort((a, b) => b.sample.eligibleSeconds - a.sample.eligibleSeconds)[0]?.responsibility ?? "unknown";
  return {
    declaredPrimary: primary,
    declaredSecondary: secondary,
    inferredPrimary: inferred,
    overall,
    tSide: `T 方观察职责：${top("t")}`,
    ctSide: `CT 方观察职责：${top("ct")}`,
    disagreementReasons: overall === "different_observation" ? ["声明与当前语料中的观察重点不同；这不表示声明填写错误。"] : [],
    sampleLimitations: [...new Set(rows.flatMap((row) => row.limitations))].slice(0, 4),
  } as const;
}

export interface BuildPlayerMapRoleProfilesOptions { matchTimes?: Record<string, string | null> }

export function buildPlayerMapRoleProfiles(evidenceRows: PlayerMapRoleEvidence[], declarations: RoleDeclaration[] = [], options: BuildPlayerMapRoleProfilesOptions = {}): PlayerMapRoleProfile[] {
  const byPlayer = new Map<string, PlayerMapRoleEvidence[]>();
  for (const row of evidenceRows) byPlayer.set(row.playerKey, [...(byPlayer.get(row.playerKey) ?? []), row]);
  return [...byPlayer.entries()].map(([playerKey, rows]) => {
    const applicable = declarations.filter((declaration) => declaration.playerKey === playerKey && declarationApplies(declaration, rows, options.matchTimes ?? {}));
    const weaponDuty = globalWeaponDuty(rows);
    const roleSimilarities = similarities(rows, weaponDuty);
    const ranked = rankScores(roleSimilarities);
    const [winner, winnerScore] = ranked[0]!;
    const [runnerUp, runnerScore] = ranked[1]!;
    const margin = rounded(winnerScore - runnerScore);
    const baseStatus = aggregateStatus(rows);
    const sufficient = rows.some((row) => row.status === "ready" || row.status === "mixed");
    const reliableWinner = sufficient && winnerScore >= 0.55 && margin >= MAP_ROLE_THRESHOLDS.responsibilitySeparation;
    const status: MapRoleStatus = baseStatus === "unknown" || baseStatus === "insufficient" ? baseStatus : reliableWinner ? "ready" : "mixed";
    const inferredPrimaryRole = status === "ready" ? winner : null;
    const declaredIgl = applicable.some((declaration) => declaration.role === "igl");
    const headlineRole = declaredIgl ? inferredPrimaryRole === "awper" ? "IGL / AWPer" : "IGL" : inferredPrimaryRole;
    const volume = clamp(rows.reduce((sum, row) => sum + row.sample.eligibleRounds, 0) / 40);
    const quality = weighted(rows, (row) => row.sample.dataQuality);
    const stability = weighted(rows, (row) => row.awp.matchConsistency ?? row.spatial.dominantGroupStability ?? 0.5);
    const confidence = status === "unknown" ? 0 : rounded(clamp(volume * 0.3 + quality * 0.3 + margin * 0.25 + stability * 0.15));
    const hasUnverifiableTimeScope = applicable.some((declaration) => (declaration.validFrom || declaration.validTo) && rows.flatMap((row) => row.representativeRounds).every((ref) => (options.matchTimes ?? {})[ref.matchId] == null));
    return playerMapRoleProfileSchema.parse({
      version: "cs2-demo-analysis-kit/player-map-role-profile-2.0", playerKey,
      teamKeys: [...new Set(rows.map((row) => row.teamKey))].sort(), declaredRoles: applicable,
      inferredPrimaryRole, runnerUpRole: sufficient ? runnerUp : null, separationMargin: sufficient ? margin : null, roleSimilarities,
      headlineRole, status, confidence, weaponDuty,
      positionGroupDisplay: rows.flatMap((row) => row.positionGroups.map((group) => ({ mapName: row.mapName, side: row.side, positionGroupId: group.positionGroupId, ...positionGroupDisplay(row.mapName, row.side, group.positionGroupId) }))),
      alignment: alignment(applicable, inferredPrimaryRole, roleSimilarities, rows),
      perMapEvidence: rows.sort((a, b) => a.teamKey.localeCompare(b.teamKey) || a.mapName.localeCompare(b.mapName) || a.side.localeCompare(b.side)),
      evidence: evidence(rows),
      basis: [`${MAP_ROLE_MODEL_VERSION}：按 eligible seconds、数据完整性、队内 separation 与跨样本一致性加权。`, "人工声明与自动观察独立保存；自动优先级为 AWPer → Anchor → Opener / Closer。"],
      limitations: ["IGL 无法由 demo 统计验证。", ...(hasUnverifiableTimeScope ? ["比赛时间缺失，声明时间作用域无法严格验证。"] : [])],
    });
  }).sort((a, b) => a.playerKey.localeCompare(b.playerKey));
}

function dynamic(row: PlayerMapRoleEvidence): "stable" | "isolated" | "rotating" | "mixed" | "unknown" {
  if (row.status === "unknown" || row.status === "insufficient") return "unknown";
  if ((row.spatial.isolationShare ?? 0) >= 0.2) return "isolated";
  if ((row.spatial.rejoinCount ?? 0) >= 2) return "rotating";
  if ((row.spatial.dominantGroupStability ?? 0) >= 0.55) return "stable";
  return "mixed";
}

export function buildTeamMapRoleMatrices(evidenceRows: TeamMapResponsibilityEvidence[], profiles: PlayerMapRoleProfile[]): TeamMapRoleMatrix[] {
  const profileByKey = new Map(profiles.map((profile) => [profile.playerKey, profile]));
  return evidenceRows.map((row) => teamMapRoleMatrixSchema.parse({
    version: "cs2-demo-analysis-kit/team-map-role-matrix-2.0", teamKey: row.teamKey, mapName: row.mapName, side: row.side,
    status: row.status, confidence: row.confidence,
    players: row.players.map((player) => ({
      playerKey: player.playerKey,
      primaryPositionGroups: player.positionGroups.slice(0, 3).map((group) => ({ ...group, ...positionGroupDisplay(row.mapName, row.side, group.positionGroupId) })),
      dynamicResponsibility: dynamic(player), responsibility: player.responsibility,
      sampleRounds: player.sample.eligibleRounds, confidence: player.confidence,
      weaponDuty: profileByKey.get(player.playerKey)?.weaponDuty ?? null, evidence: evidence([player]),
    })),
    positionOverlap: row.positionOverlap, responsibilityConflict: row.responsibilityConflict, unstableCoverage: row.unstableCoverage,
    representativeRounds: row.representativeRounds.map((ref) => ({ ...ref, reason: `${row.mapName} ${row.side.toUpperCase()} 队伍职责代表回合`, role: "example" as const })),
    basis: row.basis, limitations: row.limitations,
  })).sort((a, b) => a.teamKey.localeCompare(b.teamKey) || a.mapName.localeCompare(b.mapName) || a.side.localeCompare(b.side));
}
