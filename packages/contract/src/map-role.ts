import { z } from "zod";
import { evidenceRefSchema } from "./evidence.js";

/** Bump when aggregation or role-selection semantics change. */
export const MAP_ROLE_EVIDENCE_VERSION = 4;

/** The supported active-duty pool. Unknown maps are deliberately not generalized. */
export const supportedMapNameSchema = z.enum([
  "de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_overpass"
]);
export const mapRoleStatusSchema = z.enum(["ready", "mixed", "insufficient", "unknown"]);
export const inferredMapRoleSchema = z.enum(["awper", "anchor", "opener", "closer"]);
export const declaredRoleSchema = z.enum(["igl", "awper", "anchor", "opener", "closer"]);
export const weaponDutySchema = z.enum(["primary_awper", "secondary_awper", "situational_awper", "rifler"]);
export const teamResponsibilitySchema = z.enum([
  "pack", "extremity", "late_joining", "stable_default",
  "anchor_tendency", "component_mobile", "independent_mobile", "stable_position",
  "mixed", "unknown",
]);
export const roleModifierSchema = z.enum(["utility_supportive", "positionally_stable", "spatially_isolated", "component_mobile"]);

/** Product-neutral declaration scope. Storage ids, namespaces and timestamps intentionally do not belong here. */
const declarationScopeSchema = z.object({
  playerKey: z.string().min(1),
  source: z.enum(["user", "self_report", "organizer", "event_package", "trusted_metadata"]),
  mapName: supportedMapNameSchema.optional(),
  teamKey: z.string().min(1).optional(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  provenance: z.string().min(1),
}).strict();

/** A declared tactical role. priority belongs only to this kind of declaration. */
export const mainRoleDeclarationSchema = declarationScopeSchema.extend({
  kind: z.literal("main_role"),
  role: declaredRoleSchema,
  priority: z.enum(["primary", "secondary"]),
});

/** A declared weapon duty. It is deliberately independent from tactical-role priority. */
export const weaponDutyDeclarationSchema = declarationScopeSchema.extend({
  kind: z.literal("weapon_duty"),
  weaponDuty: weaponDutySchema,
});

export const roleDeclarationSchema = z.discriminatedUnion("kind", [mainRoleDeclarationSchema, weaponDutyDeclarationSchema]).superRefine((value, context) => {
  if (value.validFrom != null && value.validTo != null && value.validFrom > value.validTo) context.addIssue({ code: z.ZodIssueCode.custom, message: "validFrom must not be after validTo" });
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
  /** Complete compact match coverage for aggregation and declaration time scope; not an evidence sample. */
  matchIds: z.array(z.string().min(1)),
  positionGroups: z.array(mapPositionGroupEvidenceSchema),
  spatial: z.object({
    dominantGroupStability: z.number().min(0).max(1).nullable(),
    teamRelativeGroupShare: z.number().min(-1).max(1).nullable(),
    isolationSeconds: z.number().nonnegative().nullable(),
    isolationShare: z.number().min(0).max(1).nullable(),
    rejoinCount: z.number().int().nonnegative().nullable(),
    delayedConvergenceRoundShare: z.number().min(0).max(1).nullable(),
    movementSync: z.number().min(-1).max(1).nullable(),
    openingMainComponentShare: z.number().min(0).max(1).nullable(),
    openingNoUniqueCoreShare: z.number().min(0).max(1).nullable(),
    openingIsolatedShare: z.number().min(0).max(1).nullable(),
    formationShares: z.record(z.number().min(0).max(1)),
  }),
  support: z.object({
    utilityUses: z.number().int().nonnegative(),
    openingUtilityUses: z.number().int().nonnegative(),
    utilityUsePerRound: z.number().nonnegative(),
    openingUtilityUsePerRound: z.number().nonnegative(),
  }),
  responsibility: teamResponsibilitySchema,
  modifiers: z.array(roleModifierSchema),
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
  positionConcentration: z.number().min(0).max(1).nullable(),
  unstableCoverage: z.boolean(),
  representativeRounds: z.array(roleEvidenceLocatorSchema).max(5),
  basis: z.array(z.string()),
  limitations: z.array(z.string()),
});

export const playerMapRoleProfileSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/player-map-role-profile-5.0"),
  playerKey: z.string().min(1),
  teamKey: z.string().min(1),
  declaredRoles: z.array(mainRoleDeclarationSchema),
  declaredWeaponDuties: z.array(weaponDutyDeclarationSchema),
  inferredPrimaryRole: inferredMapRoleSchema.nullable(),
  runnerUpRole: inferredMapRoleSchema.nullable(),
  separationMargin: z.number().min(0).max(1).nullable(),
  roleEvidenceScores: z.object({ awper: z.number().min(0).max(1), anchor: z.number().min(0).max(1), opener: z.number().min(0).max(1), closer: z.number().min(0).max(1) }),
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
  roleAlignments: z.array(z.object({
    declaration: mainRoleDeclarationSchema,
    declaredPrimary: declaredRoleSchema.nullable(),
    declaredSecondary: z.array(declaredRoleSchema),
    inferredPrimary: inferredMapRoleSchema.nullable(),
    overall: z.enum(["aligned", "partially_aligned", "different_observation", "not_comparable"]),
    tSide: z.string(),
    ctSide: z.string(),
    disagreementReasons: z.array(z.string()),
    sampleLimitations: z.array(z.string()),
  })),
  weaponDutyAlignments: z.array(z.object({
    declaration: weaponDutyDeclarationSchema,
    observedWeaponDuty: weaponDutySchema.nullable(),
    overall: z.enum(["aligned", "different_observation", "not_comparable"]),
    sampleLimitations: z.array(z.string()),
  })),
  perMapEvidence: z.array(playerMapRoleEvidenceSchema),
  evidence: z.array(evidenceRefSchema),
  basis: z.array(z.string()),
  limitations: z.array(z.string()),
});

