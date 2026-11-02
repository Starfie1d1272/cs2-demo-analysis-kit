import type { EvidenceRef } from "./evidence-view.js";
import type { Side } from "./primitives.js";

export type MapRoleStatusView = "ready" | "mixed" | "insufficient" | "unknown";
export type WeaponDutyView = "primary_awper" | "secondary_awper" | "situational_awper" | "rifler";
export type TeamResponsibilityView =
  | "pack" | "extremity" | "late_joining" | "stable_default"
  | "anchor_tendency" | "component_mobile" | "independent_mobile" | "stable_position"
  | "mixed" | "unknown";
export type RoleModifierView = "utility_supportive" | "positionally_stable" | "spatially_isolated" | "component_mobile";

/** Fields rendered by the profile panel, independent of the evidence calculation model. */
export interface PlayerMapRoleProfileView {
  teamKey: string;
  status: MapRoleStatusView;
  inferredPrimaryRole: string | null;
  headlineRole: string | null;
  weaponDuty: WeaponDutyView | null;
  runnerUpRole: string | null;
  separationMargin: number | null;
  roleEvidenceScores: { awper: number; anchor: number; opener: number; closer: number };
  declaredRoles: Array<{ source: string; role: string; priority: string; mapName?: string }>;
  declaredWeaponDuties: Array<{ source: string; weaponDuty: WeaponDutyView; mapName?: string }>;
  positionGroupDisplay: Array<{
    mapName: string;
    side: Side;
    positionGroupId: string;
    displayName: string;
    officialName: string | null;
  }>;
  perMapEvidence: Array<{
    teamKey: string;
    mapName: string;
    side: Side;
    sample: { eligibleRounds: number; matchCount: number };
    positionGroups: Array<{ positionGroupId: string }>;
    responsibility: TeamResponsibilityView;
    awp: { duty: WeaponDutyView };
    confidence: number;
    representativeRounds: Array<{ matchId: string; roundNumber: number }>;
  }>;
  roleAlignments: Array<{ tSide: string; ctSide: string; sampleLimitations: string[] }>;
  weaponDutyAlignments: Array<{
    declaration: { weaponDuty: WeaponDutyView };
    observedWeaponDuty: WeaponDutyView | null;
  }>;
  basis: string[];
  limitations: string[];
}

export interface TeamMapRoleMatrixView {
  mapName: string;
  side: Side;
  status: MapRoleStatusView;
  confidence: number;
  unstableCoverage: boolean;
  positionConcentration: number | null;
  positionOverlap: readonly unknown[];
  players: Array<{
    playerKey: string;
    primaryPositionGroups: Array<{ displayName: string; officialName: string | null; share: number }>;
    responsibility: TeamResponsibilityView;
    modifiers: RoleModifierView[];
    weaponDuty: WeaponDutyView | null;
    sampleRounds: number;
    evidence: EvidenceRef[];
  }>;
  representativeRounds: EvidenceRef[];
  limitations: string[];
}

export interface DoubleAwpAnalysisView {
  side: Side;
  status: MapRoleStatusView;
  doubleAwpRoundCount: number;
  qualifiedRoundCount: number;
  eligibleRoundShare: number | null;
  wins: number;
  openingKills: number;
  openingDeaths: number;
  awpKills: number | null;
  awpDamage: number | null;
  combinations: Array<{ playerKeys: string[]; rounds: number }>;
  evidence: EvidenceRef[];
  limitations: string[];
}

export interface PlayerMapPoolRowView {
  mapName: string;
  matchCount: number;
  wins: number;
  losses: number;
  roundCount: number;
  rr: number | null;
  adr: number | null;
  kast: number | null;
  openingKills: number;
  openingDeaths: number;
  mainWeapon: string | null;
  globalWeaponDuty: WeaponDutyView | null;
  tPositionGroup: string | null;
  ctPositionGroup: string | null;
  tResponsibility: TeamResponsibilityView;
  ctResponsibility: TeamResponsibilityView;
  sampleQuality: number;
  confidence: number;
  evidence: EvidenceRef[];
}
