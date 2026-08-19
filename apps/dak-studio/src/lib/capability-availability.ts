import { isAnalysisStale } from "./analysis-manifest.js";
import { getFactsStore } from "./facts-store.js";
import type { FactsStore } from "./fact-types.js";
import { getDerivedCacheStore, type DerivedCacheStore } from "./derived-cache.js";
import { matchIdForEntry, type StudioDemoEntry } from "./library.js";
import { listAvailableTris } from "./tri-assets.js";
import { createProducerManifestStore, producerStatus, type ProducerId, type ProducerStatus, PRODUCER_REVISIONS } from "./producer-manifest.js";
import { getStorage } from "./storage";

export type StudioCapability =
  | "personal-review"
  | "duel"
  | "economy"
  | "utility"
  | "lineup"
  | "control"
  | "tactical"
  | "map-role";

export type CapabilityStatus = "ready" | "partial" | "unavailable";
export type CapabilityOutputLevel = "observation" | "system-finding";
export type CapabilityRepairAction = "rebuild-facts" | "reimport-with-replay" | "reimport-with-shots" | "install-tri";

type FactKind = "insights" | "duel" | "economy" | "utility" | "lineup" | "tactical" | "map-intelligence";

export interface EntryCapabilityFacts {
  facts: Partial<Record<FactKind, boolean>>;
  producers?: Partial<Record<ProducerId, ProducerStatus>>;
  hasReplay: boolean;
  hasShots: boolean;
  hasTri: boolean;
}

export interface CapabilityDependencyAvailability {
  key: "replay" | "shots" | "tri";
  label: string;
  available: number;
  totalEligible: number;
  required: boolean;
}

export interface CapabilityExclusion {
  reason: string;
  count: number;
  entryIds: string[];
}

export interface CapabilityAvailability {
  capability: StudioCapability;
  status: CapabilityStatus;
  eligibleMatches: number;
  totalMatches: number;
  excluded: CapabilityExclusion[];
  dependencies: CapabilityDependencyAvailability[];
  repairActions: CapabilityRepairAction[];
  outputLevel: CapabilityOutputLevel;
}

interface CapabilityRequirement {
  requiredFacts?: FactKind[];
  requiredDependencies?: Array<CapabilityDependencyAvailability["key"]>;
  optionalDependencies?: Array<CapabilityDependencyAvailability["key"]>;
  outputLevel: CapabilityOutputLevel;
}

const REQUIREMENTS: Record<StudioCapability, CapabilityRequirement> = {
  "personal-review": { requiredFacts: ["insights"], outputLevel: "system-finding" },
  duel: { requiredFacts: ["duel"], optionalDependencies: ["shots", "tri"], outputLevel: "system-finding" },
  economy: { requiredFacts: ["economy"], outputLevel: "observation" },
  utility: { requiredFacts: ["utility"], outputLevel: "system-finding" },
  lineup: { requiredFacts: ["lineup"], optionalDependencies: ["replay"], outputLevel: "observation" },
  control: { requiredDependencies: ["replay"], optionalDependencies: ["tri"], outputLevel: "observation" },
  tactical: { requiredFacts: ["tactical", "map-intelligence"], optionalDependencies: ["replay"], outputLevel: "system-finding" },
  "map-role": { requiredFacts: ["map-intelligence"], outputLevel: "observation" },
};

const DEPENDENCY_LABEL: Record<CapabilityDependencyAvailability["key"], string> = {
  replay: "replay",
  shots: "shots/duels",
  tri: ".tri 静态碰撞",
};

const FACT_LABEL: Record<FactKind, string> = {
  insights: "个人复盘 facts",
  duel: "对枪 facts",
  economy: "经济 facts",
  utility: "道具 facts",
  lineup: "点位 facts",
  tactical: "战术 facts",
  "map-intelligence": "地图位置 facts",
};

const FACT_PRODUCER: Record<FactKind, ProducerId> = {
  insights: "base-facts",
  duel: "duel",
  economy: "base-facts",
  utility: "utility",
  lineup: "utility",
  tactical: "tactical",
  "map-intelligence": "map-intelligence",
};

function hasDependency(input: EntryCapabilityFacts, dependency: CapabilityDependencyAvailability["key"]): boolean {
  if (dependency === "replay") return input.hasReplay;
  if (dependency === "shots") return input.hasShots;
  return input.hasTri;
}

function repairForReason(reason: string): CapabilityRepairAction | null {
  if (reason === "facts 需要重建" || reason.endsWith("facts 缺失")) return "rebuild-facts";
  if (reason === "replay 缺失") return "reimport-with-replay";
  if (reason === "shots/duels 缺失") return "reimport-with-shots";
  return null;
}

function repairForDependency(dependency: CapabilityDependencyAvailability["key"]): CapabilityRepairAction {
  if (dependency === "replay") return "reimport-with-replay";
  if (dependency === "shots") return "reimport-with-shots";
  return "install-tri";
}

/**
 * 从已有 entry 元数据、facts 投影和本地可选资产汇总能力状态。
 * 缺失 never 被映射成 0：不可运行的比赛计入 excluded，不进入 eligible 分母。
 */
