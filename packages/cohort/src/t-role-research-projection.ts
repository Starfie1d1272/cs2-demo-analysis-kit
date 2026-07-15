import {
  T_RESPONSIBILITY_RESEARCH_PROJECTION_VERSION,
  tResponsibilityResearchProjectionSchema,
  type MatchMapIntelligenceFacts,
  type PlayerMapRoleEvidence,
  type PlayerPositionRoundFact,
  type TResponsibilityResearchFeatures,
  type TResponsibilityResearchProjection,
  type TeamShapeRoundFact,
} from "@cs2dak/contract";
import {
  MAP_ROLE_THRESHOLDS,
  buildPlayerMapRoleEvidence,
  mapRolePlayerKey,
  mapRoleTeamKey,
  type MapRoleEvidenceFacts,
  type MapRoleEvidenceOptions,
} from "./map-role-evidence.js";

export const T_RESPONSIBILITY_RESEARCH_MODEL_ID = "cologne-major-2026/parsimonious-v1-full-fit" as const;
export const T_RESPONSIBILITY_RESEARCH_THRESHOLD = 0.6;

type FeatureKey = keyof TResponsibilityResearchFeatures;

/**
 * Full-fit parameters frozen from the 159-identity Cologne research population.
 * This same-event diagnostic is intentionally not used by the production role selector.
 */
const FROZEN_MODEL: ReadonlyArray<readonly [FeatureKey, number, number, number, number]> = [
  ["dominantGroupStability", 0.8125875, 0.8110319885369233, 0.06571674270323856, 0.3137454154793391],
  ["teamRelativeGroupShare", 0.1838809523809523, 0.1917499578233378, 0.08708704820909378, -0.8074881283271113],
  ["openingIsolatedShare", 0.3238657718120805, 0.32872615302182945, 0.07824780489800287, -0.4081235105208964],
  ["isolationShare", 0.4547809523809524, 0.46189704535089304, 0.07746145337427911, -0.20892974673701006],
  ["delayedConvergenceShare", 0.1265747126436781, 0.12579053416940641, 0.04034628766284785, 0.15699043839244245],
  ["movementSync", 0.2942472527472527, 0.2927666973414002, 0.03747820111822078, 0.08503051685027664],
  ["positionTopShare", 0.4328125, 0.43450227509018796, 0.056193812672360524, 0.006865937081921921],
  ["openingLargestShare", 0.7196198234894773, 0.7102014308840938, 0.08058945177379023, 0.3572344571519129],
  ["fullLargestShare", 0.730539172627264, 0.7202883174049193, 0.06744299727584371, 0.03235009840115323],
  ["meanTeamCentroidDistance", 793.5978242656994, 810.2038869113109, 114.10938623158178, -0.018770230983947287],
  ["openingPathDisplacement", 1926.1863987283657, 1924.3626053132587, 166.35401831829978, -0.725988428680296],
  ["openingPathTransitions", 0.5263157894736842, 0.5342869975778368, 0.14190394001266585, 0.012016769453277712],
  ["openingPositionEntropy", 0.8362989193520769, 0.8291977740731681, 0.049059785225589556, 0.3891136867077831],
  ["fullPositionEntropy", 0.8641613487733687, 0.8540405403082293, 0.05413800821242758, -0.08031875309551142],
  ["rejoinsPerMinute", 5.111140689471583, 5.155634195709956, 0.6648081842049797, 0.45060956741302444],
];
const FROZEN_INTERCEPT = -0.061863082589897124;

function rounded(value: number | null, digits = 6): number | null {
  return value == null ? null : Number(value.toFixed(digits));
}

function weighted<T>(rows: readonly T[], value: (row: T) => number | null, weight: (row: T) => number): number | null {
  const usable = rows.flatMap((row) => {
    const candidate = value(row);
    const rowWeight = weight(row);
    return candidate != null && Number.isFinite(candidate) && rowWeight > 0 ? [{ value: candidate, weight: rowWeight }] : [];
  });
  const total = usable.reduce((sum, row) => sum + row.weight, 0);
  return total === 0 ? null : usable.reduce((sum, row) => sum + row.value * row.weight, 0) / total;
}

function entropy(seconds: ReadonlyMap<string, number>): number | null {
  const values = [...seconds.values()].filter((value) => value > 0);
  if (values.length === 0) return null;
  if (values.length === 1) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return -values.reduce((sum, value) => {
    const probability = value / total;
    return sum + probability * Math.log(probability);
  }, 0) / Math.log(values.length);
}

interface ComponentTotals {
  covered: number;
  largest: number;
}

function addComponentWindows(
  target: ComponentTotals,
  windows: TeamShapeRoundFact["windows"],
  playerIndex: number,
): void {
  for (const window of windows) {
    const component = window.componentPlayerIndices.find((members) => members.includes(playerIndex));
    if (!component || window.coverageSeconds <= 0) continue;
    const largest = Math.max(...window.componentPlayerIndices.map((members) => members.length));
    target.covered += window.coverageSeconds;
    if (component.length === largest) target.largest += window.coverageSeconds;
  }
}

