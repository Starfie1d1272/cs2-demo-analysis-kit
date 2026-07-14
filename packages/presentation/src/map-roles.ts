import {
  playerMapRoleProfileSchema,
  teamMapRoleMatrixSchema,
  type DeclaredRole,
  type EvidenceRef,
  type InferredMapRole,
  type MainRoleDeclaration,
  type MapRoleStatus,
  type PlayerMapRoleEvidence,
  type PlayerMapRoleProfile,
  type RoleDeclaration,
  type TeamMapResponsibilityEvidence,
  type TeamMapRoleMatrix,
  type WeaponDutyDeclaration,
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
  const shots = usable.some((row) => row.awp.shots != null) ? usable.reduce((sum, row) => sum + (row.awp.shots ?? 0), 0) : null;
  const kills = usable.some((row) => row.awp.kills != null) ? usable.reduce((sum, row) => sum + (row.awp.kills ?? 0), 0) : null;
  const share = weighted(usable, (row) => row.awp.teamActiveShare ?? 0);
  const consistency = weighted(usable, (row) => row.awp.matchConsistency ?? 0);
  const matches = new Set(usable.flatMap((row) => row.matchIds)).size;
  const maps = new Set(usable.filter((row) => row.awp.duty !== "rifler").map((row) => row.mapName)).size;
  const ownership = qualified > 0 ? freeze / qualified : 0;
  const primaryAction = active >= 60 || (shots ?? 0) >= 10 || (kills ?? 0) >= 4;
  const secondaryAction = active >= 20 || (shots ?? 0) >= 4 || (kills ?? 0) >= 2;
  if (qualified >= 20 && matches >= 3 && maps >= 2 && ownership >= 0.38 && share >= 0.52 && consistency >= 0.55 && primaryAction) return "primary_awper";
  if (qualified >= 10 && matches >= 2 && ownership >= 0.18 && share >= 0.2 && consistency >= 0.45 && secondaryAction) return "secondary_awper";
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

interface ScopedEvidence { rows: PlayerMapRoleEvidence[]; limitations: string[]; relevant: boolean }

function scopedEvidence(declaration: RoleDeclaration, rows: PlayerMapRoleEvidence[], matchTimes: Record<string, string | null>): ScopedEvidence {
  const base = rows.filter((row) => (declaration.teamKey == null || row.teamKey === declaration.teamKey)
    && (declaration.mapName == null || row.mapName === declaration.mapName));
  if (base.length === 0) return { rows: [], limitations: [], relevant: false };
  if (declaration.validFrom == null && declaration.validTo == null) return { rows: base, limitations: [], relevant: true };
  const inScope = (matchId: string) => {
    const time = matchTimes[matchId];
    return time != null && (declaration.validFrom == null || time >= declaration.validFrom) && (declaration.validTo == null || time <= declaration.validTo);
  };
  const unknown = base.some((row) => row.matchIds.some((matchId) => matchTimes[matchId] == null));
  // Cohort evidence is emitted per match, but retain this strict guard for old or
  // externally supplied aggregate rows: a partially overlapping row cannot be
  // attributed to a declaration's time scope without mixing out-of-scope play.
  const partial = base.some((row) => row.matchIds.some(inScope) && !row.matchIds.every(inScope));
  const inRange = base.filter((row) => row.matchIds.length > 0 && row.matchIds.every(inScope));
  return {
    rows: inRange,
    limitations: [
      ...(unknown ? ["比赛时间缺失；该声明未与时间未知的 evidence 对齐。"] : []),
      ...(partial ? ["聚合 evidence 跨越声明日期；为避免混入期外样本，未纳入该行。"] : []),
    ],
    relevant: inRange.length > 0 || unknown || partial,
  };
}

function alignment(declaration: MainRoleDeclaration, inferred: InferredMapRole | null, scores: Record<InferredMapRole, number>, rows: PlayerMapRoleEvidence[], scopeLimitations: string[]) {
  const primary = declaration.priority === "primary" ? declaration.role : null;
  const secondary = declaration.priority === "secondary" ? [declaration.role] : [];
  const comparablePrimary = primary === "igl" ? null : primary;
  const overall = primary == null || inferred == null ? "not_comparable"
    : comparablePrimary === inferred ? "aligned"
    : secondary.includes(inferred as DeclaredRole) || (comparablePrimary != null && scores[comparablePrimary] >= 0.5) ? "partially_aligned"
    : "different_observation";
  const top = (side: "t" | "ct") => rows.filter((row) => row.side === side).sort((a, b) => b.sample.eligibleSeconds - a.sample.eligibleSeconds)[0]?.responsibility ?? "unknown";
  return {
    declaration,
    declaredPrimary: primary,
    declaredSecondary: secondary,
    inferredPrimary: inferred,
    overall,
    tSide: `T 方观察职责：${top("t")}`,
    ctSide: `CT 方观察职责：${top("ct")}`,
    disagreementReasons: overall === "different_observation" ? ["声明与当前语料中的观察重点不同；这不表示声明填写错误。"] : [],
    sampleLimitations: [...new Set([...scopeLimitations, ...rows.flatMap((row) => row.limitations)])].slice(0, 4),
  } as const;
}

export interface BuildPlayerMapRoleProfilesOptions { matchTimes?: Record<string, string | null> }

function infer(rows: PlayerMapRoleEvidence[]) {
  const weaponDuty = globalWeaponDuty(rows);
  const roleSimilarities = similarities(rows, weaponDuty);
  // AWP resemblance remains useful evidence, but only a reliable primary AWP
  // duty is eligible to win the public main-role headline.
  const headlineSimilarities = { ...roleSimilarities, awper: weaponDuty === "primary_awper" ? roleSimilarities.awper : 0 };
  const ranked = rankScores(headlineSimilarities);
  const [winner, winnerScore] = ranked[0]!;
  const [runnerUp, runnerScore] = ranked[1]!;
  const margin = rounded(winnerScore - runnerScore);
  const baseStatus = aggregateStatus(rows);
  const sufficient = rows.some((row) => row.status === "ready" || row.status === "mixed");
  const reliableWinner = sufficient && winnerScore >= 0.55 && margin >= MAP_ROLE_THRESHOLDS.responsibilitySeparation;
  const status: MapRoleStatus = baseStatus === "unknown" || baseStatus === "insufficient" ? baseStatus : reliableWinner ? "ready" : "mixed";
  return { weaponDuty, roleSimilarities, winner, runnerUp, margin, sufficient, status, inferredPrimaryRole: status === "ready" ? winner : null };
}

export function buildPlayerMapRoleProfiles(evidenceRows: PlayerMapRoleEvidence[], declarations: RoleDeclaration[] = [], options: BuildPlayerMapRoleProfilesOptions = {}): PlayerMapRoleProfile[] {
  const byPlayerTeam = new Map<string, PlayerMapRoleEvidence[]>();
  for (const row of evidenceRows) {
    const key = `${row.playerKey}\t${row.teamKey}`;
    byPlayerTeam.set(key, [...(byPlayerTeam.get(key) ?? []), row]);
  }
  return [...byPlayerTeam.entries()].map(([key, rows]) => {
    const [playerKey, teamKey] = key.split("\t");
    const scopedDeclarations = declarations
      .filter((declaration) => declaration.playerKey === playerKey && (declaration.teamKey == null || declaration.teamKey === teamKey))
      .map((declaration) => ({ declaration, scope: scopedEvidence(declaration, rows, options.matchTimes ?? {}) }))
      .filter((item) => item.scope.relevant);
    const declaredRoles = scopedDeclarations.filter((item): item is { declaration: MainRoleDeclaration; scope: ScopedEvidence } => item.declaration.kind === "main_role").map((item) => item.declaration);
    const declaredWeaponDuties = scopedDeclarations.filter((item): item is { declaration: WeaponDutyDeclaration; scope: ScopedEvidence } => item.declaration.kind === "weapon_duty").map((item) => item.declaration);
    const automatic = infer(rows);
    const { weaponDuty, roleSimilarities, winner, runnerUp, margin, sufficient, status, inferredPrimaryRole } = automatic;
    const declaredIgl = scopedDeclarations.some((item) => item.declaration.kind === "main_role" && item.declaration.priority === "primary" && item.declaration.role === "igl" && item.declaration.mapName == null && item.declaration.validFrom == null && item.declaration.validTo == null);
    const headlineRole = declaredIgl ? inferredPrimaryRole === "awper" ? "IGL / AWPer" : "IGL" : inferredPrimaryRole;
    const volume = clamp(rows.reduce((sum, row) => sum + row.sample.eligibleRounds, 0) / 40);
    const quality = weighted(rows, (row) => row.sample.dataQuality);
    const stability = weighted(rows, (row) => row.awp.matchConsistency ?? row.spatial.dominantGroupStability ?? 0.5);
    const confidence = status === "unknown" ? 0 : rounded(clamp(volume * 0.3 + quality * 0.3 + margin * 0.25 + stability * 0.15));
    const roleAlignments = scopedDeclarations
      .filter((item): item is { declaration: MainRoleDeclaration; scope: ScopedEvidence } => item.declaration.kind === "main_role")
      .map(({ declaration, scope }) => {
        const observed = scope.rows.length ? infer(scope.rows) : null;
        return alignment(declaration, observed?.inferredPrimaryRole ?? null, observed?.roleSimilarities ?? roleSimilarities, scope.rows, scope.limitations);
      });
    const weaponDutyAlignments = scopedDeclarations
      .filter((item): item is { declaration: WeaponDutyDeclaration; scope: ScopedEvidence } => item.declaration.kind === "weapon_duty")
      .map(({ declaration, scope }) => {
        const observed = scope.rows.length ? infer(scope.rows).weaponDuty : null;
        return { declaration, observedWeaponDuty: observed, overall: observed == null ? "not_comparable" : observed === declaration.weaponDuty ? "aligned" : "different_observation", sampleLimitations: scope.limitations } as const;
      });
    return playerMapRoleProfileSchema.parse({
      version: "cs2-demo-analysis-kit/player-map-role-profile-4.0", playerKey, teamKey,
      declaredRoles, declaredWeaponDuties,
      inferredPrimaryRole, runnerUpRole: sufficient ? runnerUp : null, separationMargin: sufficient ? margin : null, roleSimilarities,
      headlineRole, status, confidence, weaponDuty,
      positionGroupDisplay: rows.flatMap((row) => row.positionGroups.map((group) => ({ mapName: row.mapName, side: row.side, positionGroupId: group.positionGroupId, ...positionGroupDisplay(row.mapName, row.side, group.positionGroupId) }))),
      roleAlignments, weaponDutyAlignments,
      perMapEvidence: rows.sort((a, b) => a.teamKey.localeCompare(b.teamKey) || a.mapName.localeCompare(b.mapName) || a.side.localeCompare(b.side)),
      evidence: evidence(rows),
      basis: [`${MAP_ROLE_MODEL_VERSION}：按 eligible seconds、数据完整性、队内 separation 与跨样本一致性加权。`, "人工声明与自动观察独立保存；自动优先级为 AWPer → Anchor → Opener / Closer。"],
      limitations: ["IGL 无法由 demo 统计验证。", ...[...new Set(scopedDeclarations.flatMap((item) => item.scope.limitations))]],
    });
  }).sort((a, b) => a.playerKey.localeCompare(b.playerKey) || a.teamKey.localeCompare(b.teamKey));
}

function dynamic(row: PlayerMapRoleEvidence): "stable" | "isolated" | "rotating" | "mixed" | "unknown" {
  if (row.status === "unknown" || row.status === "insufficient") return "unknown";
  if ((row.spatial.isolationShare ?? 0) >= 0.2) return "isolated";
  if ((row.spatial.rejoinCount ?? 0) >= 2) return "rotating";
  if ((row.spatial.dominantGroupStability ?? 0) >= 0.55) return "stable";
  return "mixed";
}

export function buildTeamMapRoleMatrices(evidenceRows: TeamMapResponsibilityEvidence[], profiles: PlayerMapRoleProfile[]): TeamMapRoleMatrix[] {
  const profileByKey = new Map(profiles.map((profile) => [`${profile.playerKey}\t${profile.teamKey}`, profile]));
  return evidenceRows.map((row) => teamMapRoleMatrixSchema.parse({
    version: "cs2-demo-analysis-kit/team-map-role-matrix-3.0", teamKey: row.teamKey, mapName: row.mapName, side: row.side,
    status: row.status, confidence: row.confidence,
    players: row.players.map((player) => ({
      playerKey: player.playerKey,
      primaryPositionGroups: player.positionGroups.slice(0, 3).map((group) => ({ ...group, ...positionGroupDisplay(row.mapName, row.side, group.positionGroupId) })),
      dynamicResponsibility: dynamic(player), responsibility: player.responsibility,
      sampleRounds: player.sample.eligibleRounds, confidence: player.confidence,
      weaponDuty: profileByKey.get(`${player.playerKey}\t${row.teamKey}`)?.weaponDuty ?? null, evidence: evidence([player]),
    })),
    positionOverlap: row.positionOverlap, responsibilityConflict: row.responsibilityConflict, unstableCoverage: row.unstableCoverage,
    representativeRounds: row.representativeRounds.map((ref) => ({ ...ref, reason: `${row.mapName} ${row.side.toUpperCase()} 队伍职责代表回合`, role: "example" as const })),
    basis: row.basis, limitations: row.limitations,
  })).sort((a, b) => a.teamKey.localeCompare(b.teamKey) || a.mapName.localeCompare(b.mapName) || a.side.localeCompare(b.side));
}