export const teamMapRoleMatrixSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/team-map-role-matrix-4.0"),
  teamKey: z.string().min(1),
  mapName: supportedMapNameSchema,
  side: z.enum(["t", "ct"]),
  status: mapRoleStatusSchema,
  confidence: z.number().min(0).max(1),
  players: z.array(z.object({
    playerKey: z.string().min(1),
    primaryPositionGroups: z.array(mapPositionGroupEvidenceSchema.extend({ displayName: z.string().min(1), officialName: z.string().nullable(), resolved: z.boolean() })),
    responsibility: teamResponsibilitySchema,
    modifiers: z.array(roleModifierSchema),
    sampleRounds: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    weaponDuty: weaponDutySchema.nullable(),
    evidence: z.array(evidenceRefSchema),
  })),
  positionOverlap: teamMapResponsibilityEvidenceSchema.shape.positionOverlap,
  positionConcentration: z.number().min(0).max(1).nullable(),
  unstableCoverage: z.boolean(),
  representativeRounds: z.array(evidenceRefSchema),
  basis: z.array(z.string()),
  limitations: z.array(z.string()),
});

const countBreakdownSchema = z.object({ key: z.string().min(1), rounds: z.number().int().nonnegative() });
export const doubleAwpAnalysisSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/double-awp-analysis-2.0"),
  teamKey: z.string().min(1),
  side: z.enum(["t", "ct"]),
  status: mapRoleStatusSchema,
  qualifiedRoundCount: z.number().int().nonnegative(),
  doubleAwpRoundCount: z.number().int().nonnegative(),
  eligibleRoundShare: z.number().min(0).max(1).nullable(),
  combinations: z.array(z.object({ playerKeys: z.array(z.string().min(1)).min(2), rounds: z.number().int().positive() })),
  mapDistribution: z.array(countBreakdownSchema),
  scorePhaseDistribution: z.array(countBreakdownSchema),
  economyDistribution: z.array(countBreakdownSchema),
  opponentEconomyDistribution: z.array(countBreakdownSchema),
  wins: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1).nullable(),
  openingKills: z.number().int().nonnegative(),
  openingDeaths: z.number().int().nonnegative(),
  roundStartAwpOwnerships: z.number().int().nonnegative(),
  activeAwpSeconds: z.number().nonnegative().nullable(),
  doubleAwpActiveSeconds: z.number().nonnegative().nullable(),
  awpKills: z.number().int().nonnegative().nullable(),
  awpDamage: z.number().nonnegative().nullable(),
  evidence: z.array(evidenceRefSchema),
  basis: z.array(z.string()),
  limitations: z.array(z.string()),
});

export const playerMapPoolRowSchema = z.object({
  mapName: supportedMapNameSchema,
  matchCount: z.number().int().nonnegative(), roundCount: z.number().int().nonnegative(), wins: z.number().int().nonnegative(), losses: z.number().int().nonnegative(), winRate: z.number().min(0).max(1).nullable(),
  rr: z.number().nonnegative().nullable(), adr: z.number().nonnegative().nullable(), kast: z.number().min(0).max(100).nullable(),
  openingKills: z.number().int().nonnegative(), openingDeaths: z.number().int().nonnegative(),
  mainWeapon: z.string().nullable(), globalWeaponDuty: weaponDutySchema.nullable(), mapSideAwpUsage: z.array(z.object({ side: z.enum(["t", "ct"]), duty: weaponDutySchema, qualifiedRounds: z.number().int().nonnegative(), activeSeconds: z.number().nonnegative().nullable() })),
  tPositionGroup: z.string().nullable(), ctPositionGroup: z.string().nullable(), tResponsibility: teamResponsibilitySchema, ctResponsibility: teamResponsibilitySchema,
  sampleQuality: z.number().min(0).max(1), confidence: z.number().min(0).max(1), evidence: z.array(evidenceRefSchema),
});

export type SupportedMapName = z.infer<typeof supportedMapNameSchema>;
export type MapRoleStatus = z.infer<typeof mapRoleStatusSchema>;
export type InferredMapRole = z.infer<typeof inferredMapRoleSchema>;
export type DeclaredRole = z.infer<typeof declaredRoleSchema>;
export type WeaponDuty = z.infer<typeof weaponDutySchema>;
export type TeamResponsibility = z.infer<typeof teamResponsibilitySchema>;
export type RoleModifier = z.infer<typeof roleModifierSchema>;
export type RoleDeclaration = z.infer<typeof roleDeclarationSchema>;
export type MainRoleDeclaration = z.infer<typeof mainRoleDeclarationSchema>;
export type WeaponDutyDeclaration = z.infer<typeof weaponDutyDeclarationSchema>;
export type RoleEvidenceLocator = z.infer<typeof roleEvidenceLocatorSchema>;
export type PlayerMapRoleEvidence = z.infer<typeof playerMapRoleEvidenceSchema>;
export type TeamMapResponsibilityEvidence = z.infer<typeof teamMapResponsibilityEvidenceSchema>;
export type PlayerMapRoleProfile = z.infer<typeof playerMapRoleProfileSchema>;
export type TeamMapRoleMatrix = z.infer<typeof teamMapRoleMatrixSchema>;
export type DoubleAwpAnalysis = z.infer<typeof doubleAwpAnalysisSchema>;
export type PlayerMapPoolRow = z.infer<typeof playerMapPoolRowSchema>;
