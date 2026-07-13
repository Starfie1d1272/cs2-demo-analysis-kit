import { z } from "zod";
import { evidenceRefSchema } from "./evidence.js";

/** Bump when aggregation or role-selection semantics change. */
export const MAP_ROLE_EVIDENCE_VERSION = 2;

/** The supported active-duty pool. Unknown maps are deliberately not generalized. */
export const supportedMapNameSchema = z.enum([
  "de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_overpass"
]);
export const mapRoleStatusSchema = z.enum(["ready", "mixed", "insufficient", "unknown"]);
export const inferredMapRoleSchema = z.enum(["awper", "anchor", "opener", "closer"]);
export const declaredRoleSchema = z.enum(["igl", "awper", "anchor", "opener", "closer"]);
export const weaponDutySchema = z.enum(["primary_awper", "secondary_awper", "situational_awper", "rifler"]);
export const teamResponsibilitySchema = z.enum([
  "core_pack", "map_control", "extremity", "lurk_late_join", "support", "anchor", "rotator", "active_control", "supportive", "mixed", "unknown",
]);

/** Product-neutral input. Storage ids, namespaces and timestamps intentionally do not belong here. */
export const roleDeclarationSchema = z.object({
  playerKey: z.string().min(1),
  role: declaredRoleSchema,
  priority: z.enum(["primary", "secondary"]),
  source: z.enum(["user", "self_report", "organizer", "event_package", "trusted_metadata"]),
  mapName: supportedMapNameSchema.optional(),
  teamKey: z.string().min(1).optional(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  provenance: z.string().min(1),
}).refine((value) => value.validFrom == null || value.validTo == null || value.validFrom <= value.validTo, { message: "validFrom must not be after validTo" });

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
  /** Concentration/exclusivity of observed AWP active time inside this team/map/side cell. */
  usageConcentration: z.number().min(0).max(1).nullable(),
  matchConsistency: z.number().min(0).max(1).nullable(),
  qualifiedLongGunRounds: z.number().int().nonnegative(),
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
    eligibleSeconds: z.number().nonnegative(),
    matchCount: z.number().int().nonnegative(),
    dataQuality: z.number().min(0).max(1),
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
    openingMainComponentShare: z.number().min(0).max(1).nullable(),
    openingIsolatedShare: z.number().min(0).max(1).nullable(),
    formationShares: z.record(z.number().min(0).max(1)),
  }),
  responsibility: teamResponsibilitySchema,
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
  version: z.literal("cs2-demo-analysis-kit/player-map-role-profile-2.0"),
  playerKey: z.string().min(1),
  teamKeys: z.array(z.string().min(1)),
  declaredRoles: z.array(roleDeclarationSchema),
  inferredPrimaryRole: inferredMapRoleSchema.nullable(),
  runnerUpRole: inferredMapRoleSchema.nullable(),
  separationMargin: z.number().min(0).max(1).nullable(),
  roleSimilarities: z.object({ awper: z.number().min(0).max(1), anchor: z.number().min(0).max(1), opener: z.number().min(0).max(1), closer: z.number().min(0).max(1) }),
  headlineRole: z.union([inferredMapRoleSchema, z.literal("IGL"), z.literal("IGL / AWPer")]).nullable(),
  status: mapRoleStatusSchema,
  confidence: z.number().min(0).max(1),
  weaponDuty: weaponDutySchema.nullable(),
  positionGroupDisplay: z.array(z.object({
    mapName: supportedMapNameSchema,
    side: z.enum(["t", "ct"]),
    positionGroupId: z.string().min(1),
    displayName: z.string().min(1),
    officialName: z.string().nullable(),
    resolved: z.boolean(),
  })),
  alignment: z.object({
    declaredPrimary: declaredRoleSchema.nullable(),
    declaredSecondary: z.array(declaredRoleSchema),
    inferredPrimary: inferredMapRoleSchema.nullable(),
    overall: z.enum(["aligned", "partially_aligned", "different_observation", "not_comparable"]),
    tSide: z.string(),
    ctSide: z.string(),
    disagreementReasons: z.array(z.string()),
    sampleLimitations: z.array(z.string()),
  }),
  perMapEvidence: z.array(playerMapRoleEvidenceSchema),
  evidence: z.array(evidenceRefSchema),
  basis: z.array(z.string()),
  limitations: z.array(z.string()),
});

export const teamMapRoleMatrixSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/team-map-role-matrix-2.0"),
  teamKey: z.string().min(1),
  mapName: supportedMapNameSchema,
  side: z.enum(["t", "ct"]),
  status: mapRoleStatusSchema,
  confidence: z.number().min(0).max(1),
  players: z.array(z.object({
    playerKey: z.string().min(1),
    primaryPositionGroups: z.array(mapPositionGroupEvidenceSchema.extend({ displayName: z.string().min(1), officialName: z.string().nullable(), resolved: z.boolean() })),
    dynamicResponsibility: z.enum(["stable", "isolated", "rotating", "mixed", "unknown"]),
    responsibility: teamResponsibilitySchema,
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
export type TeamResponsibility = z.infer<typeof teamResponsibilitySchema>;
export type RoleDeclaration = z.infer<typeof roleDeclarationSchema>;
export type RoleEvidenceLocator = z.infer<typeof roleEvidenceLocatorSchema>;
export type PlayerMapRoleEvidence = z.infer<typeof playerMapRoleEvidenceSchema>;
export type TeamMapResponsibilityEvidence = z.infer<typeof teamMapResponsibilityEvidenceSchema>;
export type PlayerMapRoleProfile = z.infer<typeof playerMapRoleProfileSchema>;
export type TeamMapRoleMatrix = z.infer<typeof teamMapRoleMatrixSchema>;
