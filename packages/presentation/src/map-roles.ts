import {
  playerMapRoleProfileSchema,
  teamMapRoleMatrixSchema,
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

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

function status(rows: PlayerMapRoleEvidence[]): MapRoleStatus {
  if (rows.length === 0 || rows.every((row) => row.status === "unknown")) return "unknown";
  if (rows.every((row) => row.status === "insufficient" || row.status === "unknown")) return "insufficient";
  return rows.some((row) => row.status === "mixed") ? "mixed" : "ready";
}

function evidence(rows: PlayerMapRoleEvidence[]): EvidenceRef[] {
  return rows.flatMap((row) => row.representativeRounds.map((ref) => ({
    ...ref,
    reason: `${row.mapName} ${row.side.toUpperCase()} 的位置职责代表回合`,
    role: "example" as const,
  }))).slice(0, 8);
}

function duty(rows: PlayerMapRoleEvidence[]): WeaponDuty | null {
  const score: Record<WeaponDuty, number> = { primary_awper: 4, secondary_awper: 3, situational_awper: 2, rifler: 1 };
  if (rows.length === 0 || rows.every((row) => row.awp.activeSeconds == null)) return null;
  return [...rows].sort((a, b) => score[b.awp.duty] - score[a.awp.duty])[0]!.awp.duty;
}

function roleScores(rows: PlayerMapRoleEvidence[]): Record<InferredMapRole, number> {
  const usable = rows.filter((row) => row.status === "ready" || row.status === "mixed");
  const awper = usable.map((row) => ({ primary_awper: 1, secondary_awper: 0.65, situational_awper: 0.25, rifler: 0 }[row.awp.duty]));
  const anchor = usable.filter((row) => row.side === "ct").map((row) =>
    (row.spatial.dominantGroupStability ?? 0) >= 0.5 && (row.spatial.teamRelativeGroupShare ?? -1) >= 0.08 && (row.spatial.isolationShare ?? 1) <= 0.2 ? 1 : 0
  );
  const opener = usable.filter((row) => row.side === "t").map((row) =>
    (row.spatial.isolationShare ?? 1) <= 0.18 && (row.spatial.movementSync ?? -1) >= 0.1 && (row.spatial.teamRelativeGroupShare ?? -1) >= 0.05 ? 1 : 0
  );
  const closer = usable.filter((row) => row.side === "t").map((row) =>
    (row.spatial.isolationShare ?? 0) >= 0.18 && (row.spatial.rejoinCount ?? 0) >= 1 ? 1 : 0
  );
  const average = (values: number[]) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  return { awper: average(awper), anchor: average(anchor), opener: average(opener), closer: average(closer) };
}

/**
 * Presentation-only selection. IGL is deliberately absent from roleScores and can only come from declarations.
 * AWPer → Anchor → Opener/Closer is a deterministic tie-break for automatic conclusions, never for declarations.
 */
function inferred(rows: PlayerMapRoleEvidence[]): InferredMapRole | null {
  if (status(rows) === "unknown" || status(rows) === "insufficient") return null;
  const scores = roleScores(rows);
  const order: InferredMapRole[] = ["awper", "anchor", "opener", "closer"];
  const winner = order.find((role) => scores[role] >= 0.55) ?? null;
  if (!winner) return null;
  // Weapon responsibility has explicit priority over spatial labels: an AWPer may also hold a stable CT group.
  if (winner === "awper") return winner;
  const alternatives = order.filter((role) => role !== winner && scores[role] >= 0.55);
  return alternatives.length > 0 && scores[winner] - Math.max(...alternatives.map((role) => scores[role])) < 0.15 ? null : winner;
}

function declarationsFor(playerKey: string, rows: PlayerMapRoleEvidence[], declarations: RoleDeclaration[]): RoleDeclaration[] {
  const teams = new Set(rows.map((row) => row.teamKey));
  const maps = new Set(rows.map((row) => row.mapName));
  return declarations.filter((declaration) => declaration.playerKey === playerKey
    && (declaration.teamKey == null || teams.has(declaration.teamKey))
    && (declaration.mapName == null || maps.has(declaration.mapName)));
}

export function buildPlayerMapRoleProfiles(
  evidenceRows: PlayerMapRoleEvidence[],
  declarations: RoleDeclaration[] = [],
): PlayerMapRoleProfile[] {
  const byPlayer = new Map<string, PlayerMapRoleEvidence[]>();
  for (const row of evidenceRows) byPlayer.set(row.playerKey, [...(byPlayer.get(row.playerKey) ?? []), row]);
  return [...byPlayer.entries()].map(([playerKey, rows]) => {
    const declaredRoles = declarationsFor(playerKey, rows, declarations);
    const inferredPrimaryRole = inferred(rows);
    const declaredIgl = declaredRoles.some((role) => role.role === "igl");
    const headlineRole = declaredIgl ? inferredPrimaryRole === "awper" ? "IGL / AWPer" : "IGL" : inferredPrimaryRole;
    const candidateCount = Object.values(roleScores(rows)).filter((score) => score >= 0.55).length;
    const profileStatus = inferredPrimaryRole == null && candidateCount > 1 && status(rows) === "ready" ? "mixed" : status(rows);
    return playerMapRoleProfileSchema.parse({
      version: "cs2-demo-analysis-kit/player-map-role-profile-1.0",
      playerKey,
      teamKeys: [...new Set(rows.map((row) => row.teamKey))].sort(),
      declaredRoles,
      inferredPrimaryRole,
      headlineRole,
      status: profileStatus,
      confidence: round(rows.reduce((sum, row) => sum + row.confidence, 0) / Math.max(rows.length, 1)),
      weaponDuty: duty(rows),
      perMapEvidence: rows.sort((a, b) => a.teamKey.localeCompare(b.teamKey) || a.mapName.localeCompare(b.mapName) || a.side.localeCompare(b.side)),
      evidence: evidence(rows),
      basis: ["自动角色只使用 AWP、位置组、隔离、回归和移动同步的跨场相对证据。", "人工声明和自动推断始终分别保留。"],
      limitations: ["IGL 不从 demo 统计推断。", "首杀和残局未单独决定角色；T 侧结论不等同于固定槽位或战术职责真相。"],
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

/** Maps declaration-independent team evidence to a consumer-ready matrix. Profiles only contribute weapon-duty labels. */
export function buildTeamMapRoleMatrices(
  evidenceRows: TeamMapResponsibilityEvidence[],
  profiles: PlayerMapRoleProfile[],
): TeamMapRoleMatrix[] {
  const profileByKey = new Map(profiles.map((profile) => [profile.playerKey, profile]));
  return evidenceRows.map((row) => teamMapRoleMatrixSchema.parse({
    version: "cs2-demo-analysis-kit/team-map-role-matrix-1.0",
    teamKey: row.teamKey, mapName: row.mapName, side: row.side, status: row.status, confidence: row.confidence,
    players: row.players.map((player) => ({
      playerKey: player.playerKey,
      primaryPositionGroups: player.positionGroups.slice(0, 3),
      dynamicResponsibility: dynamic(player),
      sampleRounds: player.sample.eligibleRounds,
      confidence: player.confidence,
      weaponDuty: profileByKey.get(player.playerKey)?.weaponDuty ?? null,
      evidence: evidence([player]),
    })),
    positionOverlap: row.positionOverlap,
    responsibilityConflict: row.responsibilityConflict,
    unstableCoverage: row.unstableCoverage,
    representativeRounds: row.representativeRounds.map((ref) => ({ ...ref, reason: `${row.mapName} ${row.side.toUpperCase()} 队伍职责代表回合`, role: "example" as const })),
    basis: row.basis,
    limitations: row.limitations,
  })).sort((a, b) => a.teamKey.localeCompare(b.teamKey) || a.mapName.localeCompare(b.mapName) || a.side.localeCompare(b.side));
}