export function deriveCapabilityAvailability(
  entries: readonly StudioDemoEntry[],
  capability: StudioCapability,
  inputsByEntryId: ReadonlyMap<string, EntryCapabilityFacts>,
): CapabilityAvailability {
  const requirement = REQUIREMENTS[capability];
  const exclusions = new Map<string, string[]>();
  const eligible: Array<{ entry: StudioDemoEntry; input: EntryCapabilityFacts }> = [];
  let staleCoverage = 0;

  for (const entry of entries) {
    const input = inputsByEntryId.get(entry.id) ?? {
      facts: {}, hasReplay: entry.meta.hasReplay, hasShots: false, hasTri: false,
    };
    let reason: string | null = null;
    const missingFact = requirement.requiredFacts?.find((fact) => !input.facts[fact]);
    const unavailableProducer = requirement.requiredFacts?.find((fact) => {
      const status = input.producers?.[FACT_PRODUCER[fact]];
      return status === "missing" || status === "failed";
    });
    const usesStaleProducer = input.producers
      ? requirement.requiredFacts?.some((fact) => input.producers?.[FACT_PRODUCER[fact]] === "stale") ?? false
      : requirement.requiredFacts != null && isAnalysisStale(entry.builtWith);
    if (unavailableProducer) reason = `${FACT_LABEL[unavailableProducer]} 缺失`;
    else if (missingFact) reason = `${FACT_LABEL[missingFact]} 缺失`;
    else {
      const missingDependency = requirement.requiredDependencies?.find((dependency) => !hasDependency(input, dependency));
      if (missingDependency) reason = `${DEPENDENCY_LABEL[missingDependency]} 缺失`;
    }
    if (reason) {
      const ids = exclusions.get(reason) ?? [];
      ids.push(entry.id);
      exclusions.set(reason, ids);
    } else {
      eligible.push({ entry, input });
      if (usesStaleProducer) staleCoverage += 1;
    }
  }

  const dependencies = [...(requirement.requiredDependencies ?? []), ...(requirement.optionalDependencies ?? [])]
    .map((dependency) => ({
      key: dependency,
      label: DEPENDENCY_LABEL[dependency],
      available: eligible.filter(({ input }) => hasDependency(input, dependency)).length,
      totalEligible: eligible.length,
      required: requirement.requiredDependencies?.includes(dependency) ?? false,
    }));
  const optionalMissing = dependencies.some((dependency) => !dependency.required && dependency.available < dependency.totalEligible);
  const status: CapabilityStatus = eligible.length === 0
    ? "unavailable"
    : eligible.length < entries.length || optionalMissing || staleCoverage > 0 ? "partial" : "ready";
  const repairActions = [...new Set([
    ...[...exclusions.keys()].map(repairForReason),
    ...(staleCoverage > 0 ? ["rebuild-facts" as const] : []),
    ...dependencies.filter((dependency) => dependency.available < dependency.totalEligible).map((dependency) => repairForDependency(dependency.key)),
  ].filter((action): action is CapabilityRepairAction => action != null))];

  return {
    capability,
    status,
    eligibleMatches: eligible.length,
    totalMatches: entries.length,
    excluded: [...exclusions.entries()].map(([reason, entryIds]) => ({ reason, count: entryIds.length, entryIds })),
    dependencies,
    repairActions,
    outputLevel: requirement.outputLevel,
  };
}

function idsOf<T extends { matchId: string }>(rows: readonly T[]): Set<string> {
  return new Set(rows.map((row) => row.matchId));
}

/** 从 facts store 与本地 .tri 资产读取 availability 输入；不加载完整 ZIP 或重跑分析。 */
export async function loadCapabilityAvailabilityInputs(
  entries: readonly StudioDemoEntry[],
  factsStore: FactsStore = getFactsStore(),
  derivedStore: DerivedCacheStore = getDerivedCacheStore(),
  availableTris?: readonly string[],
): Promise<Map<string, EntryCapabilityFacts>> {
  const matchIds = entries.map(matchIdForEntry);
  const manifests = createProducerManifestStore(getStorage());
  const [insights, duels, economy, utilityMatchIds, lineups, tactical, playerPositions, teamShapes, mechanics] = await Promise.all([
    derivedStore.getPlayerInsights({ matchIds }),
    derivedStore.getDuels({ matchIds }),
    derivedStore.getTournament({ matchIds }),
    derivedStore.getUtilityValueMatchIds({ matchIds }),
    factsStore.getLineups({ matchIds }),
    factsStore.getTacticalRounds({ matchIds }),
    factsStore.getPlayerPositionRounds({ matchIds }),
    factsStore.getTeamShapeRounds({ matchIds }),
    factsStore.getMechanicsRows({ matchIds }),
  ]);
  const factSets = {
    insights: idsOf(insights),
    duel: idsOf(duels),
    economy: idsOf(economy),
    utility: new Set(utilityMatchIds),
    lineup: idsOf(lineups),
    tactical: idsOf(tactical),
    "map-intelligence": new Set([...idsOf(playerPositions)].filter((matchId) => idsOf(teamShapes).has(matchId))),
    mechanics: new Set(mechanics.map((row) => row.matchId)),
  };
  const tris = new Set(availableTris ?? await listAvailableTris());
  return new Map(await Promise.all(entries.map(async (entry) => {
    const matchId = matchIdForEntry(entry);
    const producerRecords = await manifests.getForMatch(matchId);
    const producers = producerRecords.length === 0 ? undefined : Object.fromEntries(producerRecords.map((record) => [
      record.producer,
      producerStatus(record, entry.id, PRODUCER_REVISIONS[record.producer]),
    ]));
    return [entry.id, {
      facts: {
        insights: factSets.insights.has(matchId),
        duel: factSets.duel.has(matchId),
        economy: factSets.economy.has(matchId),
        utility: factSets.utility.has(matchId),
        lineup: factSets.lineup.has(matchId),
        tactical: factSets.tactical.has(matchId),
        "map-intelligence": factSets["map-intelligence"].has(matchId),
      },
      producers,
      hasReplay: entry.meta.hasReplay,
      hasShots: factSets.mechanics.has(matchId),
      hasTri: tris.has(entry.meta.mapName),
    } satisfies EntryCapabilityFacts] as const;
  })));
}