function pathMetrics(row: PlayerPositionRoundFact): { displacement: number | null; transitions: number | null } {
  if (row.openingPath.length < 2) return { displacement: null, transitions: null };
  const first = row.openingPath[0]!;
  const last = row.openingPath.at(-1)!;
  const groups = row.openingPath.flatMap((point) => point.positionGroupId == null ? [] : [point.positionGroupId]);
  return {
    displacement: Math.hypot(last.x - first.x, last.y - first.y, last.z - first.z),
    transitions: groups.slice(1).reduce((sum, group, index) => sum + Number(group !== groups[index]), 0),
  };
}

export function scoreFrozenTResponsibilityFeatures(features: TResponsibilityResearchFeatures): {
  packScore: number;
  lurkerScore: number;
  confidence: number;
  candidate: "pack" | "lurker" | "flexible";
} {
  let logit = FROZEN_INTERCEPT;
  for (const [key, median, mean, scale, coefficient] of FROZEN_MODEL) {
    const value = features[key] ?? median;
    logit += coefficient * ((value - mean) / scale);
  }
  const packScore = 1 / (1 + Math.exp(-logit));
  const lurkerScore = 1 - packScore;
  const confidence = Math.max(packScore, lurkerScore);
  return {
    packScore: rounded(packScore)!,
    lurkerScore: rounded(lurkerScore)!,
    confidence: rounded(confidence)!,
    candidate: confidence < T_RESPONSIBILITY_RESEARCH_THRESHOLD ? "flexible" : packScore >= lurkerScore ? "pack" : "lurker",
  };
}

function flatten(facts: MapRoleEvidenceFacts | MatchMapIntelligenceFacts[]): MapRoleEvidenceFacts {
  return Array.isArray(facts)
    ? {
        playerPositionRounds: facts.flatMap((fact) => fact.playerPositionRounds),
        teamShapeRounds: facts.flatMap((fact) => fact.teamShapeRounds),
      }
    : facts;
}

function projectionStatus(evidence: readonly PlayerMapRoleEvidence[], rounds: readonly PlayerPositionRoundFact[]): "ready" | "mixed" | "insufficient" | "unknown" {
  if (rounds.length === 0 || rounds.every((row) => row.availability.replay === "missing")) return "unknown";
  const eligible = evidence.reduce((sum, row) => sum + row.sample.eligibleRounds, 0);
  if (eligible < MAP_ROLE_THRESHOLDS.reliableEligibleRounds) return "insufficient";
  const quality = weighted(evidence, (row) => row.sample.dataQuality, (row) => row.sample.eligibleRounds);
  return (quality ?? 0) < 0.72 ? "mixed" : "ready";
}

