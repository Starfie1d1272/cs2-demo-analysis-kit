import { z } from "zod";
import { evidenceRefSchema } from "./evidence.js";

/** Bump when aggregation or role-selection semantics change. */
export const MAP_ROLE_EVIDENCE_VERSION = 1;

/** The supported active-duty pool. Unknown maps are deliberately not generalized. */
export const supportedMapNameSchema = z.enum([
  "de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_overpass"
]);
export const mapRoleStatusSchema = z.enum(["ready", "mixed", "insufficient", "unknown"]);
export const inferredMapRoleSchema = z.enum(["awper", "anchor", "opener", "closer"]);
export const declaredRoleSchema = z.enum(["igl", "awper", "anchor", "opener", "closer"]);
export const weaponDutySchema = z.enum(["primary_awper", "secondary_awper", "situational_awper", "rifler"]);

/** Product-neutral input. Storage ids, namespaces and timestamps intentionally do not belong here. */
export const roleDeclarationSchema = z.object({
  playerKey: z.string().min(1),
  role: declaredRoleSchema,
  source: z.enum(["user", "trusted_metadata"]),
  mapName: supportedMapNameSchema.optional(),
  teamKey: z.string().min(1).optional(),
  provenance: z.string().min(1),
});

export const roleEvidenceLocatorSchema = z.object({
  matchId: z.string().min(1),
  roundNumber: z.number().int().positive(),
  positionGroupId: z.string().min(1).optional(),
});

export const mapPositionGroupEvidenceSchema = z.object({
  positionGroupId: z.string().min(1),
  seconds: z.number().nonnegative(),
  share: z.number().min(0).max(1),
  roundCount: z.number().int().nonnegative(),
});

export const awpResponsibilityEvidenceSchema = z.object({
  duty: weaponDutySchema,
  eligibleRounds: z.number().int().nonnegative(),
  freezeOwnershipRounds: z.number().int().nonnegative(),
  activeSeconds: z.number().nonnegative().nullable(),
  shots: z.number().int().nonnegative().nullable(),
  kills: z.number().int().nonnegative().nullable(),
  teamActiveShare: z.number().min(0).max(1).nullable(),
  mapStability: z.number().min(0).max(1).nullable(),
});

/** One identity × canonical team × map × side evidence cell. No role conclusion is stored here. */
export const playerMapRoleEvidenceSchema = z.object({
  version: z.literal(MAP_ROLE_EVIDENCE_VERSION),
  playerKey: z.string().min(1),
  teamKey: z.string().min(1),
  mapName: supportedMapNameSchema,
  side: z.enum(["t", "ct"]),
  status: mapRoleStatusSchema,
  confidence: z.number().min(0).max(1),
  sample: z.object({
    observedRounds: z.number().int().nonnegative(),
    eligibleRounds: z.number().int().nonnegative(),
    matchCount: z.number().int().nonnegative(),
    coverage: z.number().min(0).max(1).nullable(),
  }),
  positionGroups: z.array(mapPositionGroupEvidenceSchema),
  spatial: z.object({
    dominantGroupStability: z.number().min(0).max(1).nullable(),
    teamRelativeGroupShare: z.number().min(-1).max(1).nullable(),
    isolationSeconds: z.number().nonnegative().nullable(),
    isolationShare: z.number().min(0).max(1).nullable(),
    rejoinCount: z.number().int().nonnegative().nullable(),
    movementSync: z.number().min(-1).max(1).nullable(),
  }),
  awp: awpResponsibilityEvidenceSchema,
  representativeRounds: z.array(roleEvidenceLocatorSchema).max(5),
  basis: z.array(z.string()),
  limitations: z.array(z.string()),
});

export const teamMapResponsibilityEvidenceSchema = z.object({
  version: z.literal(MAP_ROLE_EVIDENCE_VERSION),
  teamKey: z.string().min(1),
  mapName: supportedMapNameSchema,
  side: z.enum(["t", "ct"]),
  status: mapRoleStatusSchema,
  confidence: z.number().min(0).max(1),
  players: z.array(playerMapRoleEvidenceSchema),
  positionOverlap: z.array(z.object({ positionGroupId: z.string().min(1), playerKeys: z.array(z.string().min(1)).min(2), share: z.number().min(0).max(1) })),
  responsibilityConflict: z.boolean(),
  unstableCoverage: z.boolean(),
  representativeRounds: z.array(roleEvidenceLocatorSchema).max(5),
  basis: z.array(z.string()),
  limitations: z.array(z.string()),
});

export const playerMapRoleProfileSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/player-map-role-profile-1.0"),
  playerKey: z.string().min(1),
  teamKeys: z.array(z.string().min(1)),
  declaredRoles: z.array(roleDeclarationSchema),
  inferredPrimaryRole: inferredMapRoleSchema.nullable(),
  headlineRole: z.union([inferredMapRoleSchema, z.literal("IGL"), z.literal("IGL / AWPer")]).nullable(),
  status: mapRoleStatusSchema,
  confidence: z.number().min(0).max(1),
  weaponDuty: weaponDutySchema.nullable(),
  perMapEvidence: z.array(playerMapRoleEvidenceSchema),
  evidence: z.array(evidenceRefSchema),
  basis: z.array(z.string()),
  limitations: z.array(z.string()),
});

export const teamMapRoleMatrixSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/team-map-role-matrix-1.0"),
  teamKey: z.string().min(1),
  mapName: supportedMapNameSchema,
  side: z.enum(["t", "ct"]),
  status: mapRoleStatusSchema,
  confidence: z.number().min(0).max(1),
  players: z.array(z.object({
    playerKey: z.string().min(1),
    primaryPositionGroups: z.array(mapPositionGroupEvidenceSchema),
    dynamicResponsibility: z.enum(["stable", "isolated", "rotating", "mixed", "unknown"]),
    sampleRounds: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    weaponDuty: weaponDutySchema.nullable(),
    evidence: z.array(evidenceRefSchema),
  })),
  positionOverlap: teamMapResponsibilityEvidenceSchema.shape.positionOverlap,
  responsibilityConflict: z.boolean(),
  unstableCoverage: z.boolean(),
  representativeRounds: z.array(evidenceRefSchema),
  basis: z.array(z.string()),
  limitations: z.array(z.string()),
});

export type SupportedMapName = z.infer<typeof supportedMapNameSchema>;
export type MapRoleStatus = z.infer<typeof mapRoleStatusSchema>;
export type InferredMapRole = z.infer<typeof inferredMapRoleSchema>;
export type DeclaredRole = z.infer<typeof declaredRoleSchema>;
export type WeaponDuty = z.infer<typeof weaponDutySchema>;
export type RoleDeclaration = z.infer<typeof roleDeclarationSchema>;
export type RoleEvidenceLocator = z.infer<typeof roleEvidenceLocatorSchema>;
export type PlayerMapRoleEvidence = z.infer<typeof playerMapRoleEvidenceSchema>;
export type TeamMapResponsibilityEvidence = z.infer<typeof teamMapResponsibilityEvidenceSchema>;
export type PlayerMapRoleProfile = z.infer<typeof playerMapRoleProfileSchema>;
export type TeamMapRoleMatrix = z.infer<typeof teamMapRoleMatrixSchema>;