/** Builds an event/corpus-level T projection without changing formal role evidence. */
export function buildTResponsibilityResearchProjections(
  facts: MapRoleEvidenceFacts | MatchMapIntelligenceFacts[],
  options: MapRoleEvidenceOptions = {},
): TResponsibilityResearchProjection[] {
  const input = flatten(facts);
  const identityMap = options.identityMap ?? {};
  const teamIdentityMap = options.teamIdentityMap ?? {};
  const evidence = buildPlayerMapRoleEvidence(input, options).filter((row) => row.side === "t");
  const evidenceGroups = new Map<string, PlayerMapRoleEvidence[]>();
  for (const row of evidence) {
    const key = `${row.playerKey}\t${row.teamKey}`;
    evidenceGroups.set(key, [...(evidenceGroups.get(key) ?? []), row]);
  }
  const roundGroups = new Map<string, PlayerPositionRoundFact[]>();
  for (const row of input.playerPositionRounds) {
    if (row.side !== "t") continue;
    const key = `${mapRolePlayerKey(row.steamId64, identityMap)}\t${mapRoleTeamKey(row, teamIdentityMap)}`;
    roundGroups.set(key, [...(roundGroups.get(key) ?? []), row]);
  }
  const shapeByRound = new Map(input.teamShapeRounds.map((row) => [`${row.matchId}\t${row.roundNumber}\t${row.teamKey}\t${row.side}`, row]));

  return [...evidenceGroups.entries()].map(([key, evidenceRows]) => {
    const [playerKey, teamKey] = key.split("\t") as [string, string];
    const rounds = roundGroups.get(key) ?? [];
    const openingComponents: ComponentTotals = { covered: 0, largest: 0 };
    const fullComponents: ComponentTotals = { covered: 0, largest: 0 };
    const openingDwell = new Map<string, number>();
    const fullDwell = new Map<string, number>();
    const paths = rounds.map((row) => ({ row, ...pathMetrics(row) }));
    for (const row of rounds) {
      const shape = shapeByRound.get(`${row.matchId}\t${row.roundNumber}\t${row.teamKey}\t${row.side}`);
      if (shape) {
        addComponentWindows(openingComponents, shape.openingWindows, row.playerIndex);
        addComponentWindows(fullComponents, shape.windows, row.playerIndex);
      }
      for (const dwell of row.openingPositionGroupDwell) {
        const dwellKey = `${row.mapName}:${dwell.positionGroupId}`;
        openingDwell.set(dwellKey, (openingDwell.get(dwellKey) ?? 0) + dwell.seconds);
      }
      for (const dwell of row.positionGroupDwell) {
        const dwellKey = `${row.mapName}:${dwell.positionGroupId}`;
        fullDwell.set(dwellKey, (fullDwell.get(dwellKey) ?? 0) + dwell.seconds);
      }
    }
    const totalEligibleSeconds = rounds.reduce((sum, row) => sum + (row.eligibleSeconds ?? 0), 0);
    const features: TResponsibilityResearchFeatures = {
      dominantGroupStability: rounded(weighted(evidenceRows, (row) => row.spatial.dominantGroupStability, (row) => row.sample.eligibleRounds)),
      teamRelativeGroupShare: rounded(weighted(evidenceRows, (row) => row.spatial.teamRelativeGroupShare, (row) => row.sample.eligibleRounds)),
      openingIsolatedShare: rounded(weighted(evidenceRows, (row) => row.spatial.openingIsolatedShare, (row) => row.sample.eligibleRounds)),
      isolationShare: rounded(weighted(evidenceRows, (row) => row.spatial.isolationShare, (row) => row.sample.eligibleRounds)),
      delayedConvergenceShare: rounded(weighted(evidenceRows, (row) => row.spatial.delayedConvergenceRoundShare, (row) => row.sample.eligibleRounds)),
      movementSync: rounded(weighted(evidenceRows, (row) => row.spatial.movementSync, (row) => row.sample.eligibleRounds)),
      positionTopShare: rounded(weighted(evidenceRows, (row) => row.positionGroups[0]?.share ?? null, (row) => row.sample.eligibleRounds)),
      openingLargestShare: openingComponents.covered === 0 ? null : rounded(openingComponents.largest / openingComponents.covered),
      fullLargestShare: fullComponents.covered === 0 ? null : rounded(fullComponents.largest / fullComponents.covered),
      meanTeamCentroidDistance: rounded(weighted(rounds, (row) => row.meanTeamCentroidDistance, (row) => row.eligibleSeconds ?? 0)),
      openingPathDisplacement: rounded(weighted(paths, (row) => row.displacement, (row) => row.row.openingEligibleSeconds ?? 0)),
      openingPathTransitions: rounded(weighted(paths, (row) => row.transitions, (row) => row.row.openingEligibleSeconds ?? 0)),
      openingPositionEntropy: rounded(entropy(openingDwell)),
      fullPositionEntropy: rounded(entropy(fullDwell)),
      rejoinsPerMinute: totalEligibleSeconds === 0 ? null : rounded(60 * rounds.reduce((sum, row) => sum + row.rejoinTicks.length, 0) / totalEligibleSeconds),
    };
    const status = projectionStatus(evidenceRows, rounds);
    const score = status === "unknown" || status === "insufficient" ? null : scoreFrozenTResponsibilityFeatures(features);
    return tResponsibilityResearchProjectionSchema.parse({
      version: T_RESPONSIBILITY_RESEARCH_PROJECTION_VERSION,
      modelId: T_RESPONSIBILITY_RESEARCH_MODEL_ID,
      playerKey,
      teamKey,
      side: "t",
      status,
      candidate: score?.candidate ?? null,
      packScore: score?.packScore ?? null,
      lurkerScore: score?.lurkerScore ?? null,
      confidence: score?.confidence ?? null,
      sample: {
        observedRounds: rounds.length,
        eligibleRounds: evidenceRows.reduce((sum, row) => sum + row.sample.eligibleRounds, 0),
        eligibleSeconds: rounded(totalEligibleSeconds, 3)!,
        matchCount: new Set(rounds.map((row) => row.matchId)).size,
        mapCount: new Set(rounds.map((row) => row.mapName)).size,
        dataQuality: rounded(weighted(evidenceRows, (row) => row.sample.dataQuality, (row) => row.sample.eligibleRounds)),
      },
      features,
      matchIds: [...new Set(rounds.map((row) => row.matchId))].sort(),
      representativeRounds: evidenceRows.flatMap((row) => row.representativeRounds).sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber).slice(0, 8),
      basis: ["科隆 Major 冻结 15 特征同赛事 full-fit 诊断投影；正式 responsibility 保持不变。"],
      limitations: [
        "尚无新赛事外部验证；packScore / lurkerScore 不是校准概率。",
        "主狙职责必须由调用方依据独立 weapon duty 处理。",
        "Flexible 表示默认 0.60 confidence threshold 下 abstain，不是拟合的第三类。",
      ],
    });
  }).sort((a, b) => a.teamKey.localeCompare(b.teamKey) || a.playerKey.localeCompare(b.playerKey));
}
